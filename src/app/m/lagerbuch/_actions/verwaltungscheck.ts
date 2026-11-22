"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "../_db/client";
import { artikel, chargen, checks, lagerorte, o2Flaschen, plomben, sollPositionen } from "../_db/schema";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { BuchungAbgewiesen } from "../_lib/buchungAbgewiesen";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
import {
  CHECK_ABGLEICH, ENTNAHMEBOX_ID, MONAT_REGEX, ZUSTAENDE, anDieserEinheit, dieseEinheit, grossAmAnfang,
  type Einheitenart,
} from "../_lib/konstanten";
import { druckZuHoch } from "../_lib/domain/o2";
import { offenJeArtikel } from "../_lib/domain/check";
import type { CheckArtikelRoh, CheckPositionRoh } from "../_lib/checkErgebnis";
import { restJeChargeFuerArtikelAnOrt } from "../_lib/lesepfade/bestand";
import { verfallFuerLagerort } from "../_lib/lesepfade/verfall";
import { revalidiereBestand } from "../_lib/revalidierung";
import { verwaltungDetailPfadIntern } from "../_lib/verwaltungPfad";
import {
  bucheFlaschenMessungen, bucheGeraeteAntworten, gruppiereZaehlung, schreibeCheckZeile,
  setzePlombenNummern,
} from "../_lib/schreibpfade/check";
import {
  aufladenVonOrtTx, auffuellenAusHandlagerTx, aussondernAnEinheitTx, inEntnahmeboxTx, ruecklaufTx,
} from "../_lib/schreibpfade/einheitBewegung";
import type { Tx } from "../_lib/schreibpfade/abbuchung";
import { korrekturAufLagerort } from "../_lib/schreibpfade/korrektur";
import { setzeFachVerfaelle } from "../_lib/schreibpfade/fachVerfall";
import { zugangAnEinheitBuchen } from "../_lib/schreibpfade/zugang";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * DER VERWALTUNGSCHECK-ABSCHLUSS — Spec 6.8 (Verwaltungscheck, Abschluss).
 *
 * Die Verwaltung zählt eine Einheit am Fahrzeugblatt und gleicht in DEMSELBEN
 * Durchgang aus: aussondern, zurücklegen, auffüllen. Alles läuft in EINER
 * Transaktion; jede fachliche Absage WIRFT `BuchungAbgewiesen` (ein `return`
 * aus `db.transaction` committete) und wird außerhalb zu `{ ok:false, fehler }`.
 * Scheitert eine Bewegung, steht danach auch die Korrektur nicht im Journal.
 *
 * Den Kern teilt er mit `checkAbschluss` (`_lib/schreibpfade/check.ts`), die
 * Bewegungen mit Aufladen/Rücklauf/Entnahmebox (`_lib/schreibpfade/einheitBewegung.ts`).
 * Eigen sind Riegel, Nutzlast und Ergebnisform.
 *
 * ⚠️ JEDE BEWEGUNG WEIST AB STATT ZU KAPPEN (Spec 6.4) — anders als der
 * Nachfüllschritt im Helfer-Check. Der Abschluss nennt dann den Artikel.
 */

const Menge = z.coerce.number().int().min(1).max(BUCHUNG_MENGE_MAX);
const Kennung = z.string().min(1);

const Herkunft = z.discriminatedUnion("art", [
  z.object({ art: z.literal("handlager") }).strict(),
  z.object({ art: z.literal("ort"), vonLagerortId: Kennung, chargeId: Kennung }).strict(),
  z.object({
    art: z.literal("neu"),
    charge: z.discriminatedUnion("art", [
      z.object({ art: z.literal("vorhanden"), chargeId: Kennung }).strict(),
      z.object({
        art: z.literal("neu"),
        chargenNr: z.string().trim().max(64).optional(),
        verfall: z.string().regex(MONAT_REGEX),
      }).strict(),
    ]),
  }).strict(),
]);

/** Die Nutzlast; als TS-Typ gespiegelt in `_lib/verwaltungscheck.ts` (`VerwaltungscheckNutzlast`). */
const VerwaltungscheckSchema = z.object({
  fahrzeugId: Kennung,
  /** Die Sendungs-ID des Entwurfs und zugleich die ID des Checks (Wiederholung → Ergebnis von damals). */
  sendungId: z.string().uuid(),
  kommentar: z.string().trim().max(500).optional().transform((k) => k || undefined),
  /** Nur gezählte Positionen. */
  positionen: z.array(z.object({
    sollPositionId: Kennung,
    ist: z.coerce.number().int().min(0).max(99_999),
  }).strict()).default([]),
  /** Nur geänderte Fächer gezählter Positionen; `null` löscht die Angabe. */
  verfaelle: z.array(z.object({
    sollPositionId: Kennung,
    verfall: z.string().regex(MONAT_REGEX).nullable(),
  }).strict()).default([]),
  ausgleich: z.array(z.object({
    artikelId: Kennung,
    aussondern: z.object({
      menge: Menge,
      grund: z.string().trim().max(500).optional(),
    }).strict().optional(),
    zuruecklegen: z.object({
      menge: Menge,
      zielLagerortId: Kennung,
      chargeId: Kennung.optional(),
    }).strict().optional(),
    auffuellen: z.object({
      menge: Menge,
      herkunft: Herkunft,
      /** „Schon eingeräumt und mitgezählt" (Spec 6.12.5). */
      mitgezaehlt: z.boolean().optional(),
    }).strict().optional(),
  }).strict()).default([])
    .refine((a) => new Set(a.map((x) => x.artikelId)).size === a.length, "Je Artikel ein Ausgleich"),
  /** Nur neu gesetzte Nummern. */
  plomben: z.array(z.object({
    plombeId: Kennung,
    nummer: z.string().trim().min(1).max(64),
  }).strict()).default([]),
  geraete: z.array(z.object({
    geraetId: Kennung,
    vorhanden: z.boolean(),
    zustand: z.enum(ZUSTAENDE).optional(),
    bemerkung: z.string().trim().max(500).optional(),
    selbsttest: z.boolean().optional(),
  }).strict()).default([]),
  flaschen: z.array(z.object({
    flascheId: Kennung,
    druckBar: z.coerce.number().int().min(0),
  }).strict()).default([]),
}).strict();

/** Was der Abschluss annimmt — gegen `VerwaltungscheckNutzlast` geprüft (`_lib/verwaltungscheck.test.ts`). */
export type VerwaltungscheckEingabe = z.input<typeof VerwaltungscheckSchema>;

export type VerwaltungscheckWert = {
  checkId: string;
  /** Betrag der Korrekturen über alle gezählten Artikel. */
  korrigiert: number;
  ausgesondert: number;
  zurueckgelegt: number;
  /** Aufgefüllt aus JEDER Herkunft, das Handlager eingeschlossen. */
  aufgefuellt: number;
  /** Nach dem Ausgleich noch fehlend, je Artikel geklemmt (`offenJeArtikel`). */
  offen: number;
  geraeteAuffaellig: number;
  flaschenAuffaellig: number;
  plombenGesetzt: number;
  geraeteGemeldet: number;
};

const AUSSONDERN_VORGABE = "Beim Zählen ausgesondert";
const NICHT_GESPEICHERT =
  "Der Abschluss wurde nicht gespeichert. Bitte die Seite neu laden und es erneut versuchen.";

export async function verwaltungscheckAbschluss(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<VerwaltungscheckWert>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext(
    { actor: auditActor(viewer) },
    async (): Promise<ActionErgebnis<VerwaltungscheckWert>> => {
      const geparst = VerwaltungscheckSchema.safeParse(eingabe);
      if (!geparst.success) {
        return { ok: false, fehler: "Die Eingabe war unvollständig. Bitte die Seite neu laden." };
      }
      const v = geparst.data;

      /*
       * WIEDERHOLUNG DERSELBEN SENDUNG — vor jeder fachlichen Prüfung, wie im
       * Helfer-Check: nach dem ersten Abschluss hat sich der Bestand bewegt, und
       * eine Prüfung weiter unten könnte die Wiederholung abweisen, obwohl der
       * Check längst steht.
       */
      const frueher = db.select().from(checks).where(eq(checks.id, v.sendungId)).get();
      if (frueher) {
        const wert = frueher.fahrzeugId === v.fahrzeugId ? frueherAbschluss(frueher.id, frueher.ergebnis) : null;
        return wert ? { ok: true, wert } : { ok: false, fehler: "Dieser Check passt nicht zu dieser Einheit." };
      }

      // Spec 6.12.6: ohne gezählte Position erlaubt, ganz leer nicht.
      if (v.positionen.length + v.geraete.length + v.flaschen.length + v.plomben.length === 0) {
        return { ok: false, fehler: "Es ist noch nichts erfasst." };
      }

      // RIEGEL 5 (wie im Helfer-Check): die Einheit ist ein aktiver Träger.
      const fz = db.select().from(lagerorte).where(eq(lagerorte.id, v.fahrzeugId)).get();
      if (!fz || fz.typ !== "fahrzeug" || !fz.aktiv) {
        const wer = fz ? grossAmAnfang(dieseEinheit(fz.einheitenart)) : "Diese Einheit";
        return { ok: false, fehler: `${wer} ist nicht mehr aktiv. Bitte die Seite neu laden.` };
      }

      if (v.flaschen.length > 0) {
        const nenn = new Map(db.select({ id: o2Flaschen.id, nenn: o2Flaschen.nennfuelldruckBar })
          .from(o2Flaschen).where(eq(o2Flaschen.lagerortId, v.fahrzeugId)).all().map((f) => [f.id, f.nenn]));
        if (v.flaschen.some((f) => druckZuHoch(f.druckBar, nenn.get(f.flascheId) ?? 0))) {
          return {
            ok: false,
            fehler: "Ein Druck liegt über dem Nennfülldruck der Flasche. Bitte am Manometer nachsehen und korrigieren.",
          };
        }
      }

      const quelle = { quelleTyp: "oidc" as const, quelleId: viewer.sub };
      const checkId = v.sendungId;
      let wert: VerwaltungscheckWert;
      try {
        wert = db.transaction((tx): VerwaltungscheckWert => {
          const referenz = `check:${checkId}`;
          const sollRows = tx.select().from(sollPositionen)
            .where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all()
            .filter((s) => !s.entfernt);
          const byId = new Map(sollRows.map((s) => [s.id, s]));
          const artikelName = (id: string) =>
            tx.select({ name: artikel.name }).from(artikel).where(eq(artikel.id, id)).get()?.name ?? "Dieser Artikel";

          // Fremde Position und Teilzählung eines Artikels werfen hier (Riegelfall, die Oberfläche sperrt beides).
          const zaehlung = gruppiereZaehlung(sollRows, v.positionen);
          const ausgleich = new Map(v.ausgleich.map((a) => [a.artikelId, a]));
          for (const id of ausgleich.keys()) {
            if (!zaehlung.has(id)) {
              throw new BuchungAbgewiesen(`${artikelName(id)}: erst in allen Fächern zählen, dann ausgleichen.`);
            }
          }

          /*
           * 1. ZÄHLUNG → KORREKTUR je Artikel. „Schon eingeräumt und mitgezählt"
           * (Spec 6.12.5): die Auffüllmenge steckt im Ist und kommt gleich per
           * Umlagerung von ihrer Herkunft — die Korrektur geht deshalb auf
           * `Ist − menge`, sonst entstünde das Material aus dem Nichts.
           */
          const stand = new Map<string, { istMenge: number; korrektur: number }>();
          for (const g of zaehlung.values()) {
            const auf = ausgleich.get(g.artikelId)?.auffuellen;
            const istMenge = g.istSumme - (auf?.mitgezaehlt ? auf.menge : 0);
            if (istMenge < 0) {
              throw new BuchungAbgewiesen(
                `${artikelName(g.artikelId)}: gezählt sind ${g.istSumme}, mitgezählt aufgefüllt ${auf!.menge}. `
                + "Bitte die Menge prüfen.",
              );
            }
            const { diff } = korrekturAufLagerort(tx, {
              artikelId: g.artikelId, lagerortId: v.fahrzeugId, istMenge,
              quelle, kommentar: CHECK_ABGLEICH, referenz,
            });
            stand.set(g.artikelId, { istMenge, korrektur: diff });
          }

          /*
           * 2. PLOMBEN (Spec 6.12.3): eine neue Nummer an einer Plombe mit Fach
           * verlangt, dass jede Position dieses Fachs in diesem Abschluss
           * gezählt ist. Plomben ohne Fach decken nichts ab und sind frei.
           */
          const gezaehltIds = new Set(v.positionen.map((p) => p.sollPositionId));
          const plombenHier = new Map(tx.select().from(plomben)
            .where(eq(plomben.lagerortId, v.fahrzeugId)).all().filter((p) => p.aktiv).map((p) => [p.id, p]));
          for (const e of v.plomben) {
            const pl = plombenHier.get(e.plombeId);
            if (!pl || pl.fachLabel === null) continue;   // fremde Plombe: `setzePlombenNummern` wirft
            if (sollRows.some((r) => r.fachLabel === pl.fachLabel && !gezaehltIds.has(r.id))) {
              throw new BuchungAbgewiesen(
                `Plombe „${pl.bezeichnung}“: erst das ganze Fach ${pl.fachLabel} zählen.`,
              );
            }
          }
          const plombenErgebnis = setzePlombenNummern(tx, { lagerortId: v.fahrzeugId, eintraege: v.plomben });

          // 3. AUSGLEICH je Artikel: aussondern → zurücklegen → auffüllen.
          const bewegt = new Map<string, {
            ausgesondert: number; zurueckgelegt: number; aufgefuellt: number; nachfuellGebucht: number;
          }>();
          for (const a of ausgleich.values()) {
            const b = { ausgesondert: 0, zurueckgelegt: 0, aufgefuellt: 0, nachfuellGebucht: 0 };
            /*
             * Spec 6.4: scheitert eine Bewegung, nennt die Absage den ARTIKEL. Die
             * Texte der Schreibpfade gehören auch Aufladen und Rücklauf und bleiben;
             * wer den Namen schon trägt (Box, Handlager), bekommt ihn nicht doppelt.
             */
            try {
              if (a.aussondern) {
                aussondernAnEinheitTx(tx, {
                  lagerortId: v.fahrzeugId, artikelId: a.artikelId, menge: a.aussondern.menge,
                  quelle, kommentar: a.aussondern.grund || AUSSONDERN_VORGABE,
                });
                b.ausgesondert = a.aussondern.menge;
              }
              if (a.zuruecklegen) {
                const z = a.zuruecklegen;
                if (z.chargeId) {
                  pruefeChargeNachZaehlung(tx, {
                    fahrzeug: fz, artikelId: a.artikelId, chargeId: z.chargeId, menge: z.menge,
                  });
                }
                if (z.zielLagerortId === ENTNAHMEBOX_ID) {
                  b.zurueckgelegt = inEntnahmeboxTx(tx, {
                    fahrzeugId: v.fahrzeugId, artikelId: a.artikelId, menge: z.menge,
                    ...(z.chargeId ? { chargeId: z.chargeId } : {}), quelle,
                  });
                } else {
                  // DRK-366: im Handlager trägt die Charge den Verfall — ohne sie kein Schrank.
                  if (!z.chargeId) throw new BuchungAbgewiesen("Für den Schrank eine Charge wählen.");
                  b.zurueckgelegt = ruecklaufTx(tx, {
                    fahrzeugId: v.fahrzeugId, artikelId: a.artikelId, chargeId: z.chargeId,
                    menge: z.menge, zielLagerortId: z.zielLagerortId, quelle,
                  });
                }
              }
              if (a.auffuellen) {
                const { menge, herkunft } = a.auffuellen;
                if (herkunft.art === "handlager") {
                  // Spec 6.12.4: aus dem Handlager zählt in `nachfuellGebucht` (Chip „aus Handlager nachgefüllt").
                  b.nachfuellGebucht = auffuellenAusHandlagerTx(tx, {
                    artikelId: a.artikelId, menge, fahrzeugId: v.fahrzeugId, quelle, referenz,
                  });
                } else if (herkunft.art === "ort") {
                  if (herkunft.vonLagerortId === v.fahrzeugId) {
                    throw new BuchungAbgewiesen("Herkunft und Ziel müssen verschieden sein.");
                  }
                  b.aufgefuellt = aufladenVonOrtTx(tx, {
                    artikelId: a.artikelId, menge, fahrzeugId: v.fahrzeugId,
                    vonLagerortId: herkunft.vonLagerortId, chargeId: herkunft.chargeId, quelle,
                  });
                } else {
                  zugangAnEinheitBuchen(tx, {
                    artikelId: a.artikelId, menge, einheitId: v.fahrzeugId, quelle,
                    charge: herkunft.charge.art === "neu"
                      ? { art: "neu", chargenNr: herkunft.charge.chargenNr ?? "", verfall: herkunft.charge.verfall }
                      : herkunft.charge,
                  });
                  b.aufgefuellt = menge;
                }
              }
            } catch (e) {
              if (!(e instanceof BuchungAbgewiesen)) throw e;
              const name = artikelName(a.artikelId);
              throw e.message.includes(name) ? e : new BuchungAbgewiesen(`${name}: ${e.message}`);
            }
            bewegt.set(a.artikelId, b);
          }

          // 4. GERÄTE UND FLASCHEN — wie im Helfer-Check (Mängel, Messungen mit `check:<id>`).
          const geraeteGebucht = bucheGeraeteAntworten(tx, {
            fahrzeug: fz, antworten: v.geraete, quelle, checkId,
          });
          const flaschenGebucht = bucheFlaschenMessungen(tx, {
            fahrzeugId: v.fahrzeugId, flaschen: v.flaschen, quelle, referenz,
          });

          /*
           * 5. VERFALL JE FACH — ZULETZT, damit die Eingabe gilt und nicht von
           * `verfallFolgtDemMaterial` (Box, Aufladen) überschrieben wird. Nur
           * gezählte Fächer (Spec 6.12.2); ein fremdes wirft (Riegelfall).
           */
          for (const e of v.verfaelle) {
            if (!byId.has(e.sollPositionId)) throw new Error("Fach gehört nicht zu dieser Einheit");
            if (!gezaehltIds.has(e.sollPositionId)) {
              throw new BuchungAbgewiesen("Den Verfall nur in gezählten Fächern eintragen.");
            }
          }
          setzeFachVerfaelle(tx, { lagerortId: v.fahrzeugId, werte: v.verfaelle, quelle });

          // 6. DIE CHECK-ZEILE.
          const posErgebnis: CheckPositionRoh[] = v.positionen.map((p) => {
            const row = byId.get(p.sollPositionId)!;   // `gruppiereZaehlung` hat die Zugehörigkeit geprüft
            return {
              sollPositionId: row.id, artikelId: row.artikelId, soll: row.soll, ist: p.ist,
              ...(row.sollMax != null && row.sollMax > row.soll ? { sollMax: row.sollMax } : {}),
            };
          });
          let korrigiert = 0;
          let offen = 0;
          let ausgesondert = 0;
          let zurueckgelegt = 0;
          let aufgefuellt = 0;
          const artikelErgebnis: CheckArtikelRoh[] = [...zaehlung.values()].map((g) => {
            const { istMenge, korrektur } = stand.get(g.artikelId)!;
            const b = bewegt.get(g.artikelId)
              ?? { ausgesondert: 0, zurueckgelegt: 0, aufgefuellt: 0, nachfuellGebucht: 0 };
            /*
             * ⚠️ `istSumme` IST DER GEBUCHTE ABGLEICH (`Ist − mitgezählt`), nicht
             * die Summe der Positionen. `offenJeArtikel` zieht Nachgefülltes und
             * Aufgefülltes vom Ist ab; stünde die mitgezählte Menge zusätzlich im
             * Ist, zählte sie doppelt, und „offen" wäre zu klein — hier wie in
             * jeder Liste, die das Ergebnis später summiert. Die gezählten Werte
             * je Fach stehen unverändert in `positionen`.
             */
            const zeile: CheckArtikelRoh = {
              artikelId: g.artikelId, positionen: g.positionen.length,
              sollSumme: g.sollSumme, istSumme: istMenge, recordedVorher: istMenge - korrektur, korrektur,
              nachfuellGewuenscht: 0, nachfuellGebucht: b.nachfuellGebucht,
              ...(b.ausgesondert > 0 ? { ausgesondert: b.ausgesondert } : {}),
              ...(b.zurueckgelegt > 0 ? { zurueckgelegt: b.zurueckgelegt } : {}),
              ...(b.aufgefuellt > 0 ? { aufgefuellt: b.aufgefuellt } : {}),
            };
            korrigiert += Math.abs(korrektur);
            offen += offenJeArtikel(zeile);
            ausgesondert += b.ausgesondert;
            zurueckgelegt += b.zurueckgelegt;
            aufgefuellt += b.aufgefuellt + b.nachfuellGebucht;
            return zeile;
          });

          const verfallErgebnis = [...verfallFuerLagerort(tx, v.fahrzeugId).values()].map((e) => ({
            artikelId: e.artikelId, verfall: e.verfall, ampel: e.ampel, abgelaufen: e.abgelaufen,
          }));

          const abschluss: Omit<VerwaltungscheckWert, "checkId"> = {
            korrigiert, ausgesondert, zurueckgelegt, aufgefuellt, offen,
            geraeteAuffaellig: geraeteGebucht.auffaellig,
            flaschenAuffaellig: flaschenGebucht.auffaellig,
            plombenGesetzt: plombenErgebnis.length,
            geraeteGemeldet: geraeteGebucht.gemeldet,
          };
          schreibeCheckZeile(tx, {
            id: checkId, fahrzeugId: v.fahrzeugId, quelle,
            // ⚠️ Die Feldnamen sind nicht umbenennbar (`parseCheckErgebnis`).
            ergebnis: {
              version: 2,
              art: "verwaltung",
              positionen: posErgebnis,
              artikel: artikelErgebnis,
              geraete: geraeteGebucht.ergebnis,
              flaschen: flaschenGebucht.ergebnis,
              verfall: verfallErgebnis,
              plomben: plombenErgebnis,
              ...(v.kommentar ? { kommentar: v.kommentar } : {}),
              abschluss,
            },
          });
          return { checkId, ...abschluss };
        });
      } catch (e) {
        return { ok: false, fehler: e instanceof BuchungAbgewiesen ? e.message : NICHT_GESPEICHERT };
      }

      // Bestandsschreiber (Korrektur, Bewegungen); dazu, was nur ein Check ändert.
      revalidiereBestand();
      revalidatePath("/m/lagerbuch/verwaltung/checks");
      revalidatePath("/m/lagerbuch/verwaltung/sauerstoff");
      revalidatePath(verwaltungDetailPfadIntern("fahrzeuge", v.fahrzeugId));
      if (wert.geraeteGemeldet > 0) {
        revalidatePath("/m/lagerbuch/verwaltung/maengel");
        revalidatePath("/m/lagerbuch/verwaltung/geraete", "layout");
      }
      return { ok: true, wert };
    },
  );
}

/**
 * DER REST DER GEWÄHLTEN CHARGE NACH DER ZÄHLUNG — vor `ruecklaufTx` bzw.
 * `inEntnahmeboxTx`, deren Texte auch `bucheRuecklauf`/`bucheInEntnahmebox`
 * gehören und bleiben. Hier stehen Korrektur und Aussondern schon im Journal;
 * die Seite hat mit demselben Stand gerechnet (`chargenNachZaehlung`), und die
 * Absage sagt deshalb „nach der Zählung", nicht „heute".
 *
 * Eine fremde Charge fällt hier durch: der Schreibpfad weist sie mit eigenem Text ab.
 */
function pruefeChargeNachZaehlung(
  tx: Tx,
  a: { fahrzeug: { id: string; einheitenart: Einheitenart | null }; artikelId: string; chargeId: string; menge: number },
): void {
  const charge = tx.select({ artikelId: chargen.artikelId }).from(chargen).where(eq(chargen.id, a.chargeId)).get();
  if (!charge || charge.artikelId !== a.artikelId) return;
  const rest = restJeChargeFuerArtikelAnOrt(tx, a.artikelId, a.fahrzeug.id).get(a.chargeId) ?? 0;
  if (rest >= a.menge) return;
  const art = tx.select({ name: artikel.name, einheit: artikel.einheit }).from(artikel)
    .where(eq(artikel.id, a.artikelId)).get();
  throw new BuchungAbgewiesen(
    `${art?.name ?? "Dieser Artikel"}: nach der Zählung liegen von dieser Charge `
    + `${anDieserEinheit(a.fahrzeug.einheitenart)} nur ${Math.max(rest, 0)} ${art?.einheit ?? ""}`.trimEnd()
    + ". Es wurde nichts gebucht — bitte die Menge prüfen.",
  );
}

/** Das gespeicherte Ergebnis als Rückmeldung — `null`, wenn es fehlt oder nicht lesbar ist. */
function frueherAbschluss(checkId: string, ergebnis: string | null): VerwaltungscheckWert | null {
  try {
    const a = (JSON.parse(ergebnis ?? "null") as { abschluss?: Record<string, unknown> } | null)?.abschluss;
    if (!a) return null;
    const zahl = (k: keyof Omit<VerwaltungscheckWert, "checkId">) => (typeof a[k] === "number" ? (a[k] as number) : 0);
    return {
      checkId,
      korrigiert: zahl("korrigiert"),
      ausgesondert: zahl("ausgesondert"),
      zurueckgelegt: zahl("zurueckgelegt"),
      aufgefuellt: zahl("aufgefuellt"),
      offen: zahl("offen"),
      geraeteAuffaellig: zahl("geraeteAuffaellig"),
      flaschenAuffaellig: zahl("flaschenAuffaellig"),
      plombenGesetzt: zahl("plombenGesetzt"),
      geraeteGemeldet: zahl("geraeteGemeldet"),
    };
  } catch {
    return null;
  }
}
