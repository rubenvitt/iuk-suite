"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import {
  buchungen, lagerorte, lagerortVerfall, newId, sollPositionen,
} from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { MONAT_REGEX } from "../_lib/konstanten";
import { AUSSONDERN_PRAEFIX } from "../_lib/vorgang";
import { restJeChargeFuerArtikel } from "../_lib/lesepfade/bestand";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * Der TATSAECHLICH geschriebene Verfall.
 *
 * ⚠️ DIE OBERFLAECHE DARF NICHT IHREN EIGENEN EINGABEWERT SPIEGELN: seit die
 * Transaktion ueber „alles raus" entscheidet, koennen Eingabe und Ergebnis
 * auseinandergehen — der Dialog schickt ein Datum, die Buchung leert den
 * Bestand, geschrieben wird `null`. Ohne diesen Rueckgabewert zeigte der
 * Monatswaehler danach ein Datum, das in der Datenbank nicht steht.
 */
export type AussondernWert = { verfall: string | null };

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
  /**
   * Was der Dialog beim Öffnen ANGEZEIGT hat.
   *
   * ⚠️ OHNE DIESEN WERT SCHREIBT DER DIALOG ETWAS, WORUM NIEMAND IHN GEBETEN
   * HAT: er belegt sein Feld vor und schickt es beim Absenden mit, auch wenn
   * niemand es angefasst hat. Ändert inzwischen eine ANDERE Sitzung den Monat,
   * schriebe die Aussonderung den alten Stand darüber. Stimmen Eingabe und
   * Anzeige überein, bleibt der gespeicherte Wert deshalb unangetastet.
   */
  verfallVorher: z.string().trim().nullish(),
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
 * ⚠️ DAS PRÄFIX KOMMT AUS `_lib/vorgang.ts` UND WIRD NICHT ABGESCHRIEBEN
 * (DRK-344). Dort liegt seine einzige Quelle, weil es an DREI Stellen gebraucht
 * wird: beim Schreiben (hier), beim Ableiten des Vorgangstextes und in der
 * SQL-Bedingung des Journalfilters. Ein Tippfehler in einer davon liefe still
 * auseinander — die Buchung entsünde mit einem Präfix, das niemand liest, und
 * im Journal stünde weiter „Korrektur". `vorgang.test.ts` scannt dafür den
 * Quelltext; kein anderes Tor sieht es.
 *
 * Die Anzeige ist seit DRK-344 NICHT mehr offen: das Journal beschriftet diese
 * Zeilen als „Aussonderung" und lässt sich danach filtern.
 */
export async function aussondernVomLagerort(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<AussondernWert>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext(
    { actor: auditActor(viewer) },
    async (): Promise<ActionErgebnis<AussondernWert>> => {
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

      let geschriebenerVerfall: string | null = null;
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

          const rest = restJeChargeFuerArtikel(tx, v.artikelId, [v.lagerortId]);
          // Der Bestand des ARTIKELS am Ort — Bezugsgröße der Verfallsfrage
          // unten, und beim Chargenabgang ausdrücklich NICHT die Charge allein.
          let gesamt = 0;
          for (const r of rest.values()) gesamt += r;

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
                referenz: `${AUSSONDERN_PRAEFIX}${v.lagerortId}`,
                kommentar: v.kommentar,
              })
              .run();
          } else {
            if (gesamt < v.menge) {
              return `Hier liegen nur ${gesamt} Stück.`;
            }
            fefoAbbuchung(tx, {
              artikelId: v.artikelId,
              menge: v.menge,
              orte: [v.lagerortId],
              quelle,
              kommentar: v.kommentar,
              referenz: `${AUSSONDERN_PRAEFIX}${v.lagerortId}`,
              typ: "korrektur",
            });
          }

          /*
           * ⚠️ „ALLES RAUS" ENTSCHEIDET DIE TRANSAKTION, NICHT DER CLIENT. Der
           * Dialog sperrt das Datumsfeld anhand des Bestands, den er beim
           * RENDERN gesehen hat — das ist ein Hinweis für die Bedienung, keine
           * Durchsetzung. Bucht jemand anders in der Zwischenzeit ab, schickt
           * der Dialog eine Teilmenge samt Datum, und genau diese Teilmenge
           * leert den Bestand. Die Zeile bliebe mit einem Datum stehen, zu dem
           * nichts mehr im Fahrzeug liegt, und die Verfallsliste meldete den
           * Artikel weiter als abgelaufen.
           *
           * Kein Bestand, keine Angabe: `setzeVerfall` löscht bei `null`.
           */
          const verbleibend = gesamt - v.menge;
          const gemeint = v.verfall ? v.verfall : null;
          const gesehen = v.verfallVorher ? v.verfallVorher : null;

          if (verbleibend === 0) {
            // Kein Bestand, keine Angabe. Das schlägt „nicht anrühren": eine
            // Meldung ohne Bestand behauptet einen Verfall, den es nicht gibt.
            geschriebenerVerfall = null;
            setzeVerfall(tx, {
              lagerortId: v.lagerortId, artikelId: v.artikelId,
              verfall: null, quelle,
            });
          } else if (gemeint !== gesehen) {
            // Die Person hat den Monat angefasst — das ist eine Aussage.
            geschriebenerVerfall = gemeint;
            setzeVerfall(tx, {
              lagerortId: v.lagerortId, artikelId: v.artikelId,
              verfall: gemeint, quelle,
            });
          } else {
            /*
             * UNVERAENDERT ⇒ NICHTS SCHREIBEN. Der Dialog wollte Bestand
             * ausbuchen, nicht das Datum pflegen. Hat eine andere Sitzung es
             * inzwischen geändert, bliebe es sonst unter der Vorbelegung
             * begraben — ein verlorener Fremdschreibvorgang, den kein Tor sieht.
             *
             * Gemeldet wird der STAND AUS DER DATENBANK, damit die Tabelle
             * daneben die Wahrheit spiegelt und nicht die eigene Eingabe.
             */
            const zeile = tx.select({ verfall: lagerortVerfall.verfall })
              .from(lagerortVerfall)
              .where(and(
                eq(lagerortVerfall.lagerortId, v.lagerortId),
                eq(lagerortVerfall.artikelId, v.artikelId),
              ))
              .get();
            geschriebenerVerfall = zeile?.verfall ?? null;
          }
          return null;
        });
      } catch {
        return { ok: false, fehler: "Aussondern fehlgeschlagen." };
      }

      if (fachFehler !== null) return { ok: false, fehler: fachFehler };

      revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${v.lagerortId}`);
      revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
      revalidatePath("/m/lagerbuch/verwaltung/verfall");
      return { ok: true, wert: { verfall: geschriebenerVerfall } };
    },
  );
}
