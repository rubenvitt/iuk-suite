"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { buchungen, lagerorte, newId, sollPositionen } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { MONAT_REGEX } from "../_lib/konstanten";
import { restJeChargeFuerArtikel } from "../_lib/lesepfade/bestand";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const AussondernLagerortSchema = z.object({
  lagerortId: z.string().min(1),
  artikelId: z.string().min(1),
  menge: z.number().int().positive("Menge muss größer als 0 sein"),
  chargeId: z.string().min(1).nullish(),
  /* Leer heißt „keine Angabe mehr" und löscht den Eintrag. Ein gesetzter Wert
   * geht durch DENSELBEN Monatsvalidator wie der Check (§5.6.4, Entscheidung 6):
   * der laxe `/^\d{4}-\d{2}$/` ließe „2026-00" durch, woraus `verfallStatus`
   * den 31.12.2025 rechnet — die Angabe gälte ab dem Anlegen als abgelaufen.
   * Ohne diese Prüfung WIRFT `setzeVerfall`, und der Wurf verließe die Action
   * als HTTP 500 statt als Feldfehler am Eingabefeld. */
  verfall: z
    .string()
    .trim()
    .nullish()
    .refine(
      (w) => !w || MONAT_REGEX.test(w),
      "Verfall im Format JJJJ-MM angeben (Monat 01–12).",
    ),
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
});

/**
 * Sondert eine GEZÄHLTE Menge eines Artikels an EINEM Lagerort aus.
 *
 * Abgrenzung zu `aussondern` (Handlager): dort ist die CHARGE der Ausgangspunkt
 * und ihr gesamter Rest fliegt raus. Hier ist die MENGE der Ausgangspunkt — so
 * wird am Fahrzeug tatsächlich gearbeitet: man nimmt heraus, was abgelaufen ist,
 * und zählt es.
 *
 * ⚠️ DAS PRÄFIX `aussondern:` STEHT HEUTE NUR IN DEN DATEN. Die Journaltabelle
 * baut ihren Vorgangstext aus `typ` und `kommentar` (`JournalTable.tsx:65`) und
 * liest `referenz` NICHT — auf dem Schirm steht also weiter „Korrektur", und
 * unterscheidbar ist die Aussonderung dort nur am eingegebenen Grund. Für
 * Auswertung und Export trägt das Präfix bereits; die Anzeige ist offen.
 */
export async function aussondernVomLagerort(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext(
    { actor: auditActor(viewer) },
    async (): Promise<ActionErgebnis> => {
      const geparst = AussondernLagerortSchema.safeParse(eingabe);
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

      let fachFehler: string | null;
      try {
        fachFehler = db.transaction((tx): string | null => {
          /*
           * DIE DECKUNGSPRUEFUNG STEHT VOR JEDER BUCHUNG, UND SIE IST NICHT OPTIONAL.
           * `fefoAbbuchung` KAPPT still an der Verfuegbarkeit (I2) und meldet die
           * tatsaechlich gebuchte Menge nur im Rueckgabewert. Wer den ignoriert, baut
           * die stille Teilaussonderung: die Verwaltende gibt 5 ein, 3 werden gebucht,
           * und die Rueckmeldung sagt „erledigt".
           */
          /*
           * ZUGEHOERIGKEIT VOR BESTAND — dieselben zwei Pruefungen, die
           * `verfallSetzen` an derselben Tabelle fuehrt, plus die Fahrzeugprobe
           * aus `buchung.ts` (Entnahmeziel).
           *
           * ⚠️ DER ANLASS IST NICHT DER BOESWILLIGE AUFRUF, SONDERN DIE OFFENE
           * SEITE. Die Zeile im Fahrzeugblatt existiert, weil beim RENDERN eine
           * aktive Soll-Position da war; bis zum Absenden kann ein Vorlagen-Sync
           * sie zum Grabstein gemacht haben. Ohne die Probe entstuende hier eine
           * `lagerort_verfall`-Zeile ohne pflegbares Soll — genau der Zustand,
           * den `bereinigeVerfallOhneAktivesSoll` verhindern soll.
           *
           * ⚠️ `aktiv` WIRD BEWUSST NICHT VERLANGT: ein stillgelegtes Fahrzeug
           * ist genau das, das man ausraeumt. Das Fahrzeugblatt oeffnet dafuer
           * ebenfalls (s. `ChecklisteKnopf` auf derselben Seite).
           */
          const ort = tx.select({ typ: lagerorte.typ })
            .from(lagerorte).where(eq(lagerorte.id, v.lagerortId)).get();
          if (!ort) return "Lagerort nicht gefunden.";
          if (ort.typ !== "fahrzeug") {
            // Das Handlager hat seinen eigenen Weg, und der verlangt eine
            // ABGELAUFENE Charge (`_actions/aussondern.ts`). Dieser hier kennt
            // die Bedingung nicht und waere sonst die weichere Tuer daneben.
            return "Dieser Weg gilt nur für Fahrzeuge.";
          }

          const imSoll = tx.select({ id: sollPositionen.id })
            .from(sollPositionen)
            .where(and(
              eq(sollPositionen.fahrzeugId, v.lagerortId),
              eq(sollPositionen.artikelId, v.artikelId),
              eq(sollPositionen.entfernt, false),
            ))
            .get();
          if (!imSoll) {
            return "Artikel steht an diesem Fahrzeug nicht im Soll.";
          }

          const rest = restJeChargeFuerArtikel(tx, v.artikelId, v.lagerortId);

          if (v.chargeId) {
            // Eine Charge, die dem Artikel nicht gehoert, steht gar nicht erst in der
            // Karte — die Deckungspruefung faengt sie als „0 vorhanden" mit ab.
            const vorhanden = rest.get(v.chargeId) ?? 0;
            if (vorhanden < v.menge) {
              return `Von dieser Charge liegen hier nur ${vorhanden} Stück.`;
            }
            tx.insert(buchungen)
              .values({
                id: newId(),
                ts: new Date(),
                typ: "korrektur",
                artikelId: v.artikelId,
                chargeId: v.chargeId,
                lagerortId: v.lagerortId,
                menge: -v.menge, // VORZEICHENBEHAFTET: ein Abgang ist negativ.
                quelleTyp: quelle.quelleTyp,
                quelleId: quelle.quelleId,
                referenz: `aussondern:${v.lagerortId}`,
                kommentar: v.kommentar,
              })
              .run();
          } else {
            let vorhanden = 0;
            for (const r of rest.values()) vorhanden += r;
            if (vorhanden < v.menge) {
              return `Hier liegen nur ${vorhanden} Stück.`;
            }
            fefoAbbuchung(tx, {
              artikelId: v.artikelId,
              menge: v.menge,
              lagerortId: v.lagerortId,
              quelle,
              kommentar: v.kommentar,
              referenz: `aussondern:${v.lagerortId}`,
              typ: "korrektur",
            });
          }

          setzeVerfall(tx, {
            lagerortId: v.lagerortId,
            artikelId: v.artikelId,
            verfall: v.verfall ? v.verfall : null,
            quelle,
          });
          return null;
        });
      } catch {
        return { ok: false, fehler: "Aussondern fehlgeschlagen." };
      }

      if (fachFehler !== null) return { ok: false, fehler: fachFehler };

      revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${v.lagerortId}`);
      revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
      revalidatePath("/m/lagerbuch/verwaltung/verfall");
      return { ok: true };
    },
  );
}
