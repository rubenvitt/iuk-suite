"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { lagerortVerfall } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { BuchungAbgewiesen } from "../_lib/buchungAbgewiesen";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
import { zugangsZiele } from "../_lib/lesepfade/orte";
import { revalidiereBestand } from "../_lib/revalidierung";
import { ruecklaufTx } from "../_lib/schreibpfade/einheitBewegung";
import type { VerfallWert } from "../_lib/verfallStand";
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
           * Die Riegel (Quelle ist eine Einheit — `aktiv` wird NICHT verlangt, die
           * stillgelegte raeumt man aus —, Ziel noch in `zugangsZiele`, Charge
           * gehoert zum Artikel), die Deckung (abweisen statt kappen) und die
           * Umlagerung stehen im gemeinsamen Schreibpfad; eine Absage kommt als
           * `BuchungAbgewiesen` und wird unten im catch zur Meldung.
           */
          umgelagert = ruecklaufTx(tx, {
            fahrzeugId: v.fahrzeugId,
            artikelId: v.artikelId,
            chargeId: v.chargeId,
            menge: v.menge,
            zielLagerortId: v.zielLagerortId,
            quelle,
          });

          /*
           * ⚠️ DIE GEMELDETE VERFALLSANGABE WANDERT NICHT MIT (`ruecklaufTx` raeumt sie
           * am leeren Ort ab) — im Handlager
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
          verfall = tx.select({ verfall: lagerortVerfall.verfall })
            .from(lagerortVerfall)
            .where(and(
              eq(lagerortVerfall.lagerortId, v.fahrzeugId),
              eq(lagerortVerfall.artikelId, v.artikelId),
            ))
            .get()?.verfall ?? null;
          return null;
        });
      } catch (e) {
        // `BuchungAbgewiesen` traegt einen fertigen Satz; alles andere ist ein
        // Defekt hinter dem Rueckfall.
        return {
          ok: false,
          fehler: e instanceof BuchungAbgewiesen
            ? e.message
            : "Die Buchung wurde nicht gespeichert. Bitte die Seite neu laden und es erneut versuchen.",
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
