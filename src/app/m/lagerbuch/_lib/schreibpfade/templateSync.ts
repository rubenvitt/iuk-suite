/**
 * Vorlagen-Synchronisierung — MATERIALISIEREND, nicht live rechnend.
 *
 * Kein "use client". Laeuft transaktions-FREI; die Aufrufer (Actions, Teil 5)
 * uebergeben ihre `tx` als `db`, wenn Atomaritaet gefordert ist.
 *
 * WARUM MATERIALISIERT WIRD (§5.7.2): der Check-Flow liest AUSSCHLIESSLICH
 * `soll_positionen` (`template-sync.ts:13-17`). Eine live berechnete Vorlage waere
 * fuer ihn unsichtbar.
 *
 * ⚠️ EIN GRABSTEIN (`entfernt = true`) IST KEIN SOFT-DELETE. Er verhindert, dass
 * der Sync die Vorlagen-Position WIEDER ANLEGT. Wer `entfernt` missversteht und
 * die Zeilen VOR dem Sync wegfiltert, legt sie beim naechsten Sync wieder an
 * (Teil 1, T7).
 *
 * ⚠️ DIE ZWEI NEBENWEGE LIEGEN NICHT HIER: „Loesen" (`templates.ts:164-174`) und
 * „Vorlage aus Fahrzeug" (`:180-204`) sind Actions und gehoeren Teil 5. Sie stehen
 * mit ihrer Semantik in der Abgabetabelle — insbesondere die Paarung ueber den
 * Index (`:197-199`), die fragil AUSSIEHT und konstruktiv stimmt (dieselbe
 * Transaktion, dieselbe Quelle). Der Zusammenhang gehoert als Kommentar mit,
 * sonst wirkt `for (let i = 0; …)` wie ein Versehen und wird „repariert".
 */
import { eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { lagerorte, sollPositionen, templatePositionen, newId } from "../../_db/schema";
import type { Tx } from "./abbuchung";
import { bereinigeVerfallOhneAktivesSoll } from "./lagerortVerfall";

/** Die Rueckmeldung an die Oberflaeche — fuenf Zaehler, ueber alle Fahrzeuge
 *  summierbar, wenn eine GANZE Vorlage synchronisiert wird
 *  (`templates.ts:143-148`). Kein Protokoll, sondern Bedienrueckmeldung. */
export type SyncErgebnis = {
  /** neue Positionen aus der Vorlage materialisiert */
  hinzugefuegt: number;
  /** Vorlagen-Positionen an die Vorlage angeglichen */
  aktualisiert: number;
  /** manuell ueberschrieben oder als Grabstein entfernt → unangetastet */
  uebersprungen: number;
  /** in der Vorlage geloeschte Positionen aus dem Fahrzeug entfernt */
  entfernt: number;
  /** ueberschriebene Waisen zu manuellen Positionen gemacht */
  losgeloest: number;
};

/**
 * Gleicht die `soll_positionen` eines Fahrzeugs an seine Vorlage an.
 *
 * Vier Regeln, in dieser Reihenfolge:
 * 1. Vorlagen-Position ohne verknuepfte Fahrzeug-Zeile → anlegen.
 * 2. Verknuepfte Zeile mit `ueberschrieben` ODER `entfernt` → unangetastet.
 * 3. Sonst: nur schreiben, wenn sich `fachLabel`, `sort`, `artikelId` oder
 *    `soll` unterscheiden — als UPDATE der bestehenden Zeile, nie als
 *    Delete+Insert (die Zeilen-Identitaet ist Vertrag, `soll_positionen.id`
 *    steht in historischen `checks.ergebnis`-JSONs).
 * 4. Verwaiste Zeile (ihre Vorlagen-Position wurde geloescht): war sie
 *    `ueberschrieben`, wird sie von der Vorlage geloest und als manuelle Zeile
 *    behalten; sonst wird sie geloescht.
 *
 * Fuer ein Fahrzeug ohne Vorlage (`templateId === null`) ein No-Op.
 */
export function syncFahrzeugTemplate(db: DB | Tx, fahrzeugId: string): SyncErgebnis {
  const erg: SyncErgebnis = {
    hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0,
  };
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, fahrzeugId)).get();
  if (!fahrzeug || fahrzeug.typ !== "fahrzeug" || !fahrzeug.templateId) return erg;

  const tpRows = db.select().from(templatePositionen)
    .where(eq(templatePositionen.templateId, fahrzeug.templateId)).all();
  const tpById = new Map(tpRows.map((tp) => [tp.id, tp]));

  const existing = db.select().from(sollPositionen)
    .where(eq(sollPositionen.fahrzeugId, fahrzeugId)).all();
  const linkedByTp = new Map<string, (typeof existing)[number]>();
  const zuBereinigendeArtikelIds = new Set<string>();
  for (const row of existing) if (row.templatePositionId) linkedByTp.set(row.templatePositionId, row);

  // REGEL 1, 2 und 3 — je Vorlagen-Position.
  for (const tp of tpRows) {
    const row = linkedByTp.get(tp.id);
    if (!row) {
      // Regel 1: anlegen.
      db.insert(sollPositionen).values({
        id: newId(), fahrzeugId, fachLabel: tp.fachLabel, sort: tp.sort,
        artikelId: tp.artikelId, soll: tp.soll, templatePositionId: tp.id,
        ueberschrieben: false, entfernt: false,
      }).run();
      erg.hinzugefuegt += 1;
      continue;
    }
    if (row.ueberschrieben || row.entfernt) {
      // Regel 2: manuell angepasst ODER bewusst als Grabstein entfernt → in Ruhe
      // lassen. Ein Grabstein ist kein Soft-Delete — er wird hier nur NICHT
      // ueberschrieben, nicht wieder angelegt.
      erg.uebersprungen += 1;
      continue;
    }
    // Regel 3: unveraenderte Vorlagen-Zeile — nur schreiben, wenn sich etwas
    // geaendert hat. Ein bedingungsloses UPDATE waere kein Fehler, aber es
    // machte den `aktualisiert`-Zaehler wertlos, und der IST die Rueckmeldung.
    if (row.fachLabel !== tp.fachLabel || row.sort !== tp.sort ||
        row.artikelId !== tp.artikelId || row.soll !== tp.soll) {
      const bisherigerArtikelId = row.artikelId;
      db.update(sollPositionen)
        .set({ fachLabel: tp.fachLabel, sort: tp.sort,
               artikelId: tp.artikelId, soll: tp.soll })
        .where(eq(sollPositionen.id, row.id))
        .run();
      if (bisherigerArtikelId !== tp.artikelId) {
        zuBereinigendeArtikelIds.add(bisherigerArtikelId);
      }
      erg.aktualisiert += 1;
    }
  }

  // REGEL 4 — verwaiste Zeilen (die Vorlagen-Position wurde geloescht).
  for (const row of existing) {
    if (!row.templatePositionId || tpById.has(row.templatePositionId)) continue;
    if (row.ueberschrieben) {
      // Die Ueberschreibung war GEWOLLT → als manuelle Position erhalten, nur
      // von der Vorlage loesen.
      db.update(sollPositionen)
        .set({ templatePositionId: null, ueberschrieben: false })
        .where(eq(sollPositionen.id, row.id))
        .run();
      erg.losgeloest += 1;
    } else {
      db.delete(sollPositionen).where(eq(sollPositionen.id, row.id)).run();
      erg.entfernt += 1;
    }
    zuBereinigendeArtikelIds.add(row.artikelId);
  }

  // Erst nach ALLEN Mutationen bereinigen: Zwei Positionen koennen ihre Artikel
  // in einem Lauf tauschen. Eine Bereinigung zwischen den beiden UPDATEs saehe
  // dann kurzzeitig keinen aktiven Soll-Eintrag und loeschte gueltigen Verfall.
  for (const artikelId of zuBereinigendeArtikelIds) {
    bereinigeVerfallOhneAktivesSoll(db, fahrzeugId, artikelId);
  }

  return erg;
}
