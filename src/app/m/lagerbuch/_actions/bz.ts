"use server";
import { withAuditContext, auditActor, auditEvent } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pruefeBarcodeFrei } from "../_db/barcode";
import { getDb, type DB } from "../_db/client";
import {
  bzGeraete,
  bzKontrollen,
  lagerorte,
  newId,
} from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { normalisiereBarcode } from "../_lib/barcode";
import { MONAT_REGEX } from "../_lib/konstanten";
import { BEACHTUNG_HINWEIS_MAX } from "../_lib/grenzen";
import { beachtungsFelder, bewerteKontrolle } from "../_lib/domain/bz";
import { bzGeraetByBarcode } from "../_lib/lesepfade/bz";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const LISTENPFAD = "/m/lagerbuch/verwaltung/bz";
const LAGERORT_FEHLER = "Lagerort nicht gefunden oder inaktiv.";
const BARCODE_FEHLER = "Barcode bereits vergeben.";
const BZ_GERAET_FEHLER = "BZ-Gerät nicht gefunden.";

const GeraetSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  barcode: z.string().trim().optional(),
  lagerortId: z.string().min(1, "Standort wählen"),
  streifenLot: z.string().trim().optional(),
  level1Label: z.string().trim().optional(),
  level1Min: z.coerce.number().int().optional(),
  level1Max: z.coerce.number().int().optional(),
  level2Label: z.string().trim().optional(),
  level2Min: z.coerce.number().int().optional(),
  level2Max: z.coerce.number().int().optional(),
});

const AktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

const KontrolleSchema = z.object({
  geraetId: z.string().min(1),
  level1Wert: z.coerce.number().int().optional(),
  level2Wert: z.coerce.number().int().optional(),
  kompresseVerfall: z.string()
    .regex(MONAT_REGEX, "Verfall muss YYYY-MM sein")
    .optional(),
  sticks: z.coerce.number().int().min(0).max(9999).default(0),
  lanzetten: z.coerce.number().int().min(0).max(9999).default(0),
  batterieGewechselt: z.coerce.boolean().default(false),
  kommentar: z.string().trim().optional(),
  /**
   * DRK-311. ⚠️ EIGENES FELD, NICHT AUS `kommentar` ABGELEITET. Die
   * Gespraechsnotiz sagt „Nicht jede Bemerkung automatisch als Warnung
   * interpretieren" — „Streifen nachbestellt" ist kein Missstand. Wer hier
   * spart, macht aus jedem Kommentar einen gelben Status und aus dem gelben
   * Status ein Rauschen, das niemand mehr liest.
   */
  beachtung: z.coerce.boolean().default(false),
});

/**
 * ⚠️ DIESELBE GRENZE AUF BEIDEN WEGEN. Der Kommentar einer Kontrolle ist ein
 * Nachweisfeld und bleibt ungedeckelt — sobald er aber als Beachtungshinweis
 * ans Geraet wandert, gilt fuer ihn, was auch `beachtungSetzen` verlangt.
 * Sonst schreibt der eine Weg einen Wert, den der andere nicht mehr annimmt.
 *
 * ⚠️ SIE STEHT VOR `BeachtungSchema`, und das ist keine Stilfrage: das Schema
 * liest die Meldung beim IMPORT des Moduls. Eine Zeile weiter unten laege sie
 * in der temporalen Totzone, und jeder Aufruf dieser Datei — alle fuenf Actions
 * — endete in einem ReferenceError.
 */
const HINWEIS_ZU_LANG =
  `Hinweis ist zu lang (höchstens ${BEACHTUNG_HINWEIS_MAX} Zeichen).`;

/**
 * ⚠️ EIN LEERER HINWEIS IST DAS AUFHEBEN, nicht ein Fehler. Das ist der ganze
 * Weg zurueck: die Spalte traegt Zustand UND Begruendung in einem Feld
 * (`_db/schema.ts`), also heisst „kein Text" genau „keine Beachtung mehr".
 */
const BeachtungSchema = z.object({
  geraetId: z.string().min(1),
  hinweis: z.string().trim().max(BEACHTUNG_HINWEIS_MAX, HINWEIS_ZU_LANG).optional(),
});

const BEACHTUNG_OHNE_TEXT =
  "Bitte kurz aufschreiben, was zu beachten ist — ohne Hinweis ist der gelbe Status nicht zu verstehen.";


type FehlerErgebnis = Extract<ActionErgebnis, { ok: false }>;

function validierungsFehler(e: unknown): FehlerErgebnis {
  const feldFehler = zodFehler(e);
  return {
    ok: false,
    fehler: "Bitte die markierten Felder prüfen.",
    ...(feldFehler ? { feldFehler } : {}),
  };
}

function festerFehler(fehler: string): FehlerErgebnis {
  return { ok: false, fehler };
}

function barcodeFehler(): FehlerErgebnis {
  return {
    ok: false,
    fehler: BARCODE_FEHLER,
    feldFehler: { barcode: BARCODE_FEHLER },
  };
}

function orNull<T>(value: T | undefined): T | null {
  return value === undefined || value === "" ? null : value;
}

/**
 * ⚠️ DIE ERFASSUNGSSEITE GEHOERT DAZU, UND ZWAR FUER JEDE DIESER ACTIONS
 * (Reviewrunde 3). `/bz/<id>/kontrolle` liest die Geraetezeile: die
 * Level-Beschriftungen samt Referenzbereichen UND seit DRK-311 den Merker, ob
 * schon ein Beachtungshinweis steht. Sie stand hier nicht — mit zwei Folgen,
 * von denen die zweite still ist:
 *
 *  * Nach „Beachtung erforderlich: ja" bleibt das Formular stehen und setzt
 *    sich zurueck. Ohne diese Zeile behauptet der Erklaertext darunter
 *    weiterhin, es gebe keinen Hinweis — und ein zweites „ja" ersetzt den
 *    gerade erst gesetzten Vermerk, ohne die Ersetzung anzukuendigen.
 *  * Wer die Referenzbereiche aendert, sieht auf der Erfassungsseite noch die
 *    alten Grenzen in den Feldbeschriftungen, waehrend die Bewertung schon
 *    gegen die neuen rechnet.
 *
 * Beides betrifft dieselbe Zeile, also gehoert der Pfad in den gemeinsamen
 * Helfer und nicht in einen einzelnen Aufrufer.
 */
function revalidate(id: string) {
  revalidatePath(LISTENPFAD);
  revalidatePath(`${LISTENPFAD}/${id}`);
  revalidatePath(`${LISTENPFAD}/${id}/kontrolle`);
}

/**
 * DAS AUSDRUECKLICHE PROTOKOLLEREIGNIS ZUR BEACHTUNG — DRK-311, Reviewrunde 3.
 *
 * ⚠️ DER DATENBANK-TRIGGER ALLEIN BEANTWORTET DIE FRAGE NICHT. `audit_bz_geraete_update`
 * schreibt `action: "update"`, `objectType: "bz_geraete"` — dieselbe Zeile wie
 * bei einer Namensaenderung, einem neuen Referenzbereich oder dem
 * Aktiv-Schalter. Das Ereignisschema traegt keine Spaltenliste
 * (`core/audit/types.ts`), also ist aus dem Protokoll NICHT zu lesen, ob jemand
 * einen Aufmerksamkeitshinweis gesetzt, umformuliert oder aufgehoben hat.
 *
 * Genau das war aber die Begruendung dafuer, die Beachtung ans GERAET zu haengen
 * statt in die append-only Kontrolltabelle. Die Begruendung traegt erst mit
 * diesem Ereignis; ohne es waere sie eine Behauptung gewesen.
 *
 * ⚠️ `delete` FUERS AUFHEBEN, `update` FUERS SETZEN UND UMFORMULIEREN. Die
 * Aktionsliste ist fest (`AUDIT_ACTIONS`); „aufgehoben" ist unter ihnen am
 * ehesten ein Loeschen, und es ist die Unterscheidung, die jemand beim
 * Nachsehen wirklich braucht.
 *
 * ⚠️ DER HINWEISTEXT STEHT NICHT IM EREIGNIS. Das Protokoll fuehrt Objekte,
 * keine Inhalte — und der Text kann ein Geraet beschreiben, das gerade jemand
 * bemaengelt hat.
 */
function protokolliereBeachtung(geraetId: string, gesetzt: boolean): void {
  auditEvent({
    module: "lagerbuch",
    action: gesetzt ? "update" : "delete",
    objectType: "bz_beachtung",
    objectRef: geraetId,
    result: "success",
    origin: "server",
  });
}

function bzGeraetExistiert(db: DB, id: string): boolean {
  return Boolean(db.select({ id: bzGeraete.id }).from(bzGeraete)
    .where(eq(bzGeraete.id, id))
    .get());
}

/**
 * Die drei Geraete-Actions tragen absichtlich dieselben Namen wie die
 * generischen Geraete-Actions: gleicher Vorgang, eigener Fachbereich.
 */
export async function geraetSpeichern(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis<{ id: string }>> => {

    const geparst = GeraetSchema.safeParse(eingabe);
    if (!geparst.success) return validierungsFehler(geparst.error);
    const v = geparst.data;
    const id = v.id ?? newId();
    const barcode = orNull(v.barcode);

    try {
      if (v.id && !bzGeraetExistiert(db, v.id)) {
        return festerFehler(BZ_GERAET_FEHLER);
      }

      const lagerort = db.select({ id: lagerorte.id }).from(lagerorte)
        .where(and(
          eq(lagerorte.id, v.lagerortId),
          eq(lagerorte.aktiv, true),
        ))
        .get();
      if (!lagerort) return festerFehler(LAGERORT_FEHLER);

      if (barcode) {
        pruefeBarcodeFrei(
          db,
          barcode,
          v.id ? { tabelle: "bzGeraet", id: v.id } : null,
        );
      }

      const felder = {
        name: v.name,
        barcode,
        lagerortId: v.lagerortId,
        streifenLot: orNull(v.streifenLot),
        level1Label: orNull(v.level1Label),
        level1Min: orNull(v.level1Min),
        level1Max: orNull(v.level1Max),
        level2Label: orNull(v.level2Label),
        level2Min: orNull(v.level2Min),
        level2Max: orNull(v.level2Max),
      };

      if (v.id) {
        db.update(bzGeraete)
          .set(felder)
          .where(eq(bzGeraete.id, v.id))
          .run();
      } else {
        db.insert(bzGeraete).values({
          id,
          aktiv: true,
          createdAt: new Date(),
          ...felder,
        }).run();
      }
    } catch (e) {
      if (e instanceof Error && e.name === "BarcodeKollision") {
        return barcodeFehler();
      }
      return festerFehler("BZ-Gerät konnte nicht gespeichert werden.");
    }

    revalidate(id);
    return { ok: true, wert: { id } };
  });
}

export async function setGeraetAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {

    const geparst = AktivSchema.safeParse(eingabe);
    if (!geparst.success) return festerFehler("Ungültige Eingabe.");

    try {
      if (!bzGeraetExistiert(db, geparst.data.id)) {
        return festerFehler(BZ_GERAET_FEHLER);
      }

      db.update(bzGeraete)
        .set({ aktiv: geparst.data.aktiv })
        .where(eq(bzGeraete.id, geparst.data.id))
        .run();
    } catch {
      return festerFehler("BZ-Gerätestatus konnte nicht geändert werden.");
    }

    revalidate(geparst.data.id);
    return { ok: true };
  });
}

export async function geraetZuBarcode(
  rohwert: string,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string } | null>> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis<{ id: string } | null>> => {

    try {
      const barcode = normalisiereBarcode(rohwert);
      if (!barcode) return { ok: true, wert: null };
      return { ok: true, wert: bzGeraetByBarcode(db, barcode) };
    } catch {
      return festerFehler("BZ-Gerät konnte nicht gesucht werden.");
    }
  });
}

/**
 * Schreibt genau eine append-only Kontrollzeile. `bewerteKontrolle` liefert die
 * drei Bewertungswerte; der rohe Snapshot friert die sieben Referenzfelder in
 * der vertraglichen Reihenfolge ein.
 */
export async function kontrolleErfassen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string; bestanden: boolean }>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<{ id: string; bestanden: boolean }>> => {

    const geparst = KontrolleSchema.safeParse(eingabe);
    if (!geparst.success) return validierungsFehler(geparst.error);
    const v = geparst.data;

    let id: string;
    let bestanden: boolean;
    try {
      const geraet = db.select().from(bzGeraete)
        .where(eq(bzGeraete.id, v.geraetId))
        .get();
      if (!geraet) return festerFehler("Gerät nicht gefunden.");

      const level1Wert = v.level1Wert ?? null;
      const level2Wert = v.level2Wert ?? null;
      const bewertung = bewerteKontrolle({
        level1Wert,
        level1Min: geraet.level1Min,
        level1Max: geraet.level1Max,
        level2Wert,
        level2Min: geraet.level2Min,
        level2Max: geraet.level2Max,
      });

      const refSnapshot = JSON.stringify({
        streifenLot: geraet.streifenLot,
        level1Label: geraet.level1Label,
        level1Min: geraet.level1Min,
        level1Max: geraet.level1Max,
        level2Label: geraet.level2Label,
        level2Min: geraet.level2Min,
        level2Max: geraet.level2Max,
      });

      /**
       * DRK-311: Beachtung VERLANGT einen Satz, und der Satz ist der Kommentar.
       *
       * ⚠️ DIE PRUEFUNG STEHT HIER UND NICHT IM SCHEMA, weil sie ZWEI Felder
       * verbindet — `z.object` prueft jedes fuer sich, und ein `superRefine`
       * darueber landete im Fehlerpfad ohne Feldbezug. So zeigt das Formular
       * den Satz an der Stelle, an der er zu beheben ist.
       *
       * Ohne diesen Riegel entstuende genau der Zustand, den das Ticket
       * ausschliesst: ein gelber Status ohne verstaendlichen Hinweis.
       */
      const beachtungsHinweis = orNull(v.kommentar);
      if (v.beachtung && beachtungsHinweis === null) {
        return {
          ok: false,
          fehler: BEACHTUNG_OHNE_TEXT,
          feldFehler: { kommentar: BEACHTUNG_OHNE_TEXT },
        };
      }
      /**
       * ⚠️ UND DIE LAENGE, AUS DEMSELBEN GRUND. `KontrolleSchema.kommentar`
       * deckelt nicht — als Nachweisfeld soll es das auch nicht. Hier wird der
       * Kommentar aber zum Geraetezustand, und `beachtungSetzen` nimmt oberhalb
       * dieser Grenze nichts mehr an: ohne diese Zeile entstuende ein Hinweis,
       * den das Geraeteblatt nicht mehr speichern kann, ohne ihn zu kuerzen.
       *
       * ⚠️ DIE KONTROLLE WIRD GAR NICHT ERST GESCHRIEBEN. `bz_kontrollen` ist
       * append-only — eine Zeile, deren Beachtung scheitert, bliebe fuer immer
       * als halber Vorgang stehen.
       */
      if (v.beachtung && beachtungsHinweis !== null
          && beachtungsHinweis.length > BEACHTUNG_HINWEIS_MAX) {
        return {
          ok: false,
          fehler: HINWEIS_ZU_LANG,
          feldFehler: { kommentar: HINWEIS_ZU_LANG },
        };
      }

      id = newId();
      bestanden = bewertung.bestanden;
      const jetzt = new Date();
      /**
       * ⚠️ EINE TRANSAKTION UEBER BEIDE SCHREIBVORGAENGE. Die Kontrollzeile ist
       * append-only: waere sie geschrieben und das nachfolgende UPDATE des
       * Geraets schluege fehl, gaebe es einen Nachweis mit Bemerkung und kein
       * Geraet, das darauf zeigt — und zurueckgenommen werden koennte die Zeile
       * nie (0002).
       */
      db.transaction((tx) => {
        tx.insert(bzKontrollen).values({
          id,
          geraetId: geraet.id,
          ts: jetzt,
          quelleTyp: "oidc",
          quelleId: viewer.sub,
          level1Wert,
          level1ImBereich: bewertung.level1ImBereich,
          level2Wert,
          level2ImBereich: bewertung.level2ImBereich,
          kompresseVerfall: v.kompresseVerfall ?? null,
          sticks: v.sticks,
          lanzetten: v.lanzetten,
          batterieGewechselt: v.batterieGewechselt,
          kommentar: beachtungsHinweis,
          bestanden,
          refSnapshot,
        }).run();

        /**
         * ⚠️ NUR SETZEN, NIE AUFHEBEN. „Beachtung: nein" heisst hier „ich habe
         * nichts Neues zu melden" — nicht „das Vorherige hat sich erledigt".
         * Eine turnusmaessige Kontrolle wuerde sonst still den Hinweis
         * loeschen, den jemand anders letzte Woche gesetzt hat, und niemand
         * merkte es: die Liste waere danach einfach wieder unauffaellig.
         * Aufgehoben wird ausdruecklich, am Geraet (`beachtungSetzen`).
         */
        if (!v.beachtung) return;
        tx.update(bzGeraete)
          .set(beachtungsFelder(geraet, beachtungsHinweis, jetzt))
          .where(eq(bzGeraete.id, geraet.id))
          .run();
      });
      /*
       * ⚠️ NACH der Transaktion, nicht darin: `auditEvent` schluckt seine
       * eigenen Fehler (`core/audit/server.ts`), aber ein Schreibvorgang
       * innerhalb der offenen Transaktion haette an ihrer Rolle teilgenommen —
       * ein Rollback nahm das Protokoll mit, und ein Protokoll, das mit der
       * Sache verschwindet, die es bezeugen soll, ist keins.
       */
      if (v.beachtung) protokolliereBeachtung(geraet.id, true);
    } catch {
      return festerFehler("Kontrolle konnte nicht gespeichert werden.");
    }

    revalidate(v.geraetId);
    return { ok: true, wert: { id, bestanden } };
  });
}

/**
 * DIE BEACHTUNG SETZEN, UMFORMULIEREN ODER AUFHEBEN — DRK-311.
 *
 * ⚠️ EIN LEERER `hinweis` IST DAS AUFHEBEN. Damit gibt es genau einen Weg
 * zurueck, und er liegt am Geraet: `bz_kontrollen` ist append-only (0002), ein
 * Hinweis dort waere nur noch loszuwerden, indem jemand eine Kontrolle erfindet,
 * die nie stattgefunden hat.
 *
 * ⚠️ DIE HERKUNFT STEHT NICHT IN DIESER TABELLE, UND DAS IST ABSICHT. Wer wann
 * gesetzt oder aufgehoben hat, traegt der UPDATE-Trigger ins Zugriffsprotokoll
 * (0011) — zwei eigene Spalten daneben waeren eine zweite, schlechtere Wahrheit
 * ueber denselben Vorgang.
 */
export async function beachtungSetzen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ erforderlich: boolean }>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<{ erforderlich: boolean }>> => {

    const geparst = BeachtungSchema.safeParse(eingabe);
    if (!geparst.success) return validierungsFehler(geparst.error);
    const v = geparst.data;
    const hinweis = orNull(v.hinweis);

    try {
      const geraet = db.select().from(bzGeraete)
        .where(eq(bzGeraete.id, v.geraetId))
        .get();
      if (!geraet) return festerFehler(BZ_GERAET_FEHLER);

      db.update(bzGeraete)
        .set(beachtungsFelder(geraet, hinweis, new Date()))
        .where(eq(bzGeraete.id, geraet.id))
        .run();
      protokolliereBeachtung(geraet.id, hinweis !== null);
    } catch {
      return festerFehler("Beachtung konnte nicht gespeichert werden.");
    }

    revalidate(v.geraetId);
    return { ok: true, wert: { erforderlich: hinweis !== null } };
  });
}
