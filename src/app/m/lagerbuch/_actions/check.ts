"use server";
import { withAuditContext } from "@/core/audit/server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "../_db/client";
import {
  checks, sollPositionen, o2Flaschen, lagerorte, plomben, newId,
} from "../_db/schema";
import { bereichsAbweisung } from "../_lib/helferBereich";
import { requireHelferSchreibend } from "../_lib/helferZugang";
import { journalQuelle, zugangsAkteur } from "../_lib/zugangHerkunft";
import {
  CHECK_ABGLEICH, CHECK_NACHFUELLUNG,
  ENTNAHMEBOX_ID, ENTNAHMEBOX_KOMMENTAR, ENTNAHMEBOX_NAME,
  MONAT_REGEX, ZUSTAENDE,
  dieseEinheit, grossAmAnfang,
} from "../_lib/konstanten";
import { korrekturAufLagerort } from "../_lib/schreibpfade/korrektur";
import { revalidiereBestand } from "../_lib/revalidierung";
import { umlagerungAusBereich, umlagerungVonOrt } from "../_lib/schreibpfade/umlagerung";
import { handlagerOrte } from "../_lib/lesepfade/orte";
import { setzeVerfall, verfallFolgtDemMaterial } from "../_lib/schreibpfade/lagerortVerfall";
import { setzeFachVerfaelle } from "../_lib/schreibpfade/fachVerfall";
import { verfallFuerLagerort } from "../_lib/lesepfade/verfall";
import { druckZuHoch } from "../_lib/domain/o2";
import {
  bucheFlaschenMessungen, bucheGeraeteAntworten, gruppiereZaehlung, schreibeCheckZeile,
  setzePlombenNummern,
} from "../_lib/schreibpfade/check";
import { offenJeArtikel } from "../_lib/domain/check";
import { ueberschuss } from "../_lib/domain/sollBereich";
import { ENTNAHMEBOX_PRAEFIX } from "../_lib/vorgang";
import { RIEGEL_TEXTE, type HelferErgebnis } from "../_lib/actionTypen";
import { plombeDecktAb, plombenNummerNorm } from "../_lib/plombe";
import type { CheckPlombeRoh } from "../_lib/checkErgebnis";

/**
 * DER FAHRZEUG-CHECK-ABSCHLUSS — §5.8, §7.9.4. EINE Transaktion.
 *
 * WICHTIG: Der Fahrzeugbestand ist pro (Artikel, Lagerort) — NICHT pro
 * Fach/Soll-Position. Liegt derselbe Artikel in mehreren Faechern, teilen sich
 * diese Positionen EINEN Fahrzeug-Bestand (§5.7.1). Deshalb wird pro ARTIKEL
 * (nicht pro Position) genau einmal:
 *   1. ABGLEICH   — Fahrzeugbestand des Artikels auf die Summe der gezaehlten Ist.
 *   2. NACHFUELLEN — die Summe der bestaetigten Mengen aus dem Handlager umgelagert.
 *   3. ENTNAHMEBOX — IDA-247: die bestaetigte Menge ueber „OK bis" in die Kiste.
 */

const CheckSchema = z.object({
  fahrzeugId: z.string().min(1),
  /*
   * IDA-358: die Sendungs-ID des Geräts (`core/entwurf`). Sie bleibt über alle
   * Sendeversuche gleich und wird die ID des Checks — kam ein Versuch an und nur
   * die Antwort ging verloren (Rollout mitten in der Antwort), findet der
   * nächste Versuch den Check vor und bucht nicht ein zweites Mal.
   */
  sendungId: z.string().uuid().optional(),
  /*
   * IDA-222: Kurz- oder Vollcheck. Vorgabe „voll", weil jeder Check vor
   * IDA-222 einer war — eine Nutzlast ohne `art` meint genau das.
   *
   * ⚠️ „voll" WIRD HIER NICHT AUF VOLLSTAENDIGKEIT GEPRUEFT. Die Oberflaeche
   * sendet im Vollcheck jede Position (der Zaehlschritt sperrt „Weiter", bis
   * alles gezaehlt ist); serverseitig war eine Teilnutzlast schon vor IDA-222
   * zulaessig und bleibt es. Geprueft wird, was den BESTAND schuetzt: dass ein
   * Artikel ganz gezaehlt ist (unten).
   */
  art: z.enum(["kurz", "voll"]).default("voll"),
  /*
   * IDA-222: im Kurzcheck die ABGELESENEN Nummern (`null` = Plombe fehlt oder
   * ist aufgebrochen), im Vollcheck die NEU GESETZTEN (leer = nicht neu gesetzt,
   * die Plombe bleibt, wie sie war).
   */
  plomben: z.array(z.object({
    plombeId: z.string().min(1),
    nummer: z.string().trim().max(64).nullable(),
  })).default([]),
  // Kann leer sein (Fahrzeug ohne Soll-Artikel, aber mit Geraeten). Der Flow
  // verhindert komplett leere Checks; serverseitig ist ein leerer
  // Positions-Check harmlos (bucht nichts).
  positionen: z.array(z.object({
    sollPositionId: z.string().min(1),
    ist: z.coerce.number().int().min(0),
    // Vom Helfer im Nachfuell-Schritt bestaetigte Menge. Serverseitig pro
    // Position auf max(0, Soll − Ist) geklemmt und ueber die Umlagerung an der
    // Handlager-Verfuegbarkeit gekappt.
    nachfuellMenge: z.coerce.number().int().min(0),
    /*
     * IDA-247: vom Helfer bestaetigte Menge, die von DIESER Position in die
     * Entnahmebox gewandert ist. Serverseitig auf den Ueberschuss ueber „OK
     * bis" geklemmt (`ueberschuss`). Vorgabe 0: eine Nutzlast aus einem
     * Fenster von vor IDA-247 legt nichts in die Kiste.
     *
     * ⚠️ BESTAETIGT, NICHT ABGELEITET. Der Kopf von `_actions/entnahmebox.ts`
     * verbietet ein automatisches Umleiten der Check-Differenz in die Box — sie
     * hat zu viele Ursachen (verbraucht, verzaehlt, zu viel drauf). Gebucht
     * wird hier nur, was jemand in die Hand genommen und bestaetigt hat.
     */
    boxMenge: z.coerce.number().int().min(0).default(0),
  })).default([]),
  geraete: z.array(z.object({
    geraetId: z.string().min(1),
    vorhanden: z.boolean(),
    zustand: z.enum(ZUSTAENDE).optional(),
    bemerkung: z.string().trim().optional(),
    /*
     * IDA-411: „Selbsttest bestanden?" bei einem Gerät mit dieser Frage. OPTIONAL: ein Entwurf von
     * vor IDA-411 (IDA-358, er liegt auf dem Gerät) kennt das Feld nicht und soll trotzdem ankommen.
     * Bei einem Gerät OHNE die Frage wird ein mitgesendeter Wert verworfen, nicht gespeichert.
     */
    selbsttest: z.boolean().optional(),
  })).default([]),
  flaschen: z.array(z.object({
    flascheId: z.string().min(1),
    druckBar: z.coerce.number().int().min(0),
  })).default([]),
  // Im Fahrzeug abgelesener Verfall je Artikel („YYYY-MM", fruehestes Datum im
  // Fahrzeug). Durchgehend optional: null/"" loescht eine fruehere Angabe, ein
  // FEHLENDER Eintrag laesst sie unangetastet.
  //
  // IDA-412: JE FACH (`sollPositionId`). Die Form je Artikel (`artikelId`) bleibt lesbar: ein
  // Entwurf von vorher liegt womöglich noch auf einem Gerät (IDA-358). Sie gilt für alle Fächer
  // des Artikels und verwirft deren Einzeldaten, wie jeder artikelweite Schreibweg.
  verfaelle: z.array(z.union([
    z.object({
      sollPositionId: z.string().min(1),
      verfall: z.union([z.string().regex(MONAT_REGEX), z.literal("")])
        .nullable().transform((v) => v || null),
    }),
    z.object({
      artikelId: z.string().min(1),
      verfall: z.union([z.string().regex(MONAT_REGEX), z.literal("")])
        .nullable().transform((v) => v || null),
    }),
  ])).default([]),
});

export type CheckAbschlussWert = {
  checkId: string;
  /** TATSAECHLICH umgelagert — nach der stillen Kappung in der Umlagerung. */
  nachgefuellt: number;
  /** Was der Helfer bestaetigt hat und in der Hand haelt (§7.9.4, NEU). */
  nachfuellBestaetigt: number;
  /** IDA-247: in die Entnahmebox umgelagert. */
  inBox: number;
  offen: number;
  geraeteAuffaellig: number;
  flaschenAuffaellig: number;
  /** Flaschen mit `nennfuelldruckBar <= 0` — nicht bewertbar, nicht „niedrig". */
  flaschenNichtBewertbar: number;
  verfallAuffaellig: number;
  /** IDA-222: im Kurzcheck abgelesene Plomben, die nicht mehr stehen. */
  plombenOffen: number;
  /** IDA-222: im Vollcheck neu gesetzte Plomben. */
  plombenGesetzt: number;
  /**
   * IDA-377: auffällige Geräte, zu denen nach diesem Check ein offener Mangel steht. Ein Check von
   * vor IDA-377 hat das Feld nicht und meldet 0 — er hat auch nichts gemeldet.
   */
  geraeteGemeldet: number;
};

export async function checkAbschluss(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<HelferErgebnis<CheckAbschlussWert>> {
  // ERSTE Anweisung, und der Rueckgabewert MUSS ausgewertet werden. Bis zur
  // Portierung warf dieser Riegel (session.ts:25,28) — ein Wurf liess sich nicht
  // uebersehen. Ein Rueckgabewert schon: `await requireHelferSchreibend(db)` ohne
  // Pruefung ist typkorrekt, lint-sauber und oeffnet diese Action fuer jeden. Das
  // einzige Netz dagegen ist der E2E „gesperrter Token wird an der Buchung
  // abgewiesen" (§3.8.3, §7.12.4) — und der liegt in Teil 6, T171.
  //
  // ⚠️ `requireLagerbuchHost` wird hier NICHT gerufen: `requireHelferSchreibend`
  // ruft ihn INTERN als erste Anweisung (Teil 1, T10). Genau deshalb ist die
  // Zusage „jede Helfer-Action ist host-gebunden" durch KONSTRUKTION wahr und
  // nicht durch eine Liste, die die naechste Action vergisst.
  const riegel = await requireHelferSchreibend(db);
  if (!riegel.ok) return { ok: false, grund: riegel.grund, text: RIEGEL_TEXTE[riegel.grund] };
  /*
   * DER REGAL-CODE DARF HIER NICHT DURCH — DRK-406, und er steht DIREKT hinter
   * dem Sitzungsriegel, vor Audit-Kontext und Validierung. Weiter unten waere
   * er eine Absage, die vorher schon eine Zeile geschrieben haette.
   *
   * ⚠️ DIE REITERLEISTE ZEIGT DEN CHECK FUER DIESEN ZUGANG GAR NICHT AN, und
   * die Seite leitet um. Beides ist Anzeige. Diese Zeile ist der Riegel: eine
   * selbst gebaute Anfrage an diese Action kommt an keiner Navigation vorbei.
   */
  const bereich = bereichsAbweisung(riegel.zugang, "check");
  if (bereich) return bereich;
  return withAuditContext({ actor: zugangsAkteur(riegel.zugang) }, async (): Promise<HelferErgebnis<CheckAbschlussWert>> => {

    // ⚠️ ANSATZPUNKT 2 VON 2 fuer eine spaetere Durchsetzung von
    // `tokens.scope_lagerort_id` als RIEGEL (offene Betreiberfrage 5, §7.9.1).
    // Hier stuende:
    //     if (scope && scope !== v.fahrzeugId) return { ok:false, grund:"gesperrt", … };
    // Heute ist die Spalte Dekoration; ein Fahrzeug-Code kann jedes Fahrzeug
    // checken (Falle 14). Ansatzpunkt 1 ist die `gewaehlt`-Zeile in
    // `helfer/check/page.tsx`. MEHR BRAUCHT ES DANN NICHT.
    //
    // ⚠️ NUR FUER DEN SCOPE. Die abgedruckte Zeile prueft weder `typ` noch
    // `aktiv`; Art- und Aktiv-Pruefung des Fahrzeugs gehoeren ZUSAETZLICH dazu
    // und stehen seit dem Abschluss-Fix von Teil 4 unten als Riegel 5, direkt
    // hinter `const v = geparst.data`.

    const geparst = CheckSchema.safeParse(eingabe);
    if (!geparst.success) {
      // Eine ungueltige Nutzlast ist erwartbar (altes Fenster, halb geladene
      // Seite) und deshalb ein RUECKGABEWERT, kein Wurf (§7.3, Falle 66).
      //
      // ⚠️ `grund: "eingabe"`, NICHT `"netz"` (Betreiberentscheidung B4). Global
      // Constraint 12 weist `"netz"` ausschliesslich dem Client zu; es entsteht
      // NIE serverseitig. Die Verbindung STEHT hier — sie hat gerade eine
      // unvollstaendige Nutzlast geliefert.
      return {
        ok: false,
        grund: "eingabe",
        text: "Die Eingabe war unvollständig. Bitte die Seite neu laden und erneut abschließen.",
      };
    }
    const v = geparst.data;

    /*
     * IDA-358 — DIE WIEDERHOLUNG EINES SCHON GEBUCHTEN CHECKS. Direkt hinter der
     * Validierung und VOR jeder fachlichen Prüfung: nach dem ersten Abschluss hat
     * sich der Bestand bewegt, und eine Prüfung weiter unten (Entnahmebox,
     * Handlager) könnte die Wiederholung abweisen, obwohl der Check längst steht.
     * Geantwortet wird mit dem Ergebnis von damals (`abschluss` im Ergebnis-JSON).
     */
    if (v.sendungId) {
      const frueher = db.select().from(checks).where(eq(checks.id, v.sendungId)).get();
      if (frueher) {
        const wert = frueher.fahrzeugId === v.fahrzeugId ? frueherAbschluss(frueher.id, frueher.ergebnis) : null;
        if (wert) return { ok: true, wert };
        return { ok: false, grund: "eingabe", text: "Dieser Check passt nicht zu dieser Einheit." };
      }
    }

    // WURF-FREIER RIEGEL 5 — die WURZEL-ID gegen die Datenbank, wie die vier
    // Kind-IDs unten (:153, :198, :212, :255 im Vorzustand).
    //
    // WARUM ES IHN BRAUCHT: `CheckSchema` verlangt fuer `fahrzeugId` nur
    // `z.string().min(1)`; der Wert ist danach Filter der Soll-Positionen,
    // `lagerortId` der Bestandskorrektur, `nachLagerortId` einer echten
    // Umlagerung aus dem Handlager, `lagerortId` der Verfallsschreibung UND
    // `fahrzeugId` der geschriebenen `checks`-Zeile. Weder
    // `_lib/schreibpfade/umlagerung.ts` noch `_lib/schreibpfade/korrektur.ts`
    // pruefen `typ` oder `aktiv` nach — richtig so, sie erwarten einen
    // validierten Aufrufer. Der Fremdschluessel auf `lagerorte.id`
    // (`_db/schema.ts:217`) faengt allein den frei erfundenen String ab, NICHT
    // die falsche Art (ein `typ: "lager"`-Eintrag existiert bereits) und NICHT
    // den stillgelegten Eintrag.
    //
    // Die Schwester-Action macht dieselbe Pruefung mit derselben Begruendung
    // (`_actions/buchung.ts:181-185`), und `helfer/check/page.tsx:75-77` filtert
    // aus demselben Grund auf `aktiv` — „sonst laedt eine geratene ID die Daten
    // eines stillgelegten Fahrzeugs".
    //
    // ⚠️ RUECKGABEWERT UND KEIN WURF: eine Stilllegung WAEHREND des Checks ist
    // eine erwartbare Lage im Sinn von Falle 66 — ein Check dauert zehn bis
    // zwanzig Minuten (`_lib/helferSitzung.ts`, §2.9), und `sollPositionen`
    // ueberleben eine Stilllegung (`lagerorte.aktiv` ist ein reines Flag,
    // `_db/schema.ts:37`), die Nutzlast liefe also durch alle vier bestehenden
    // Wuerfe hindurch. `grund: "eingabe"` ist der Wert aus Betreiberentscheidung
    // B4, und `darfErneuern("eingabe") === false` ist hier auch fachlich richtig:
    // ein stillgelegtes Fahrzeug wird nicht dadurch aktiv, dass jemand die
    // Sitzung erneuert.
    const fz = db.select().from(lagerorte).where(eq(lagerorte.id, v.fahrzeugId)).get();
    if (!fz || fz.typ !== "fahrzeug" || !fz.aktiv) {
      /*
       * ⚠️ ART-BEWUSST, UND DIE INSEL GIBT DEN TEXT WOERTLICH WEITER (DRK-309,
       * Reviewrunde 10). `CheckFlow` formuliert eine Servermeldung
       * grundsaetzlich nicht neu (§7.3) — was hier steht, liest die Helferin
       * genau so. Ein festes „Dieses Fahrzeug" waere damit die EINZIGE Stelle
       * der ganzen Checkstrecke, an der eine Tasche wieder zum Fahrzeug wird,
       * und zwar auf einem Weg, den der Quelltext daneben als erwartet
       * beschreibt: die Verwaltung legt still, waehrend jemand zaehlt.
       *
       * ⚠️ DER RUECKFALL IST NEUTRAL, NICHT „Fahrzeug". Dieser Zweig faengt
       * DREI Faelle: die Zeile fehlt ganz, sie ist kein Traeger, oder sie ist
       * stillgelegt. In den ersten beiden gibt es keine Art — dann ist
       * „Diese Einheit" das Ehrlichste, was dort stehen kann.
       */
      const wer = fz
        ? grossAmAnfang(dieseEinheit(fz.einheitenart))
        : "Diese Einheit";
      return {
        ok: false,
        grund: "eingabe",
        text: `${wer} ist nicht mehr aktiv. Bitte die Seite neu laden.`,
      };
    }

    /*
     * DIE QUELLE JEDER BUCHUNG DIESES CHECKS — DRK-305.
     *
     * Beim Kärtchen ist das der CODE, nicht die Token-Kennung: das Journal
     * zeigt ihn als Klarnamen an (`_db/quelle.ts`). Beim angemeldeten Konto ist
     * es der OIDC-`sub` mit `quelleTyp: "oidc"` — dieselbe Form, die die
     * Verwaltungs-Actions seit jeher schreiben. Die Fallunterscheidung steht
     * EINMAL in `_lib/zugangHerkunft.ts`; ein zweites `"token" as const` hier
     * schriebe eine OIDC-Kennung in die Token-Spalte, und die Zeile ist
     * append-only.
     */
    /*
     * IDA-247 — DIE KISTE MUSS AUFNEHMEN, BEVOR IRGENDETWAS GEBUCHT WIRD.
     * Dieselben Riegel wie in `bucheInEntnahmebox` (Riegel 2), hier als
     * Rueckgabewert vor der Transaktion: ohne Box laege das Material sonst an
     * einem Ort, den keine Oberflaeche zeigt. Die Seite bietet die Box nur an,
     * wenn sie aufnimmt; dieser Zweig faengt die Stilllegung waehrend des
     * Checks.
     */
    if (v.positionen.some((p) => p.boxMenge > 0)) {
      const box = db.select({ typ: lagerorte.typ, aktiv: lagerorte.aktiv })
        .from(lagerorte).where(eq(lagerorte.id, ENTNAHMEBOX_ID)).get();
      if (!box || box.typ !== "lager" || !box.aktiv) {
        return {
          ok: false,
          grund: "eingabe",
          text: `Die ${ENTNAHMEBOX_NAME} nimmt gerade nichts auf. Bitte bei „Zu viel an Bord" `
            + "0 einstellen, das Material liegen lassen und der Verwaltung melden.",
        };
      }
    }

    /*
     * IDA-377 — EIN DRUCK ÜBER DEM GLAUBHAFTEN HÖCHSTWERT WIRD NICHT GEBUCHT. Die Oberfläche lässt ihn
     * gar nicht erst abschließen; hier steht die Absage für jeden anderen Weg, als Rückgabewert und vor
     * der Transaktion, damit die Helferin ihn am Feld korrigieren kann.
     */
    if (v.flaschen.length > 0) {
      const nenn = new Map(db.select({ id: o2Flaschen.id, nenn: o2Flaschen.nennfuelldruckBar })
        .from(o2Flaschen).where(eq(o2Flaschen.lagerortId, v.fahrzeugId)).all().map((f) => [f.id, f.nenn]));
      if (v.flaschen.some((f) => druckZuHoch(f.druckBar, nenn.get(f.flascheId) ?? 0))) {
        return {
          ok: false,
          grund: "eingabe",
          text: "Ein Druck liegt über dem Nennfülldruck der Flasche. Bitte am Manometer nachsehen und korrigieren.",
        };
      }
    }

    const quelle = journalQuelle(riegel.zugang);
    const checkId = v.sendungId ?? newId();
    let nachgefuellt = 0;              // TATSAECHLICH umgelagert, nach Handlager-Kappung
    let nachfuellBestaetigt = 0;       // was der Helfer bestaetigt hat (§7.9.4, NEU)
    let inBox = 0;                     // IDA-247: in die Entnahmebox umgelagert
    let offen = 0;
    let geraeteAuffaellig = 0;
    let flaschenAuffaellig = 0;
    let flaschenNichtBewertbar = 0;
    let verfallAuffaellig = 0;
    let plombenOffen = 0;
    let plombenGesetzt = 0;
    let geraeteGemeldet = 0;

    db.transaction((tx) => {
      // Grabsteine (`entfernt`) sind kein Soll → aus der gueltigen Positionsmenge
      // ausschliessen.
      const sollRows = tx.select().from(sollPositionen)
        .where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all()
        .filter((s) => !s.entfernt);
      const byId = new Map(sollRows.map((s) => [s.id, s]));
      const referenz = `check:${checkId}`;

      /*
       * WURF 1 von 4 (fremde Position) und IDA-222 — EIN ARTIKEL WIRD GANZ ODER
       * GAR NICHT GEZAEHLT — stehen in `gruppiereZaehlung` (gemeinsam mit dem
       * Verwaltungscheck). Die Oberflaeche zieht immer ganze Artikel
       * (`_lib/domain/stichprobe.ts`); `gruppiereZaehlung` ist der Riegel fuer
       * jeden anderen Weg.
       */
      const zaehlung = gruppiereZaehlung(sollRows, v.positionen);

      // Was nur der Helfer-Check kennt: Nachfuell- und Box-Wunsch je Position,
      // geklemmt und je Artikel summiert.
      const wunsch = new Map<string, { nachfuell: number; box: number }>();
      const posErgebnis: {
        sollPositionId: string; artikelId: string; soll: number; ist: number;
        sollMax?: number; box?: number;
      }[] = v.positionen.map((p) => {
        const row = byId.get(p.sollPositionId)!;   // `gruppiereZaehlung` hat die Zugehoerigkeit geprueft
        const nachfuellWunsch = Math.min(p.nachfuellMenge, Math.max(0, row.soll - p.ist));
        const boxWunsch = Math.min(p.boxMenge, ueberschuss(p.ist, row.soll, row.sollMax));
        const w = wunsch.get(row.artikelId) ?? { nachfuell: 0, box: 0 };
        w.nachfuell += nachfuellWunsch;
        w.box += boxWunsch;
        wunsch.set(row.artikelId, w);
        // IDA-247: `sollMax` und `box` NUR, wenn gesetzt — ein Check ohne
        // Bereich und ohne Kiste schreibt dasselbe JSON wie vorher.
        return {
          sollPositionId: row.id, artikelId: row.artikelId, soll: row.soll, ist: p.ist,
          ...(row.sollMax != null && row.sollMax > row.soll ? { sollMax: row.sollMax } : {}),
          ...(boxWunsch > 0 ? { box: boxWunsch } : {}),
        };
      });
      const gruppen = [...zaehlung.values()].map((g) => ({
        artikelId: g.artikelId, positionen: g.positionen, sollSumme: g.sollSumme, istSumme: g.istSumme,
        nachfuellGewuenscht: wunsch.get(g.artikelId)?.nachfuell ?? 0,
        boxGewuenscht: wunsch.get(g.artikelId)?.box ?? 0,
      }));

      /*
       * IDA-222 — PLOMBEN. Im Kurzcheck wird jede stehende Plombe abgelesen;
       * passt die Nummer nicht oder fehlt sie, steht die Plombe nicht mehr
       * (`nummer` wird geleert, der naechste Vollcheck setzt sie neu), und ihr
       * Fach MUSS in dieser Nutzlast gezaehlt sein. Im Vollcheck wird gesetzt
       * (`setzePlombenNummern`, gemeinsam mit dem Verwaltungscheck).
       */
      let plombenErgebnis: CheckPlombeRoh[] = [];
      if (v.art === "kurz") {
        const plombenHier = new Map(
          tx.select().from(plomben).where(eq(plomben.lagerortId, v.fahrzeugId)).all()
            .filter((p) => p.aktiv)
            .map((p) => [p.id, p]),
        );
        const gezaehltIds = new Set(v.positionen.map((p) => p.sollPositionId));
        for (const e of v.plomben) {
          const pl = plombenHier.get(e.plombeId);
          if (!pl) throw new Error("Plombe gehört nicht zu diesem Fahrzeug");
          const intakt = pl.nummer !== null && e.nummer !== null
            && plombenNummerNorm(e.nummer) === plombenNummerNorm(pl.nummer);
          if (!intakt) {
            plombenOffen++;
            if (pl.fachLabel !== null) {
              const fach = sollRows.filter((r) => r.fachLabel === pl.fachLabel);
              if (fach.some((r) => !gezaehltIds.has(r.id))) {
                throw new Error("Das Fach einer offenen Plombe wurde nicht gezählt");
              }
            }
            tx.update(plomben).set({ nummer: null, gesetztAt: null }).where(eq(plomben.id, pl.id)).run();
          }
          plombenErgebnis.push({
            plombeId: pl.id, bezeichnung: pl.bezeichnung,
            erwartet: pl.nummer, gelesen: e.nummer, intakt,
          });
        }
        for (const pl of plombenHier.values()) {
          if (plombeDecktAb(pl) && !v.plomben.some((e) => e.plombeId === pl.id)) {
            throw new Error("Eine stehende Plombe wurde nicht abgelesen");
          }
        }
      } else {
        plombenErgebnis = setzePlombenNummern(tx, { lagerortId: v.fahrzeugId, eintraege: v.plomben });
        plombenGesetzt = plombenErgebnis.length;
      }

      // DRK-297, Fixrunde 1 (Befund 3) — EINMAL vor der Gruppenschleife
      // geladen, nicht einmal je Artikelgruppe: `handlagerOrte` haengt an
      // keinem Artikel, ein Fahrzeug-Check mit vielen Positionen laedt sie
      // sonst unnoetig oft neu.
      const handlagerBereich = handlagerOrte(tx);
      const artikelErgebnis = gruppen.map((g) => {
        // I4: nach `korrekturAufLagerort(…, istMenge)` gilt
        // `bestandProLagerort(…, fahrzeugId) === istMenge`.
        const { diff: korrektur } = korrekturAufLagerort(tx, {
          artikelId: g.artikelId, lagerortId: v.fahrzeugId, istMenge: g.istSumme,
          quelle, kommentar: CHECK_ABGLEICH, referenz,
        });
        const recordedVorher = g.istSumme - korrektur;
        const nachfuellGebucht = g.nachfuellGewuenscht > 0
          ? umlagerungAusBereich(tx, {
              artikelId: g.artikelId, menge: g.nachfuellGewuenscht,
              vonBereich: handlagerBereich, nachLagerortId: v.fahrzeugId,
              quelle, kommentar: CHECK_NACHFUELLUNG, referenz,
            }).umgelagert
          : 0;
        nachgefuellt += nachfuellGebucht;
        nachfuellBestaetigt += g.nachfuellGewuenscht;
        // `boxGewuenscht` statt eines Gebuchten: die Box-Umlagerung unten ist
        // voll gedeckt (Abgleich auf `istSumme`, jeder Wunsch <= sein Ist) und
        // wirft sonst — dieselbe Formel wie `offenJeArtikel`.
        offen += offenJeArtikel({
          sollSumme: g.sollSumme, istSumme: g.istSumme, nachfuellGebucht,
          boxGebucht: g.boxGewuenscht,
        });
        return {
          artikelId: g.artikelId, positionen: g.positionen.length,
          sollSumme: g.sollSumme, istSumme: g.istSumme, recordedVorher, korrektur,
          nachfuellGewuenscht: g.nachfuellGewuenscht, nachfuellGebucht,
          ...(g.boxGewuenscht > 0 ? { boxGebucht: g.boxGewuenscht } : {}),
        };
      });

      // Geraete (WURF 2, Maengel nach IDA-377) und Flaschen (WURF 3, Messungen)
      // — gemeinsam mit dem Verwaltungscheck in `_lib/schreibpfade/check.ts`.
      const geraeteGebucht = bucheGeraeteAntworten(tx, {
        fahrzeug: fz, antworten: v.geraete, quelle, checkId,
      });
      geraeteAuffaellig = geraeteGebucht.auffaellig;
      geraeteGemeldet = geraeteGebucht.gemeldet;

      const flaschenGebucht = bucheFlaschenMessungen(tx, {
        fahrzeugId: v.fahrzeugId, flaschen: v.flaschen, quelle, referenz,
      });
      flaschenAuffaellig = flaschenGebucht.auffaellig;
      flaschenNichtBewertbar = flaschenGebucht.nichtBewertbar;

      const sollArtikel = new Set(sollRows.map((s) => s.artikelId));
      const fachWerte: { sollPositionId: string; verfall: string | null }[] = [];
      for (const e of v.verfaelle) {
        if ("sollPositionId" in e) {
          if (!byId.has(e.sollPositionId)) throw new Error("Fach gehört nicht zu diesem Fahrzeug");   // WURF 4
          fachWerte.push(e);
          continue;
        }
        if (!sollArtikel.has(e.artikelId)) throw new Error("Artikel gehört nicht zu diesem Fahrzeug");   // WURF 4
        setzeVerfall(tx, {
          lagerortId: v.fahrzeugId, artikelId: e.artikelId, verfall: e.verfall, quelle,
        });
      }
      // IDA-412: je Fach, und die Einheitszeile als frühestes Datum der Fächer.
      setzeFachVerfaelle(tx, { lagerortId: v.fahrzeugId, werte: fachWerte, quelle });

      /*
       * IDA-247 — DER UEBERSCHUSS IN DIE ENTNAHMEBOX. Nach dem Verfall, weil
       * `verfallFolgtDemMaterial` die GERADE gemeldete Angabe mitnehmen soll.
       *
       * ⚠️ DIESELBE BUCHUNG WIE `bucheInEntnahmebox`, NICHT EINE EIGENE:
       * Referenz `entnahmebox:<Einheit>` und derselbe Kommentar. Die
       * Einraeumflaeche liest die Herkunft aus genau dieser Referenz
       * (`_lib/lesepfade/entnahmebox.ts`); eine `check:`-Referenz liesse die
       * Teile in der Kiste ohne Herkunft liegen.
       */
      for (const g of gruppen) {
        if (g.boxGewuenscht <= 0) continue;
        const { umgelagert } = umlagerungVonOrt(tx, {
          artikelId: g.artikelId, menge: g.boxGewuenscht,
          vonOrt: v.fahrzeugId, nachLagerortId: ENTNAHMEBOX_ID,
          quelle, kommentar: ENTNAHMEBOX_KOMMENTAR,
          referenz: `${ENTNAHMEBOX_PRAEFIX}${v.fahrzeugId}`,
        });
        // Unerreichbar (s. `offen` oben) — waere es erreichbar, stuende die
        // Kiste halb gebucht da, und nur ein Zuruecknehmen ist richtig.
        if (umgelagert < g.boxGewuenscht) throw new Error("Deckung und Buchung sind uneins");
        verfallFolgtDemMaterial(tx, {
          vonLagerortId: v.fahrzeugId, nachLagerortId: ENTNAHMEBOX_ID, artikelId: g.artikelId,
        });
        inBox += umgelagert;
      }

      // NACH dem Schreiben zaehlen, damit die Rueckmeldung den GANZEN
      // Fahrzeugstand widerspiegelt — nicht nur die in diesem Check angefassten
      // Artikel (1:1 aus check.ts:158-159).
      const verfallErgebnis = [...verfallFuerLagerort(tx, v.fahrzeugId).values()].map((e) => ({
        artikelId: e.artikelId, verfall: e.verfall, ampel: e.ampel, abgelaufen: e.abgelaufen,
      }));
      verfallAuffaellig = verfallErgebnis.filter((e) => e.ampel !== "gruen").length;

      schreibeCheckZeile(tx, {
        id: checkId, fahrzeugId: v.fahrzeugId, quelle,
        // ⚠️ `version: 2` wird ab jetzt AUSGESCHRIEBEN. Der Bestand schreibt das
        // Objekt ohne Diskriminator; `parseCheckErgebnis` (Teil 3, T37) erkennt
        // Alt-Objekte weiterhin an der Form. Ein geschriebenes Feld macht die
        // Unterscheidung fuer alles NEUE explizit statt geraten.
        //
        // ⚠️ DIE FELDNAMEN SIND NICHT UMBENENNBAR (§4.10, 1:1-Pflicht 2) — sonst
        // wird jede historische Auswertung stumm 0.
        ergebnis: {
          version: 2,
          positionen: posErgebnis,
          artikel: artikelErgebnis,
          geraete: geraeteGebucht.ergebnis,
          flaschen: flaschenGebucht.ergebnis,
          verfall: verfallErgebnis,
          art: v.art,
          plomben: plombenErgebnis,
          // IDA-358: die Rückmeldung an das Gerät, für eine Wiederholung derselben Sendung.
          abschluss: {
            nachgefuellt, nachfuellBestaetigt, inBox, offen,
            geraeteAuffaellig, flaschenAuffaellig, flaschenNichtBewertbar, verfallAuffaellig,
            plombenOffen, plombenGesetzt, geraeteGemeldet,
          },
        },
      });
    });

    /*
     * ⚠️ DER CHECK IST EIN BESTANDSSCHREIBER (DRK-374): `korrekturAufLagerort`
     * und `umlagerungAusBereich` schreiben Buchungszeilen wie jede Entnahme.
     * Die Bestandsflaechen kommen deshalb aus der modulweiten Liste; das
     * Fahrzeug traegt seine Kennung in der URL.
     *
     * ⚠️ DER CHECK-SCHIRM SELBST (`helfer/check`) STEHT SEIT DER CODEX-REVIEW
     * ZU PR #187 IN DER LISTE und darf hier nicht noch einmal auftauchen: er
     * zeigt je Soll-Zeile den Fahrzeug- UND den Handlager-Bestand, veraltet
     * also nach JEDER Buchung und nicht nur nach einem Check.
     *
     * DANEBEN bleibt, was NUR ein Check aendert: die Check-Historie und die
     * Sauerstoffuebersicht (Flaschendruck steht in keiner Buchungszeile).
     *
     * INNERER Pfad (/m/lagerbuch/…). Gegenrichtung zu allem, was der Client
     * schreibt und was in ein `Location` geht — das sind AEUSSERE Pfade (§7.2.5).
     */
    revalidiereBestand();
    revalidatePath("/m/lagerbuch/verwaltung/checks");
    revalidatePath("/m/lagerbuch/verwaltung/sauerstoff");
    // IDA-377: ein gemeldetes Gerät steht danach unter „Mängel" und an seiner Seite.
    if (geraeteGemeldet > 0) {
      revalidatePath("/m/lagerbuch/verwaltung/maengel");
      revalidatePath("/m/lagerbuch/verwaltung/geraete", "layout");
    }

    return {
      ok: true,
      wert: {
        checkId, nachgefuellt, nachfuellBestaetigt, inBox, offen,
        geraeteAuffaellig, flaschenAuffaellig, flaschenNichtBewertbar, verfallAuffaellig,
        plombenOffen, plombenGesetzt, geraeteGemeldet,
      },
    };
  });
}

/** IDA-358: das gespeicherte Ergebnis eines Checks als Rückmeldung — `null`, wenn es fehlt. */
function frueherAbschluss(checkId: string, ergebnis: string | null): CheckAbschlussWert | null {
  try {
    const a = (JSON.parse(ergebnis ?? "null") as { abschluss?: Record<string, unknown> } | null)?.abschluss;
    if (!a) return null;
    const zahl = (k: string) => (typeof a[k] === "number" ? (a[k] as number) : 0);
    return {
      checkId,
      nachgefuellt: zahl("nachgefuellt"),
      nachfuellBestaetigt: zahl("nachfuellBestaetigt"),
      inBox: zahl("inBox"),
      offen: zahl("offen"),
      geraeteAuffaellig: zahl("geraeteAuffaellig"),
      flaschenAuffaellig: zahl("flaschenAuffaellig"),
      flaschenNichtBewertbar: zahl("flaschenNichtBewertbar"),
      verfallAuffaellig: zahl("verfallAuffaellig"),
      plombenOffen: zahl("plombenOffen"),
      plombenGesetzt: zahl("plombenGesetzt"),
      geraeteGemeldet: zahl("geraeteGemeldet"),
    };
  } catch {
    return null;
  }
}
