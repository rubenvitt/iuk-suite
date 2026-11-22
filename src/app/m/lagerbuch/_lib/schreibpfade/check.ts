/**
 * Der gemeinsame Kern jedes Checks — Helfer-Check (`_actions/check.ts`, Funktion
 * `checkAbschluss`) und Verwaltungscheck. Kein "use server", kein "use client".
 *
 * Alles hier läuft transaktions-FREI im `tx` des Aufrufers und WIRFT bei einer
 * Eingabe, die die Oberfläche nie erzeugt (fremde Position, fremdes Gerät …).
 * Ein Wurf rollt die ganze Transaktion zurück; ein Rückgabewert täte das nicht.
 *
 * NICHT hier: Riegel, Ergebnisform und Rückmeldung — die sind je Action eigen.
 * Ebenso das, was nur der Helfer-Check kennt (Nachfüll- und Box-Wunsch je
 * Position, Plomben ABLESEN im Kurzcheck).
 */
import { eq } from "drizzle-orm";
import {
  checks, geraete, lagerorte, newId, o2Flaschen, o2Messungen, plomben, sollPositionen,
} from "../../_db/schema";
import { CHECK_MESSUNG, ZUSTAND_DEFEKT, type Zustand } from "../konstanten";
import { o2Status } from "../domain/o2";
import { ortsartAus, punktFuerGeraet } from "../maengel/checkliste";
import { legeMangelAn, offenerMangelZuGeraet, type NeuerMangel } from "../maengel/daten";
import type { CheckFlascheRoh, CheckGeraetRoh, CheckPlombeRoh } from "../checkErgebnis";
import type { Quelle, Tx } from "./abbuchung";

/** Eine Soll-Position der Einheit, OHNE Grabsteine (`entfernt`) — die filtert der Aufrufer. */
export type SollRow = typeof sollPositionen.$inferSelect;

/** Die gezählten Fächer EINES Artikels. Der Fahrzeugbestand ist je (Artikel, Lagerort), nicht je Fach. */
export type ZaehlGruppe = {
  artikelId: string;
  positionen: string[];
  sollSumme: number;
  istSumme: number;
  /**
   * Summe von „OK bis" über die Fächer (ein Fach ohne Bereich zählt mit seinem
   * Soll). Nur gesetzt, wenn wenigstens ein Fach einen Bereich hat — wie
   * `sollMax` an der Position im Ergebnis-JSON.
   */
  sollMax?: number;
};

/**
 * Fasst die gezählten Positionen je Artikel zusammen.
 *
 * IDA-222 — EIN ARTIKEL WIRD GANZ ODER GAR NICHT GEZÄHLT. Der Abgleich setzt den
 * Bestand je Artikel auf die Summe der gezählten Fächer. Fehlt eines, wäre das
 * eine Teilsumme — und die Korrekturbuchung landet unwiderruflich im Journal.
 */
export function gruppiereZaehlung(
  sollRows: SollRow[],
  positionen: { sollPositionId: string; ist: number }[],
): Map<string, ZaehlGruppe> {
  const byId = new Map(sollRows.map((s) => [s.id, s]));
  const gruppen = new Map<string, ZaehlGruppe & { mitBereich: boolean; obergrenze: number }>();
  const gesehen = new Set<string>();
  for (const p of positionen) {
    const row = byId.get(p.sollPositionId);
    // WURF 1 von 4 (§7.3, Riegelfall — nicht „erwartbar", sondern „manipuliert").
    if (!row) throw new Error("Soll-Position gehört nicht zu diesem Fahrzeug");
    // Derselbe Riegelfall: doppelt zählte das Ist doppelt, und die Fächerzahl unten stimmte trotzdem.
    if (gesehen.has(row.id)) throw new Error("Soll-Position wurde doppelt gezählt");
    gesehen.add(row.id);
    const g = gruppen.get(row.artikelId) ?? {
      artikelId: row.artikelId, positionen: [], sollSumme: 0, istSumme: 0, mitBereich: false, obergrenze: 0,
    };
    const bereich = row.sollMax != null && row.sollMax > row.soll;
    g.positionen.push(row.id);
    g.sollSumme += row.soll;
    g.istSumme += p.ist;
    g.obergrenze += bereich ? row.sollMax! : row.soll;
    g.mitBereich ||= bereich;
    gruppen.set(row.artikelId, g);
  }
  const ergebnis = new Map<string, ZaehlGruppe>();
  for (const { mitBereich, obergrenze, ...g } of gruppen.values()) {
    const alle = sollRows.filter((r) => r.artikelId === g.artikelId).length;
    if (g.positionen.length !== alle) {
      throw new Error("Ein Artikel wurde nur in einem Teil seiner Fächer gezählt");
    }
    ergebnis.set(g.artikelId, mitBereich ? { ...g, sollMax: obergrenze } : g);
  }
  return ergebnis;
}

/** Eine Geräteantwort aus dem Check. `selbsttest` zählt nur bei einem Gerät mit dieser Frage (IDA-411). */
export type GeraetAntwort = {
  geraetId: string;
  vorhanden: boolean;
  zustand?: Zustand;
  bemerkung?: string;
  selbsttest?: boolean;
};

/**
 * Geräte an der Einheit (standort-basiert): nur Geräte, die wirklich HIER
 * stehen. Zustand und Bemerkung als Snapshot.
 *
 * IDA-377 — „fehlt", „Defekt" und ein durchgefallener Selbsttest WERDEN EIN
 * MANGEL, ohne weiteren Handgriff: am Gerät, unter Mängel und im Sofort-Push
 * wie jede andere Meldung. Ist zu diesem Gerät schon einer offen, bleibt es bei
 * dem einen.
 */
export function bucheGeraeteAntworten(
  tx: Tx,
  a: {
    fahrzeug: Pick<typeof lagerorte.$inferSelect, "id" | "typ" | "einheitenart">;
    antworten: GeraetAntwort[];
    quelle: NeuerMangel["quelle"];
    checkId: string;
  },
): { ergebnis: CheckGeraetRoh[]; auffaellig: number; gemeldet: number } {
  let auffaellig = 0;
  let gemeldet = 0;
  const geraeteHier = new Map(
    tx.select({ id: geraete.id, selbsttest: geraete.selbsttest }).from(geraete)
      .where(eq(geraete.lagerortId, a.fahrzeug.id)).all().map((g) => [g.id, g.selbsttest]),
  );
  const ortsart = ortsartAus(a.fahrzeug);
  const ergebnis = a.antworten.map((e): CheckGeraetRoh => {
    if (!geraeteHier.has(e.geraetId)) throw new Error("Gerät gehört nicht zu diesem Fahrzeug");   // WURF 2
    const selbsttest = e.vorhanden && geraeteHier.get(e.geraetId) === true ? e.selbsttest : undefined;
    const selbsttestDurchgefallen = selbsttest === false;
    if (!e.vorhanden || e.zustand === ZUSTAND_DEFEKT || selbsttestDurchgefallen) {
      auffaellig++;
      if (!offenerMangelZuGeraet(tx, e.geraetId)) {
        legeMangelAn(tx, {
          lagerortId: a.fahrzeug.id,
          punkte: [punktFuerGeraet(ortsart, !e.vorhanden)],
          // IDA-411: ein durchgefallener Selbsttest sagt es selbst, die Bemerkung steht dahinter.
          beschreibung: selbsttestDurchgefallen
            ? ["Selbsttest nicht bestanden", e.bemerkung].filter(Boolean).join(" — ")
            : e.bemerkung || null,
          melderName: null,
          quelle: a.quelle,
          fotos: 0,
          jetzt: new Date(),
          geraetId: e.geraetId,
          checkId: a.checkId,
        });
      }
      gemeldet++;
    }
    return {
      geraetId: e.geraetId, vorhanden: e.vorhanden,
      zustand: e.zustand ?? null, bemerkung: e.bemerkung ?? null,
      ...(selbsttest !== undefined ? { selbsttest } : {}),
    };
  });
  return { ergebnis, auffaellig, gemeldet };
}

/**
 * Sauerstoff: je Flasche eine Messung in `o2Messungen` (Kommentar
 * `<CHECK_MESSUNG> <referenz>`) und der Snapshot fürs Ergebnis-JSON.
 */
export function bucheFlaschenMessungen(
  tx: Tx,
  a: { fahrzeugId: string; flaschen: { flascheId: string; druckBar: number }[]; quelle: Quelle; referenz: string },
): { ergebnis: CheckFlascheRoh[]; auffaellig: number; nichtBewertbar: number } {
  let auffaellig = 0;
  let nichtBewertbar = 0;
  const flaschenHier = new Map(
    tx.select().from(o2Flaschen).where(eq(o2Flaschen.lagerortId, a.fahrzeugId)).all()
      .map((f) => [f.id, f]),
  );
  const ergebnis = a.flaschen.map((e): CheckFlascheRoh => {
    const f = flaschenHier.get(e.flascheId);
    if (!f) throw new Error("Flasche gehört nicht zu diesem Fahrzeug");   // WURF 3
    tx.insert(o2Messungen).values({
      id: newId(), flascheId: e.flascheId, ts: new Date(), druckBar: e.druckBar,
      ...a.quelle, kommentar: `${CHECK_MESSUNG} ${a.referenz}`,
    }).run();

    // §5.12, §7.9.4: eine Flasche OHNE bekannten Nennfuelldruck ist NICHT
    // BEWERTBAR, nicht „niedrig". `fuellstandProzent` gibt bei
    // `nennfuelldruckBar <= 0` eine 0 zurueck (in `o2.ts`), und `o2Status` macht
    // daraus ampel "rot" mit `niedrig: true` — die Flasche erschiene als
    // niedrig, obwohl sie schlicht nicht bewertbar ist, UND DIE HELFERIN
    // LIEFE LOS, UM EINE VOLLE FLASCHE ZU TAUSCHEN.
    //
    // Die MESSUNG wird trotzdem geschrieben: sie ist Rohdatum und bleibt
    // richtig, auch wenn die Bewertung fehlt.
    if (f.nennfuelldruckBar <= 0) nichtBewertbar++;
    // Der Grenzwert kommt aus DIESER Flasche (DRK-308) — `flaschenHier` ist
    // die Stammzeile, nicht der Snapshot. Fehlte er hier, zaehlte der Check
    // gegen die Vorbelegung, waehrend die Uebersicht daneben gegen die
    // eingestellte Vorgabe zaehlt: zwei Zahlen fuer dieselbe Frage.
    else if (o2Status(e.druckBar, f.nennfuelldruckBar, f.wechselAbProzent).niedrig) {
      auffaellig++;
    }

    // Nennfuelldruck als Snapshot mitschreiben, damit der Fuellstand spaeter
    // auch dann rekonstruierbar ist, wenn die Flasche umkonfiguriert oder
    // geloescht wird.
    //
    // ⚠️ `<= 0` WIRD ALS `null` GESCHRIEBEN, NICHT ALS 0. `CheckFlascheRoh`
    // (`_lib/checkErgebnis.ts`) fuehrt DREI verschiedene Zustaende: eine
    // Zahl = Snapshot, `undefined` = Snapshot fehlt (jeder Altcheck), `null` =
    // ausdruecklich „unbekannt" — und diese Funktion ist der Schreiber, den der
    // Kommentar dort mit „ab jetzt geschrieben" meint.
    //
    // Eine geschriebene `0` ist dagegen eine ZAHL und passiert jeden
    // `??`-Riegel des Lesers ungebremst (`_lib/lesepfade/checks.ts` prueft
    // `nenn === null`); `o2Status(druck, 0)` liefert 0 %, ampel „rot" und
    // `niedrig: true`. Der historische Nachweis behauptete dann eine NIEDRIGE
    // Flasche, wo bloss die Bezugsgroesse fehlt — dieselbe Falle, die
    // `nichtBewertbar` darueber im Live-Zweig abfaengt.
    return {
      flascheId: e.flascheId,
      druckBar: e.druckBar,
      nennfuelldruckBar: f.nennfuelldruckBar > 0 ? f.nennfuelldruckBar : null,
    };
  });
  return { ergebnis, auffaellig, nichtBewertbar };
}

/**
 * Plomben SETZEN (Vollcheck, Verwaltungscheck): nur aktive Plomben der Einheit.
 * Eine leere Nummer heißt „nicht neu gesetzt" — die Plombe bleibt, wie sie war.
 * Das ABLESEN im Kurzcheck bleibt in `checkAbschluss`.
 */
export function setzePlombenNummern(
  tx: Tx,
  a: { lagerortId: string; eintraege: { plombeId: string; nummer: string | null }[] },
): CheckPlombeRoh[] {
  const plombenHier = new Map(
    tx.select().from(plomben).where(eq(plomben.lagerortId, a.lagerortId)).all()
      .filter((p) => p.aktiv)
      .map((p) => [p.id, p]),
  );
  const ergebnis: CheckPlombeRoh[] = [];
  for (const e of a.eintraege) {
    const pl = plombenHier.get(e.plombeId);
    if (!pl) throw new Error("Plombe gehört nicht zu diesem Fahrzeug");
    if (!e.nummer) continue;
    tx.update(plomben).set({ nummer: e.nummer, gesetztAt: new Date() })
      .where(eq(plomben.id, pl.id)).run();
    ergebnis.push({ plombeId: pl.id, bezeichnung: pl.bezeichnung, gesetzt: e.nummer });
  }
  return ergebnis;
}

/**
 * Die `checks`-Zeile. Das Ergebnis-Objekt baut der Aufrufer.
 *
 * ⚠️ DIE FELDNAMEN IM ERGEBNIS SIND NICHT UMBENENNBAR (§4.10, 1:1-Pflicht 2) —
 * sonst wird jede historische Auswertung stumm 0 (`parseCheckErgebnis`).
 */
export function schreibeCheckZeile(
  tx: Tx,
  a: { id: string; fahrzeugId: string; quelle: Quelle; ergebnis: object },
): void {
  tx.insert(checks).values({
    id: a.id, fahrzeugId: a.fahrzeugId, ...a.quelle,
    startedAt: new Date(), completedAt: new Date(),
    ergebnis: JSON.stringify(a.ergebnis),
  }).run();
}
