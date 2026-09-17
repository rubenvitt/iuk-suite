"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, count, eq, isNull, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import {
  artikel,
  buchungen,
  bzGeraete,
  bzKontrollen,
  chargen,
  checks,
  geraete,
  inventurPositionen,
  lagerorte,
  o2Flaschen,
  o2Messungen,
  sollPositionen,
  templatePositionen,
  tokens,
} from "../_db/schema";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { parseCheckErgebnis } from "../_lib/checkErgebnis";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { ELEMENT_ARTEN, type ElementArt, type Loeschbarkeit } from "../_lib/loeschen";
import { loescheVerfallFuer } from "../_lib/schreibpfade/lagerortVerfall";
import { sperreToken } from "../_lib/schreibpfade/tokenSperre";
import { TOKEN_LOESCHGRUND } from "../_lib/tokenForm";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const ArtSchema = z.enum(ELEMENT_ARTEN);
const IdSchema = z.string().min(1);

const REVALIDATE: Record<ElementArt, string[]> = {
  artikel: ["/m/lagerbuch/verwaltung/artikel", "/m/lagerbuch/verwaltung"],
  /*
   * VIER PFADE FUER EINE ART, weil `lagerort` drei Flaechen traegt: ein
   * Fahrzeug steht unter „Fahrzeuge", ein Schrank unter „Lagerorte", und BEIDE
   * stehen in der Zugangsauswahl auf „Artikel" (dieselbe Begruendung, aus der
   * `_actions/lagerorte.ts` den Artikel-Pfad mitrevalidiert). Welcher der
   * ersten drei gemeint ist, weiss die Action nicht — sie kennt nur die ID —,
   * und ein Revalidieren zu viel kostet einen Rerender, ein Revalidieren zu
   * wenig zeigt einen geloeschten Ort weiter an.
   */
  lagerort: [
    "/m/lagerbuch/verwaltung/fahrzeuge",
    "/m/lagerbuch/verwaltung/lagerorte",
    "/m/lagerbuch/verwaltung/artikel",
    "/m/lagerbuch/verwaltung",
  ],
  token: ["/m/lagerbuch/verwaltung/tokens"],
  bzGeraet: ["/m/lagerbuch/verwaltung/bz"],
  o2Flasche: ["/m/lagerbuch/verwaltung/sauerstoff"],
  geraet: ["/m/lagerbuch/verwaltung/geraete"],
};

const FESTER_LOESCHFEHLER =
  "Dieser Eintrag hängt noch an anderen Daten und kann nicht gelöscht werden.";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Leser = DB | Tx;

function anzahl(db: Leser, tabelle: SQLiteTable, wo: SQL): number {
  return db.select({ n: count() }).from(tabelle).where(wo).get()?.n ?? 0;
}

function plural(n: number, ein: string, mehr: string): string {
  return `${n} ${n === 1 ? ein : mehr}`;
}

function verknuepftGrund(teile: string[]): string {
  return `Noch mit ${teile.join(", ")} verknüpft — Löschen würde den Nachweis zerstören.`;
}

function pruefeArtikel(db: Leser, id: string): Loeschbarkeit {
  const buch = anzahl(db, buchungen, eq(buchungen.artikelId, id));
  const chg = anzahl(db, chargen, eq(chargen.artikelId, id));
  const soll = anzahl(db, sollPositionen, eq(sollPositionen.artikelId, id));
  const vorlage = anzahl(db, templatePositionen, eq(templatePositionen.artikelId, id));
  const inventur = anzahl(db, inventurPositionen, eq(inventurPositionen.artikelId, id));
  const codes = anzahl(db, tokens, and(
    eq(tokens.zielTyp, "artikel"),
    eq(tokens.zielId, id),
  )!);

  if (buch + chg + soll + vorlage + inventur + codes === 0) return { loeschbar: true };

  const teile: string[] = [];
  if (buch) teile.push(plural(buch, "Buchung", "Buchungen"));
  if (chg) teile.push(plural(chg, "Charge", "Chargen"));
  if (soll) teile.push(plural(soll, "Soll-Position", "Soll-Positionen"));
  if (vorlage) {
    teile.push(plural(vorlage, "Vorlagen-Position", "Vorlagen-Positionen"));
  }
  if (inventur) {
    teile.push(plural(inventur, "Inventurposition", "Inventurpositionen"));
  }
  if (codes) teile.push(plural(codes, "Zugangs-Code", "Zugangs-Codes"));
  return {
    loeschbar: false,
    grund: verknuepftGrund(teile),
    kannDeaktivieren: true,
  };
}

/**
 * DRK-349 — die Pruefung fuer JEDEN Ort: Handlager, Fahrzeug, Schrank.
 *
 * ⚠️ SIE IST DAS EINZIGE TOR. Frueher stand daneben im Loeschzweig ein
 * `WHERE typ = 'fahrzeug'` als zweiter, stiller Riegel; ein Schrank kam durch
 * die Pruefung, fiel am Riegel und die Aktion meldete trotzdem Erfolg. Der
 * Riegel ist weg — was hier nicht abgelehnt wird, wird wirklich geloescht.
 * Deshalb faengt die Pruefung jetzt bei der Frage an, ob es die Zeile
 * ueberhaupt gibt: ohne sie loeschte ein unbekanntes `id` null Zeilen und
 * meldete wieder Erfolg, nur mit einer anderen Ursache.
 */
function pruefeLagerort(db: Leser, id: string): Loeschbarkeit {
  if (id === HANDLAGER_ID) {
    return {
      loeschbar: false,
      grund: "Das Handlager ist der feste Bezugspunkt jeder Buchung und kann nicht entfernt werden.",
      kannDeaktivieren: false,
    };
  }

  if (anzahl(db, lagerorte, eq(lagerorte.id, id)) === 0) {
    return {
      loeschbar: false,
      grund: "Diesen Lagerort gibt es nicht mehr — die Liste ist vermutlich veraltet.",
      kannDeaktivieren: false,
    };
  }

  /*
   * DER KINDERRIEGEL BEKOMMT EINEN EIGENEN SATZ, nicht eine Zeile in der
   * Verknuepfungsliste unten: ein Schrank IM Ort ist kein Nachweis, den das
   * Loeschen zerstoerte, sondern ein Hindernis, das die verwaltende Person
   * selbst wegraeumen kann. „Noch mit 2 Schraenken verknuepft — Loeschen wuerde
   * den Nachweis zerstoeren" naehme ihr genau diese Auskunft.
   */
  const kinder = anzahl(db, lagerorte, eq(lagerorte.parentId, id));
  if (kinder > 0) {
    return {
      loeschbar: false,
      grund: `Hier hängen noch ${plural(kinder, "Schrank", "Schränke")} darin — lösche sie zuerst.`,
      kannDeaktivieren: true,
    };
  }

  const buch = anzahl(db, buchungen, eq(buchungen.lagerortId, id));
  const soll = anzahl(db, sollPositionen, eq(sollPositionen.fahrzeugId, id));
  const chk = anzahl(db, checks, eq(checks.fahrzeugId, id));
  const bzGer = anzahl(db, bzGeraete, eq(bzGeraete.lagerortId, id));
  const ger = anzahl(db, geraete, eq(geraete.lagerortId, id));
  const flaschen = anzahl(db, o2Flaschen, eq(o2Flaschen.lagerortId, id));
  /*
   * ⚠️ NUR CODES OHNE ZUGEHOERIGKEIT ZAEHLEN — DRK-406, und ohne diese Zeile
   * waere ab sofort KEINE neu angelegte Einheit mehr loeschbar. `createFahrzeug`
   * legt ihr seit dem Ticket sofort einen ORTSCODE an, und der traegt
   * `ziel_typ = "fahrzeug"` mit `ziel_id = <Einheit>` — also genau das, was
   * diese Zaehlung bis eben als „jemand hat ein Kaertchen darauf ausgestellt"
   * gelesen hat. Der Zaehler stuende damit fuer jede Einheit ab der ersten
   * Sekunde auf 1, und der Grund („1 Zugangs-Code") klaenge nach einer
   * Entscheidung, die niemand getroffen hat.
   *
   * ⚠️ DER UNTERSCHIED IST DIE HERKUNFT, NICHT DIE FORM. Ein Code mit `ort_id`
   * ist ein Artefakt DIESER Einheit — er entsteht mit ihr und geht mit ihr
   * (`loescheElement` sperrt ihn und loest die Bindung, siehe dort). Ein Code
   * OHNE `ort_id` ist Altbestand: den hat jemand von Hand auf diese Einheit
   * ausgestellt und laminiert, und DER ist weiterhin ein Grund, die Einheit
   * nicht wegzuwerfen.
   */
  const codes = anzahl(db, tokens, and(
    eq(tokens.zielTyp, "fahrzeug"),
    eq(tokens.zielId, id),
    isNull(tokens.ortId),
  )!);

  if (buch + soll + chk + bzGer + ger + flaschen + codes === 0) {
    return { loeschbar: true };
  }

  const teile: string[] = [];
  if (buch) teile.push(plural(buch, "Buchung", "Buchungen"));
  if (soll) teile.push(plural(soll, "Soll-Position", "Soll-Positionen"));
  if (chk) teile.push(plural(chk, "Check", "Checks"));
  if (bzGer) teile.push(plural(bzGer, "BZ-Gerät", "BZ-Geräten"));
  if (ger) teile.push(plural(ger, "Gerät", "Geräten"));
  if (flaschen) teile.push(plural(flaschen, "O₂-Flasche", "O₂-Flaschen"));
  if (codes) teile.push(plural(codes, "Zugangs-Code", "Zugangs-Codes"));
  return {
    loeschbar: false,
    grund: verknuepftGrund(teile),
    kannDeaktivieren: true,
  };
}

/**
 * ENTSCHEIDUNG 8-F (§8.3): der Code-Namensraum wird gegen Wiederverwendung
 * gesperrt. Ein Zugangs-Code kann nur noch gesperrt werden; sein Code bleibt
 * fuer immer belegt.
 *
 * WAS AN DIE STELLE VON `pruefeToken` TRITT: eine Konstante. Die BEDINGTE
 * Pruefung („loeschbar, solange keine Buchung mit `quelleTyp="token"` auf den
 * `code` zeigt") entfaellt ersatzlos — mit ihr faellt der einzige Weg, auf dem
 * ein Code wieder frei werden konnte: nie eingeloest ⇒ keine Buchung ⇒
 * loeschbar ⇒ ein spaeter ausgestelltes Kaertchen erbt den Code, und weil
 * `tokens.code` zugleich der Anzeigeschluessel im Journal ist (1:1-Pflicht 6),
 * erschienen historische Zeilen danach unter dem NEUEN Label.
 *
 * `last_used_at` ist danach KEIN Loeschbarkeitsschalter mehr, sondern nur noch
 * die Auskunft „nie benutzt" auf der Code-Tabelle. Beim Import wandert es
 * weiterhin vollstaendig mit (§4.12, 1:1-Pflicht 5).
 *
 * OHNE DATENBANKZUGRIFF: die Ablehnung haengt an keiner Zeile und an keinem
 * Zaehler mehr. Es gibt keinen Zustand, in dem sie ausbleibt.
 *
 * ⚠️ 8-F ist eine Ausnahme fuer TOKENS, keine neue Regel fuer das Modul: der
 * Hard-Delete der uebrigen fuenf Objektarten bleibt (§5.21).
 */
const TOKEN_UNLOESCHBAR: Loeschbarkeit = {
  loeschbar: false,
  grund: TOKEN_LOESCHGRUND,
  kannDeaktivieren: true,
};

function pruefeBzGeraet(db: Leser, id: string): Loeschbarkeit {
  const kontrollen = anzahl(db, bzKontrollen, eq(bzKontrollen.geraetId, id));
  if (kontrollen === 0) return { loeschbar: true };
  return {
    loeschbar: false,
    grund: verknuepftGrund([plural(kontrollen, "Kontrolle", "Kontrollen")]),
    kannDeaktivieren: true,
  };
}

function pruefeO2Flasche(db: Leser, id: string): Loeschbarkeit {
  const messungen = anzahl(db, o2Messungen, eq(o2Messungen.flascheId, id));
  if (messungen === 0) return { loeschbar: true };
  return {
    loeschbar: false,
    grund: verknuepftGrund([plural(messungen, "Messung", "Messungen")]),
    kannDeaktivieren: true,
  };
}

function pruefeGeraet(db: Leser, id: string): Loeschbarkeit {
  const checkAnzahl = db.select({ ergebnis: checks.ergebnis })
    .from(checks)
    .all()
    .filter(({ ergebnis }) => {
      const geparst = parseCheckErgebnis(ergebnis);
      return geparst.version === 2
        && geparst.geraete.some((eintrag) => eintrag.geraetId === id);
    }).length;

  if (checkAnzahl === 0) return { loeschbar: true };
  return {
    loeschbar: false,
    grund: verknuepftGrund([plural(checkAnzahl, "Check", "Checks")]),
    kannDeaktivieren: true,
  };
}

function pruefe(db: Leser, art: ElementArt, id: string): Loeschbarkeit {
  switch (art) {
    case "artikel": return pruefeArtikel(db, id);
    case "lagerort": return pruefeLagerort(db, id);
    case "token": return TOKEN_UNLOESCHBAR;
    case "bzGeraet": return pruefeBzGeraet(db, id);
    case "o2Flasche": return pruefeO2Flasche(db, id);
    case "geraet": return pruefeGeraet(db, id);
  }
}

export async function pruefeLoeschbar(
  art: ElementArt,
  id: string,
  db: DB = getDb(),
): Promise<ActionErgebnis<Loeschbarkeit>> {
  await requireLagerbuchAdmin();

  try {
    const a = ArtSchema.parse(art);
    const i = IdSchema.parse(id);
    const status = pruefe(db, a, i);
    if (status.loeschbar) return { ok: true, wert: status };
    return { ok: true, wert: status };
  } catch {
    return { ok: false, fehler: "Ungültige Anfrage." };
  }
}

export async function loescheElement(
  art: ElementArt,
  id: string,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {

    let a: ElementArt;
    let i: string;
    try {
      a = ArtSchema.parse(art);
      i = IdSchema.parse(id);
    } catch {
      return { ok: false, fehler: "Ungültige Anfrage." };
    }

    let status: Loeschbarkeit;
    try {
      status = db.transaction((tx) => {
        const aktuell = pruefe(tx, a, i);
        if (!aktuell.loeschbar) return aktuell;

        switch (a) {
          case "artikel":
            loescheVerfallFuer(tx, "artikel", i);
            tx.delete(artikel).where(eq(artikel.id, i)).run();
            break;
          case "lagerort":
            loescheVerfallFuer(tx, "lagerort", i);
            /*
             * DER ORTSCODE GEHT MIT — DRK-406, und er wird GESPERRT, nicht
             * geloescht.
             *
             * ⚠️ OHNE DIESE ZEILE SCHLAEGT DAS `DELETE` DARUNTER FEHL: auf
             * `tokens.ort_id` liegt ein Fremdschluessel, und `foreign_keys` ist
             * in dieser Verbindung AN (`core/db`). Die Aktion braeche mit einem
             * Datenbankfehler ab, obwohl `pruefeLagerort` die Loeschung gerade
             * erlaubt hat — und der Grund staende in keiner Meldung.
             *
             * ⚠️ `aktiv = false` UND NICHT `DELETE`: Entscheidung 8-F haelt den
             * Codewert dauerhaft belegt. Die Zeile verschwinden zu lassen gaebe
             * ihn zur Wiederverwendung frei, und eine alte Journalzeile stuende
             * danach unter der Bezeichnung eines neuen Codes.
             *
             * ⚠️ `ort_id = null` IST DER PREIS, und er ist unvermeidlich: der
             * Ort, auf den sie zeigte, existiert gleich nicht mehr. Was die
             * Karte war, steht weiterhin im `label` der Zeile.
             *
             * ⚠️ UND GENAU DESHALB `ersetztAm` — ohne das Feld waere dieser
             * Preis eine Luecke (gefunden in der Durchsicht). Sobald `ort_id`
             * weg ist, sieht die gesperrte Zeile aus wie Altbestand, und der
             * DARF reaktiviert werden (Betreiberentscheidung 17.09.2026): ein
             * Klick in der Codeverwaltung machte den Code einer geloeschten
             * Einheit wieder gueltig. `ersetztAm` ueberlebt den Verlust der
             * `ort_id` und ist der Riegel dagegen (`_actions/tokens.ts`).
             */
            tx.update(tokens)
              .set({ aktiv: false, ortId: null, ersetztAm: new Date() })
              .where(and(eq(tokens.ortId, i), isNull(tokens.ersetztAm))!)
              .run();
            /*
             * ⚠️ ZWEI ANWEISUNGEN, UND DIE TRENNUNG IST DER AUDITWERT DER
             * SPALTE — gefunden in der Durchsicht. Das `UPDATE` darueber trifft
             * ALLE Codes dieses Ortes, auch die laengst zurueckgesetzten
             * Vorgaenger; mit einem gemeinsamen `set` haette es deren
             * `ersetztAm` auf den Loeschtag ueberschrieben. Die Liste naennte
             * dann fuer ein altes Foto einen Tag, an dem es laengst nicht mehr
             * galt — und genau diese Frage soll der Zeitstempel beantworten.
             * Die erste Anweisung setzt ihn nur, wo noch keiner steht; die
             * zweite loest die Bindung fuer alle.
             */
            tx.update(tokens)
              .set({ aktiv: false, ortId: null })
              .where(eq(tokens.ortId, i))
              .run();
            // ⚠️ OHNE `eq(lagerorte.typ, "fahrzeug")`, UND DAS IST DER FIX VON
            // DRK-349: dieser Zusatz war ein zweiter Riegel hinter der
            // Pruefung, und er lehnte nicht ab, sondern loeschte nur nichts.
            // Ein Schrank (`typ: "lager"`) blieb stehen, waehrend die Aktion
            // `{ ok: true }` meldete. Die Zulaessigkeit entscheidet allein
            // `pruefeLagerort` — hier steht danach kein Urteil mehr.
            tx.delete(lagerorte).where(eq(lagerorte.id, i)).run();
            break;
          // ——— HIER STAND `case "token"`, UND HIER FEHLT ER ABSICHTLICH ———
          // 8-F: `token` erreicht diesen switch nie — `pruefe()` steigt weiter
          // oben mit `loeschbar: false` aus. Ein wiederhergestelltes
          // `case "token"` waere die Ruecknahme von 8-F. TypeScript verlangt hier
          // keine Vollstaendigkeit (der Block laeuft danach in `return aktuell;`),
          // und ein `default` mit `throw` waere schaedlich: das umgebende `catch`
          // verschluckte ihn und machte aus der benannten Ablehnung den festen
          // Sammelfehler. Der folgende Zweig gehoert NICHT zu diesem Absatz.

          case "bzGeraet":
            tx.delete(bzGeraete).where(eq(bzGeraete.id, i)).run();
            break;
          case "o2Flasche":
            tx.delete(o2Flaschen).where(eq(o2Flaschen.id, i)).run();
            break;
          case "geraet":
            tx.delete(geraete).where(eq(geraete.id, i)).run();
            break;
        }
        return aktuell;
      });
    } catch {
      return { ok: false, fehler: FESTER_LOESCHFEHLER };
    }

    if (!status.loeschbar) return { ok: false, fehler: status.grund };

    for (const pfad of REVALIDATE[a]) revalidatePath(pfad);
    return { ok: true };
  });
}

export async function deaktiviereElement(
  art: ElementArt,
  id: string,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {

    let a: ElementArt;
    let i: string;
    try {
      a = ArtSchema.parse(art);
      i = IdSchema.parse(id);
    } catch {
      return { ok: false, fehler: "Ungültige Anfrage." };
    }

    if (a === "lagerort" && i === HANDLAGER_ID) {
      return { ok: false, fehler: "Das Handlager kann nicht deaktiviert werden." };
    }

    switch (a) {
      case "artikel":
        db.update(artikel).set({ aktiv: false }).where(eq(artikel.id, i)).run();
        break;
      case "lagerort":
        db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, i)).run();
        break;
      /*
       * ⚠️ NICHT `set({ aktiv: false })` — DER SPERRWEG LIEGT IN `tokenSperre.ts`.
       * Ein Ortscode, der hier gesperrt wird, muss seinen Tag bekommen wie
       * jeder andere auch; stand er hier nackt, bekaeme die Zeile spaeter den
       * LOESCHTAG des Ortes statt des Sperrtages (Begruendung dort, DRK-413).
       */
      case "token":
        sperreToken(db, i);
        break;
      case "bzGeraet":
        db.update(bzGeraete).set({ aktiv: false }).where(eq(bzGeraete.id, i)).run();
        break;
      case "o2Flasche":
        db.update(o2Flaschen).set({ aktiv: false }).where(eq(o2Flaschen.id, i)).run();
        break;
      case "geraet":
        db.update(geraete).set({ aktiv: false }).where(eq(geraete.id, i)).run();
        break;
    }

    for (const pfad of REVALIDATE[a]) revalidatePath(pfad);
    return { ok: true };
  });
}
