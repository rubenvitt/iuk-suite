"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel, chargen, lagerorte, lagerortVerfall } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
import { RUECKLAUF_KOMMENTAR, ausDieserEinheit } from "../_lib/konstanten";
import { restJeChargeFuerArtikelAnOrt } from "../_lib/lesepfade/bestand";
import { zugangsZiele } from "../_lib/lesepfade/orte";
import { revalidiereBestand } from "../_lib/revalidierung";
import { raeumeVerfallAmLeerenOrt } from "../_lib/schreibpfade/lagerortVerfall";
import { umlagerungVonOrt } from "../_lib/schreibpfade/umlagerung";
import type { VerfallWert } from "../_lib/verfallStand";
import { RUECKLAUF_PRAEFIX } from "../_lib/vorgang";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * VOM FAHRZEUG ZURUECK IN EINEN SCHRANK — DRK-366.
 *
 * Material, das eine Einheit verlaesst, ohne verbraucht zu sein, kam bisher nur
 * ueber die Entnahmebox zurueck (DRK-314 hinein, DRK-381 heraus). Das ist der
 * Weg fuer die Helferin ohne Konto. Wer selbst am Schrank steht, bucht hier in
 * EINEM Schritt, und die Charge wandert dabei unveraendert mit.
 *
 * ⚠️ DER FAHRZEUG-CHECK BLEIBT, WIE ER IST — die Entscheidung des Tickets. Eine
 * Differenz im Check hat viele Ursachen (verbraucht, verzaehlt, zu viel drauf);
 * ein automatischer Ruecklauf buchte jeden Einsatzverbrauch als Rueckgabe.
 * Dieselbe Begruendung steht an `bucheInEntnahmebox`.
 *
 * ⚠️ EINE EIGENE DATEI UND NICHT `buchung.ts`: der naechste Verwandte ist zwar
 * `bucheUmlagerung`, aber dessen Zusage „die Handlager-Summe bleibt gleich"
 * gilt hier ausdruecklich nicht — der Ruecklauf ERHOEHT sie. Die Riegel
 * (Quelle ist eine Einheit, Ziel aus `zugangsZiele`, abweisen statt kappen)
 * sind die von `raeumeAusEntnahmebox` und `bucheInEntnahmebox`.
 *
 * ⚠️ DIE ACTION VERLANGT KEIN SOLL, IHRE FLAECHE ZEIGT ABER NUR SOLL-ARTIKEL.
 * Der Knopf steht in der Verfallstabelle des Fahrzeugblatts, und die fuehrt je
 * aktiver Soll-Position eine Zeile. Material OHNE Soll an der Einheit — „zu
 * viel draufgelegt" — hat dort keine Zeile; dafuer ist die Entnahmebox da,
 * deren Lesepfad bewusst ueber den Bestand geht (`postenAmOrt`). Soll ein
 * solcher Posten auch direkt zurueck, braucht das Blatt einen Bestandsleser,
 * nicht diese Action eine Aenderung.
 *
 * ⚠️ `requireLagerbuchAdmin`: ausgeloest wird vom Fahrzeugblatt der
 * Verwaltung. Eine Action-Id ist global — die Zusage gehoert in die Action,
 * nicht in die Flaeche.
 */
const RuecklaufSchema = z.object({
  /** Die Einheit, AUS der zurueckgebucht wird — Fahrzeug oder Tasche. */
  fahrzeugId: z.string().min(1),
  artikelId: z.string().min(1),
  /**
   * ⚠️ PFLICHT, dieselbe Festlegung wie beim Einraeumen aus der Box: die
   * Packung liegt vor einem, und genau DIESE wandert in den Schrank. Eine
   * FEFO-Vorgabe schriebe eine andere Charge ins Journal als die physisch
   * gewanderte — still und wegen append-only nicht mehr zu heilen. Angeboten
   * werden nur Chargen, die an der Einheit liegen.
   */
  chargeId: z.string().min(1, "Charge wählen"),
  menge: z.coerce.number().int().positive("Menge muss größer als 0 sein").max(BUCHUNG_MENGE_MAX),
  /** Die Handlager-Wurzel ist eine Zeile der Auswahl wie jeder Schrank. */
  zielLagerortId: z.string().min(1, "Ziel wählen"),
});

export type RuecklaufWert = VerfallWert & { umgelagert: number; ziel: string };

export async function bucheRuecklauf(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<RuecklaufWert>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext(
    { actor: auditActor(viewer) },
    async (): Promise<ActionErgebnis<RuecklaufWert>> => {
      const geparst = RuecklaufSchema.safeParse(eingabe);
      if (!geparst.success) {
        const feldFehler = zodFehler(geparst.error);
        return {
          ok: false,
          fehler: "Bitte die markierten Felder prüfen.",
          ...(feldFehler ? { feldFehler } : {}),
        };
      }
      const v = geparst.data;
      const quelle = { quelleTyp: "oidc" as const, quelleId: viewer.sub };

      /*
       * ⚠️ `zugangsZiele` UND NICHT `handlagerOrte` — dieselbe Unterscheidung
       * wie in `raeumeAusEntnahmebox`: ein stillgelegter Schrank bleibt
       * Bestandsort, nimmt aber nichts mehr auf. Vor der Transaktion als Satz,
       * weil die Lage ohne Zutun entsteht (jemand legt den Schrank still,
       * waehrend der Dialog offen ist); massgeblich ist die Probe darin.
       */
      const ziel = zugangsZiele(db).find((o) => o.id === v.zielLagerortId);
      if (!ziel) {
        return {
          ok: false,
          fehler:
            "Dieser Schrank nimmt kein Material mehr auf — er wurde stillgelegt " +
            "oder gelöscht. Bitte die Seite neu laden und einen anderen wählen.",
        };
      }

      let umgelagert = 0;
      let verfall: string | null = null;
      let fachFehler: string | null;
      try {
        fachFehler = db.transaction((tx): string | null => {
          /*
           * RIEGEL 1 — DIE QUELLE IST EINE EINHEIT. Ohne die Probe entschiede
           * der Fremdschluessel, und der laesst jeden Lagerort durch: aus einem
           * Ruecklauf wuerde still ein Umlagern im Handlager, und die
           * Handlager-Summe stiege um Material, das es nicht gibt.
           *
           * ⚠️ `aktiv` WIRD NICHT VERLANGT: eine stillgelegte Einheit ist genau
           * die, die man ausraeumt — und diese Action erreicht ohnehin nur die
           * Verwaltung (anders als `bucheInEntnahmebox`).
           */
          const von = tx
            .select({ typ: lagerorte.typ, einheitenart: lagerorte.einheitenart })
            .from(lagerorte).where(eq(lagerorte.id, v.fahrzeugId)).get();
          if (!von) return "Diese Einheit gibt es nicht mehr. Bitte die Seite neu laden.";
          if (von.typ !== "fahrzeug") {
            return "Zurückbuchen geht nur aus einem Fahrzeug oder einer Tasche.";
          }

          // RIEGEL 2 — das Ziel noch einmal, in der Transaktion.
          if (!zugangsZiele(tx).some((o) => o.id === v.zielLagerortId)) {
            return "Dieser Schrank nimmt kein Material mehr auf. Bitte die Seite neu laden.";
          }

          // RIEGEL 3 — die Charge gehoert zu diesem Artikel (I5).
          const charge = tx.select({ artikelId: chargen.artikelId })
            .from(chargen).where(eq(chargen.id, v.chargeId)).get();
          if (!charge || charge.artikelId !== v.artikelId) {
            return "Diese Charge gehört nicht zu diesem Artikel. Bitte die Seite neu laden.";
          }

          /*
           * ⚠️ NICHT GEDECKT HEISST ABWEISEN, NICHT KAPPEN — dieselbe Regel wie
           * bei jeder Umlagerung: gebucht waeren drei von fuenf getragenen
           * Stueck, und die zwei stuenden weiter an der Einheit. Der Buchstand
           * waere an BEIDEN Orten falsch, und niemand bekaeme es gesagt.
           */
          const vorhanden = restJeChargeFuerArtikelAnOrt(tx, v.artikelId, v.fahrzeugId)
            .get(v.chargeId) ?? 0;
          if (vorhanden < v.menge) {
            const einheit = tx.select({ einheit: artikel.einheit }).from(artikel)
              .where(eq(artikel.id, v.artikelId)).get()?.einheit ?? "";
            return `Von dieser Charge liegen ${ausDieserEinheit(von.einheitenart)} nur `
              + `${vorhanden} ${einheit}`.trimEnd()
              + ". Es wurde nichts gebucht — bitte die Menge prüfen.";
          }

          umgelagert = umlagerungVonOrt(tx, {
            artikelId: v.artikelId,
            menge: v.menge,
            // Genau diese Einheit, nicht ihr Teilbaum (DRK-354).
            vonOrt: v.fahrzeugId,
            nachLagerortId: v.zielLagerortId,
            chargeId: v.chargeId,
            quelle,
            kommentar: RUECKLAUF_KOMMENTAR,
            // Das Praefix kommt aus `_lib/vorgang.ts` — eine Quelle, kein Literal.
            referenz: `${RUECKLAUF_PRAEFIX}${v.fahrzeugId}`,
          }).umgelagert;
          if (umgelagert < v.menge) {
            // Unerreichbar hinter der Deckungspruefung — deshalb ein Wurf, der
            // die ganze Transaktion zuruecknimmt, und keine Meldung.
            throw new Error("Deckung und Buchung sind uneins");
          }

          /*
           * ⚠️ DIE GEMELDETE VERFALLSANGABE WANDERT NICHT MIT — im Handlager
           * traegt die CHARGE den Verfall, nicht der Ort (dieselbe Lage wie beim
           * Einraeumen aus der Box, Begruendung an `raeumeVerfallAmLeerenOrt`).
           * An der Einheit faellt sie, sobald dort nichts mehr liegt; sonst
           * meldete das Fahrzeugblatt weiter einen Verfall fuer ein leeres Fach.
           *
           * Gemeldet wird der STAND DANACH aus der Datenbank: die Verfallstabelle
           * des Fahrzeugblatts nimmt ihn ueber denselben Trichter wie das
           * Aussondern (`useVerfallStand`), und ein eigener Wert daneben liesse
           * den Monatswaehler etwas behaupten, das nicht gespeichert ist.
           */
          raeumeVerfallAmLeerenOrt(tx, v.fahrzeugId, v.artikelId);
          verfall = tx.select({ verfall: lagerortVerfall.verfall })
            .from(lagerortVerfall)
            .where(and(
              eq(lagerortVerfall.lagerortId, v.fahrzeugId),
              eq(lagerortVerfall.artikelId, v.artikelId),
            ))
            .get()?.verfall ?? null;
          return null;
        });
      } catch {
        return {
          ok: false,
          fehler: "Die Buchung wurde nicht gespeichert. Bitte die Seite neu laden und es erneut versuchen.",
        };
      }

      if (fachFehler !== null) return { ok: false, fehler: fachFehler };

      revalidiereBestand();
      // Der Zielname kommt aus dem Server: ein umbenannter Schrank stuende sonst
      // in der Rueckmeldung noch unter seinem alten Namen.
      return { ok: true, wert: { verfall, umgelagert, ziel: ziel.name } };
    },
  );
}
