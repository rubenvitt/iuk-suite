/**
 * Lesepfade des Demo-Checks — IDA-224, voruebergehend (Rueckbau: IDA-225).
 * Kopf und Begruendung: `_lib/demoCheck.ts`.
 *
 * ⚠️ NUR LESEN. Die Demo-Seite und ihr Abschluss laufen anonym; nichts hier
 * darf eine Zeile anlegen oder aendern (`demo/page.test.tsx` vergleicht jede
 * Tabelle vorher/nachher).
 */
import { eq } from "drizzle-orm";
import { demoEinstellung } from "../../_db/schema";
import type { CheckFlasche, CheckGeraet, CheckPos } from "../../_ui/CheckFlow";
import { O2_WECHSEL_VORGABE_PROZENT } from "../domain/o2";
import { grundText, waehleStichprobe } from "../domain/stichprobe";
import { DEMO_FAHRZEUG_ID, type DemoPlombe } from "../demoCheck";
import { fmtDatumZeit, heuteIso } from "../zeit";
import type { Leser } from "./bestand";
import { templateDetail } from "./fahrzeuge";

/** Die eine Zeile in `demo_einstellung`. */
export const DEMO_EINSTELLUNG_ID = "check";

export function demoEinstellungLesen(db: Leser): { aktiv: boolean; templateId: string | null } {
  const zeile = db.select().from(demoEinstellung)
    .where(eq(demoEinstellung.id, DEMO_EINSTELLUNG_ID)).get();
  return { aktiv: zeile?.aktiv ?? false, templateId: zeile?.templateId ?? null };
}

export type DemoCheckDaten = {
  fahrzeug: { id: string; name: string; kennung: string; einheitenart: "fahrzeug" };
  soll: CheckPos[];
  /** Die gezogenen Positionen des Kurzchecks mit ihrem Grund als Satz. */
  stichprobe: Record<string, string>;
  /** IDA-248: die Plombe ueber der Medikamententasche. */
  plombe: DemoPlombe;
  /** IDA-248: die Positionen, die die stehende Plombe im Kurzcheck bezeugt. */
  versiegelt: Record<string, string[]>;
  geraete: CheckGeraet[];
  flaschen: CheckFlasche[];
  /** Vorbelegter Verfall je artikelId („YYYY-MM"), wie ihn ein letzter Check gemeldet haette. */
  verfall: Record<string, string>;
  letzterCheckText: string;
};

/*
 * ── WAS AM DEMO-FAHRZEUG HAENGT, NICHT AN DER VORLAGE — IDA-248 ─────────────
 *
 * Plomben, Geraete und Sauerstoff gehoeren im Ernstfall dem Fahrzeug, und das
 * Demo-Fahrzeug gibt es nur im Speicher. Damit die Demo den ganzen Check zeigt,
 * steht seine Ausstattung hier als Konstante: erfundene Ids mit Praefix
 * `demo-`, keine Zeile in der Datenbank, und mit IDA-225 faellt sie mit der
 * Demo weg.
 */
export const DEMO_TASCHE = "Medikamententasche";
/** Steht im Demo-Hinweis — wer sie abtippt, sieht „passt", wer sich vertippt, zaehlt die Tasche. */
export const DEMO_PLOMBE_NUMMER = "004711";

const DEMO_TASCHE_INHALT: readonly {
  artikelId: string; artikelName: string; einheit: string; soll: number; sollMax: number | null;
  /**
   * Monate ab heute bis zum Verfall, `null` = keiner vorbelegt. `0` ist der
   * laufende Monat und damit an jedem Tag des Jahres „laeuft bald ab"; ein
   * Folgemonat laege je nach Tag mal vor, mal hinter der gelben Schwelle.
   */
  verfallInMonaten: number | null;
}[] = [
  { artikelId: "demo-med-adrenalin", artikelName: "Adrenalin 1 mg Ampulle", einheit: "Amp.", soll: 4, sollMax: null, verfallInMonaten: 0 },
  { artikelId: "demo-med-glukose", artikelName: "Glukose 40 % 10 ml", einheit: "Amp.", soll: 3, sollMax: null, verfallInMonaten: 14 },
  { artikelId: "demo-med-salbutamol", artikelName: "Salbutamol Dosieraerosol", einheit: "Stk.", soll: 1, sollMax: null, verfallInMonaten: 20 },
  // IDA-247: ein Bereich „OK bis", damit die Demo „Zu viel an Bord" zeigen kann.
  { artikelId: "demo-med-nacl", artikelName: "NaCl 0,9 % 500 ml", einheit: "Fl.", soll: 2, sollMax: 4, verfallInMonaten: null },
];

const DEMO_GERAETE: readonly CheckGeraet[] = [
  { id: "demo-geraet-aed", typ: "medizin", name: "Defibrillator (AED)" },
  { id: "demo-geraet-absaugung", typ: "medizin", name: "Absaugpumpe" },
  { id: "demo-geraet-spineboard", typ: "objekt", name: "Spineboard" },
];

const DEMO_FLASCHEN: readonly CheckFlasche[] = [
  {
    id: "demo-o2-2l", name: "Sauerstoff 2 l", nennfuelldruckBar: 200,
    wechselAbProzent: O2_WECHSEL_VORGABE_PROZENT, letzterDruck: 170,
  },
];

/** „YYYY-MM" so viele Monate nach dem heutigen Monat in der Suite-Zone. */
function monatAb(now: Date, monate: number): string {
  const [jahr, monat] = heuteIso(now).split("-").map(Number) as [number, number];
  const index = jahr * 12 + (monat - 1) + monate;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Die Check-Daten des Demo-Fahrzeugs, gebaut aus der gewaehlten Vorlage — oder
 * `null`, wenn die Demo aus ist, die Vorlage fehlt, inaktiv oder leer ist. Die
 * Seite und der Abschluss antworten dann mit 404.
 *
 * ⚠️ DIE BESTAENDE SIND ERFUNDEN: Handlager = Soll je Artikel, damit der
 * Nachfuellschritt wie im Ernstfall aussieht. Echte Bestaende gingen sonst auf
 * jedes anonyme Telefon.
 *
 * ⚠️ DIE STICHPROBE zieht dieselbe Funktion wie im Ernstfall. Das Demo-Fahrzeug
 * hat keine Historie, also ist jede Position „noch nie gezaehlt" — gezogen wird
 * der volle Umfang, wie bei einem frisch angelegten Fahrzeug. Plomben, Geraete
 * und Sauerstoff haengen am Fahrzeug, nicht an der Vorlage — seit IDA-248
 * bringt die Demo sie als Konstante mit (Block oben).
 */
export function demoCheckDaten(db: Leser, now: Date = new Date()): DemoCheckDaten | null {
  const einstellung = demoEinstellungLesen(db);
  if (!einstellung.aktiv || !einstellung.templateId) return null;
  const vorlage = templateDetail(db, einstellung.templateId);
  if (!vorlage || !vorlage.aktiv || vorlage.positionen.length === 0) return null;

  const handlager = new Map<string, number>();
  for (const p of vorlage.positionen) handlager.set(p.artikelId, (handlager.get(p.artikelId) ?? 0) + p.soll);
  const soll: CheckPos[] = [
    ...vorlage.positionen.map((p) => ({
      id: p.id, fachLabel: p.fachLabel, artikelId: p.artikelId, artikelName: p.artikelName,
      einheit: p.einheit, handlagerFach: p.handlagerFach, soll: p.soll, sollMax: p.sollMax,
      fahrzeugBestand: 0, handlagerBestand: handlager.get(p.artikelId) ?? 0,
    })),
    // IDA-248: die Tasche haengt hinter der Vorlage, wie ein eigenes Fach.
    ...DEMO_TASCHE_INHALT.map((m) => ({
      id: `demo-pos-${m.artikelId}`, fachLabel: DEMO_TASCHE, artikelId: m.artikelId,
      artikelName: m.artikelName, einheit: m.einheit, handlagerFach: "Medikamentenschrank",
      soll: m.soll, sollMax: m.sollMax, fahrzeugBestand: 0, handlagerBestand: m.soll,
    })),
  ];

  const plombe: DemoPlombe = {
    id: "demo-plombe-tasche", bezeichnung: DEMO_TASCHE, fachLabel: DEMO_TASCHE,
    nummer: DEMO_PLOMBE_NUMMER,
  };
  // Wie `kurzcheckVorlage`: eine stehende Plombe bezeugt ihr ganzes Fach, und
  // diese Positionen sind keine Kandidaten der Stichprobe.
  const versiegeltIds = soll.filter((p) => p.fachLabel === plombe.fachLabel).map((p) => p.id);

  const pflicht = new Set(vorlage.positionen.filter((p) => p.immerZaehlen).map((p) => p.id));
  const gezogen = waehleStichprobe(
    soll.filter((p) => !versiegeltIds.includes(p.id)).map((p) => ({
      id: p.id, artikelId: p.artikelId, tageSeitZaehlung: null, verbraucht: false, verfallBald: false,
      // IDA-223: der Pflichtkern steht an der Vorlage und gilt hier wie im Ernstfall.
      immerZaehlen: pflicht.has(p.id),
    })),
    { seed: `${DEMO_FAHRZEUG_ID}|${heuteIso(now)}` },
  );

  return {
    fahrzeug: { id: DEMO_FAHRZEUG_ID, name: vorlage.name, kennung: "Demo", einheitenart: "fahrzeug" },
    soll,
    stichprobe: Object.fromEntries(gezogen.map((t) => [t.id, grundText(t)])),
    plombe,
    versiegelt: { [plombe.id]: versiegeltIds },
    geraete: [...DEMO_GERAETE],
    flaschen: [...DEMO_FLASCHEN],
    verfall: Object.fromEntries(DEMO_TASCHE_INHALT
      .filter((m) => m.verfallInMonaten !== null)
      .map((m) => [m.artikelId, monatAb(now, m.verfallInMonaten!)])),
    letzterCheckText: fmtDatumZeit(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)),
  };
}
