"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel, chargen, lagerorte } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { BuchungAbgewiesen } from "../_lib/buchungAbgewiesen";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
import { AUFLADEN_KOMMENTAR, MONAT_REGEX, ortZeile } from "../_lib/konstanten";
import { restJeChargeFuerArtikelAnOrt } from "../_lib/lesepfade/bestand";
import { istAktivesFahrzeug } from "../_lib/lesepfade/fahrzeuge";
import { revalidiereBestand } from "../_lib/revalidierung";
import { verfallFolgtDemMaterial } from "../_lib/schreibpfade/lagerortVerfall";
import { umlagerungVonOrt } from "../_lib/schreibpfade/umlagerung";
import { zugangAnEinheitBuchen } from "../_lib/schreibpfade/zugang";
import { AUFLADEN_PRAEFIX } from "../_lib/vorgang";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * MATERIAL AUF EINE EINHEIT PACKEN — DRK-485.
 *
 * Bis hierher kam Material nur auf EINEM Weg an ein Fahrzeug: als Entnahme aus
 * dem Handlager (`bucheEntnahme` mit Ziel, `bucheEntnahmeHelfer`), und dort
 * waehlt FEFO die Charge. Die GF packt aber auch
 *
 *  1. VON EINEM ANDEREN ORT um — aus einem bestimmten Schrank, aus dem
 *     Nachbarfahrzeug, aus der Entnahmebox —, und dann DIESE Packung, und
 *  2. NEU, direkt vom Lieferanten oder aus der Apotheke aufs Fahrzeug, ohne
 *     dass das Material je im Handlager lag.
 *
 * Beides ist eine Buchung vom Fahrzeugblatt aus, deshalb EINE Action mit einer
 * `herkunft`. Die beiden Zweige sind trotzdem verschiedene Vorgaenge und
 * schreiben verschiedene Zeilen: (1) ist eine UMLAGERUNG (netto null, zwei
 * Legs, `aufladen:<einheit>`), (2) ein WARENEINGANG an der Einheit
 * (`zugangAnEinheitBuchen`, eine Zeile). Verwechselt man sie, entsteht Material
 * aus dem Nichts oder verschwindet — und das Journal ist append-only.
 *
 * ⚠️ DIE CHARGE IST BEIM UMPACKEN PFLICHT, dieselbe Festlegung wie beim
 * Ruecklauf (DRK-366) und beim Umlagern (DRK-338): FEFO ist eine
 * Entnahme-Regel. Wer eine Packung aus dem Nachbarfahrzeug nimmt, nimmt DIESE.
 *
 * ⚠️ NICHT GEDECKT HEISST ABWEISEN, NICHT KAPPEN — gebucht waeren drei von
 * fuenf getragenen Stueck, und der Buchstand waere an BEIDEN Orten falsch.
 *
 * ⚠️ DIE QUELLE DARF JEDER ORT AUSSER DEM ZIEL SEIN, auch ein stillgelegter:
 * genau den raeumt man aus. Das Ziel muss eine AKTIVE Einheit sein — ein
 * Schrank ist hier kein Ziel, dafuer gibt es Auffuellen, Umlagern und Ruecklauf.
 *
 * ⚠️ `requireLagerbuchAdmin` IST DIE GF-STUFE (DRK-313): das angemeldete Konto
 * in der Lagerbuch-Gruppe. Ein Kaertchen erreicht diese Action auf keinem Weg.
 */
const AufladenSchema = z.object({
  /** Die Einheit, AUF die gepackt wird — Fahrzeug oder Tasche. */
  fahrzeugId: z.string().min(1),
  artikelId: z.string().min(1, "Artikel wählen"),
  menge: z.coerce.number().int().positive("Menge muss größer als 0 sein").max(BUCHUNG_MENGE_MAX),
  herkunft: z.discriminatedUnion("art", [
    z.object({
      art: z.literal("ort"),
      vonLagerortId: z.string().min(1, "Herkunft wählen"),
      chargeId: z.string().min(1, "Charge wählen"),
    }),
    z.object({
      art: z.literal("neu"),
      charge: z.discriminatedUnion("art", [
        z.object({ art: z.literal("vorhanden"), chargeId: z.string().min(1, "Charge wählen") }),
        z.object({
          art: z.literal("neu"),
          chargenNr: z.string().trim().min(1, "Chargennummer darf nicht leer sein"),
          verfall: z.string().regex(MONAT_REGEX, "Verfall muss YYYY-MM sein"),
        }),
      ]),
    }),
  ]),
});

export type AufladenWert = { gebucht: number; ziel: string };

export async function bucheAufladen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<AufladenWert>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext(
    { actor: auditActor(viewer) },
    async (): Promise<ActionErgebnis<AufladenWert>> => {
      const geparst = AufladenSchema.safeParse(eingabe);
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
       * DAS ZIEL VOR DER TRANSAKTION, als Satz: die Lage entsteht ohne Zutun
       * (jemand legt die Einheit still, waehrend der Dialog offen ist).
       * Massgeblich ist die Probe darin — `zugangAnEinheitBuchen` wirft, und
       * der Umpack-Zweig fragt unten noch einmal.
       */
      if (!istAktivesFahrzeug(db, v.fahrzeugId)) {
        return {
          ok: false,
          fehler:
            "Diese Einheit nimmt kein Material mehr auf — sie wurde stillgelegt " +
            "oder gelöscht. Bitte die Seite neu laden.",
        };
      }
      if (v.herkunft.art === "ort" && v.herkunft.vonLagerortId === v.fahrzeugId) {
        return {
          ok: false,
          fehler: "Herkunft und Ziel müssen verschieden sein.",
          feldFehler: { herkunft: "Herkunft und Ziel müssen verschieden sein" },
        };
      }

      let gebucht = 0;
      let fachFehler: string | null;
      try {
        fachFehler = db.transaction((tx): string | null => {
          if (!istAktivesFahrzeug(tx, v.fahrzeugId)) {
            return "Diese Einheit nimmt kein Material mehr auf. Bitte die Seite neu laden.";
          }

          if (v.herkunft.art === "neu") {
            zugangAnEinheitBuchen(tx, {
              artikelId: v.artikelId,
              menge: v.menge,
              einheitId: v.fahrzeugId,
              charge: v.herkunft.charge,
              quelle,
            });
            gebucht = v.menge;
            return null;
          }

          const { vonLagerortId, chargeId } = v.herkunft;

          // RIEGEL 1 — die Quelle gibt es. Ob sie aktiv ist, zaehlt nicht.
          const von = tx.select().from(lagerorte).where(eq(lagerorte.id, vonLagerortId)).get();
          if (!von) return "Diesen Ort gibt es nicht mehr. Bitte die Seite neu laden.";

          // RIEGEL 2 — die Charge gehoert zu diesem Artikel (I5).
          const charge = tx.select({ artikelId: chargen.artikelId })
            .from(chargen).where(eq(chargen.id, chargeId)).get();
          if (!charge || charge.artikelId !== v.artikelId) {
            return "Diese Charge gehört nicht zu diesem Artikel. Bitte die Seite neu laden.";
          }

          // RIEGEL 3 — gedeckt, sonst nichts (Kopf dieser Datei).
          const vorhanden = restJeChargeFuerArtikelAnOrt(tx, v.artikelId, vonLagerortId)
            .get(chargeId) ?? 0;
          if (vorhanden < v.menge) {
            const einheit = tx.select({ einheit: artikel.einheit }).from(artikel)
              .where(eq(artikel.id, v.artikelId)).get()?.einheit ?? "";
            return `In „${ortZeile(von)}“ liegen von dieser Charge nur `
              + `${Math.max(vorhanden, 0)} ${einheit}`.trimEnd()
              + ". Es wurde nichts gebucht — bitte die Menge prüfen.";
          }

          gebucht = umlagerungVonOrt(tx, {
            artikelId: v.artikelId,
            menge: v.menge,
            // GENAU DIESER ORT, nicht sein Teilbaum (DRK-354).
            vonOrt: vonLagerortId,
            nachLagerortId: v.fahrzeugId,
            chargeId,
            quelle,
            kommentar: AUFLADEN_KOMMENTAR,
            referenz: `${AUFLADEN_PRAEFIX}${v.fahrzeugId}`,
          }).umgelagert;
          if (gebucht < v.menge) {
            // Unerreichbar hinter der Deckungspruefung — ein Wurf, der die
            // ganze Transaktion zuruecknimmt, und keine Meldung.
            throw new Error("Deckung und Buchung sind uneins");
          }

          /*
           * DIE GEMELDETE VERFALLSANGABE FOLGT DEM MATERIAL (DRK-377) — die
           * Regel fuer JEDEN Weg zwischen zwei Orten. Aus dem Nachbarfahrzeug
           * oder der Kiste wandert die Meldung mit, und die geleerte Quelle
           * verliert ihre. Aus einem Schrank ist beides ein No-Op: im
           * Handlager traegt die Charge den Verfall, nicht der Ort.
           */
          verfallFolgtDemMaterial(tx, {
            vonLagerortId, nachLagerortId: v.fahrzeugId, artikelId: v.artikelId,
          });
          return null;
        });
      } catch (e) {
        // `BuchungAbgewiesen` traegt einen fertigen Satz (deaktivierter Artikel,
        // fremde Charge); alles andere ist ein Defekt hinter dem Rueckfall.
        return {
          ok: false,
          fehler: e instanceof BuchungAbgewiesen
            ? e.message
            : "Die Buchung wurde nicht gespeichert. Bitte die Seite neu laden und es erneut versuchen.",
        };
      }

      if (fachFehler !== null) return { ok: false, fehler: fachFehler };

      revalidiereBestand();
      // Der Name kommt aus dem Server: eine umbenannte Einheit stuende sonst in
      // der Rueckmeldung noch unter ihrem alten Namen.
      const ziel = db.select().from(lagerorte).where(eq(lagerorte.id, v.fahrzeugId)).get();
      return { ok: true, wert: { gebucht, ziel: ziel ? ortZeile(ziel) : v.fahrzeugId } };
    },
  );
}
