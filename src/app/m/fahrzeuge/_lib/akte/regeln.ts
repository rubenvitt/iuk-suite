/**
 * DIE FRISTRECHNUNG DER FAHRZEUGAKTE (IDA-299) — rein, ohne Datenbank und ohne Uhr: `heute` kommt als
 * Kalendertag `JJJJ-MM-TT` in der Suite-Zone herein (`heute.ts`).
 *
 * Die Regeln (festgelegt am 01.11.2026):
 *   * Nächster Termin = der von Hand gesetzte, sonst „zuletzt + Abstand in Monaten“. Ohne beides: nicht erfasst.
 *   * Überfällig, wenn der Termin vorbei ODER die Kilometergrenze erreicht ist. Bald, wenn der Termin in
 *     höchstens `GELB_TAGE` liegt ODER höchstens `GELB_KM` bis zur Grenze fehlen. Was zuerst kommt, zählt.
 *   * Reifenwechsel: Winterzeit Oktober bis März. Im ersten Monat (ab 1.10. bzw. 1.4.) ist der falsche Satz
 *     „bald“, ab dem Folgemonat überfällig. Ganzjahresreifen nie.
 *   * Reifenalter aus der DOT-Woche: bald ab 6, überfällig ab 8 Jahren; mit „Tempo 100“ ein bzw. zwei Jahre früher.
 *
 * Tafel, Akte, „Was steht an“ und der Push lesen ALLE diese Rechnung; eine zweite liefe auseinander. Eigene
 * Fassung wie `wartung/_lib/fristen.ts`: kein modulübergreifender Import. Kein `"use client"` (Falle 6).
 */
import {
  STUFEN, TEMPO_100,
  type AkteDTO, type Auswertung, type PruefStand, type PruefungDTO, type ReifenArt, type ReifenStand, type ReifenTeil,
  type Stufe,
} from "./typen";

/** Vorwarnung: so viele Tage vor dem Termin steht eine Prüfung auf „bald“. */
export const GELB_TAGE = 30;
/** Vorwarnung nach Kilometern: so viele Kilometer vor der Grenze. */
export const GELB_KM = 1000;
export const REIFEN_GELB_JAHRE = 6;
export const REIFEN_ROT_JAHRE = 8;
/** Mit der Besonderheit „Tempo 100“ dürfen die Reifen nicht älter als sechs Jahre sein. */
export const REIFEN_ROT_JAHRE_TEMPO_100 = 6;
/** Ab so vielen Tagen steht statt „in N Tagen“ der Monat („bis 03/2027“). */
const MONAT_AB_TAGEN = 90;

/** Die schlimmere der beiden Stufen nach `STUFEN` (`typen.ts`). */
export function schlimmste(a: Stufe, b: Stufe): Stufe {
  return STUFEN.indexOf(a) <= STUFEN.indexOf(b) ? a : b;
}

/** `TT.MM.JJJJ`. */
export function datum(isoTag: string): string {
  const [j, m, t] = isoTag.split("-");
  return `${t}.${m}.${j}`;
}

/** „84.210 km“; `—`, solange nichts abgelesen ist. Von Hand gruppiert, damit es nicht an den ICU-Daten hängt. */
export function kmText(n: number | null): string {
  if (n == null) return "—";
  const ziffern = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+$)/g, ".");
  return `${n < 0 ? "−" : ""}${ziffern} km`;
}

const alsTag = (d: Date) => d.toISOString().slice(0, 10);

/** Kalendertag plus Monate; ein 31. wird im kürzeren Monat dessen Letzter. */
export function plusMonate(isoTag: string, monate: number): string {
  const [j, m, t] = isoTag.split("-").map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return alsTag(ziel);
}

/** Tage von `heute` bis `isoTag` (negativ = vorbei). Kalendertage, keine Uhrzeit. */
export function tageBis(isoTag: string, heute: string): number {
  return Math.round((Date.parse(`${isoTag}T00:00:00Z`) - Date.parse(`${heute}T00:00:00Z`)) / 86_400_000);
}

const tage = (n: number) => (n === 1 ? "1 Tag" : `${n} Tagen`);
const jahre = (n: number) => (n === 1 ? "1 Jahr" : `${n} Jahre`);

/** Nächster Termin: der von Hand gesetzte, sonst „zuletzt + Abstand“. `null` = nicht erfasst. */
export function naechstes(p: Pick<PruefungDTO, "vonHand" | "zuletzt" | "monate">): string | null {
  if (p.vonHand) return p.vonHand;
  if (!p.zuletzt) return null;
  return plusMonate(p.zuletzt, p.monate);
}

/** `km` ist der Stand laut Tacho; `null` (Anhänger, nie abgelesen) heißt: es zählt nur der Termin. */
export function pruefStand(pruefung: PruefungDTO, km: number | null, heute: string): PruefStand {
  const faelligAm = naechstes(pruefung);
  const kmGrenze = pruefung.kmAbstand && pruefung.zuletztKm != null ? pruefung.zuletztKm + pruefung.kmAbstand : null;
  const kmRest = kmGrenze != null && km != null ? kmGrenze - km : null;
  if (!faelligAm) return { pruefung, stufe: "offen", text: "nicht erfasst", faelligAm: null, kmGrenze, kmRest };

  const rest = tageBis(faelligAm, heute);
  let stufe: Stufe = "ok";
  let text: string;
  if (rest < 0 || (kmRest != null && kmRest <= 0)) {
    stufe = "ueberfaellig";
    if (rest < 0) text = `seit ${tage(-rest)} fällig`;
    else text = kmRest === 0 ? "Kilometergrenze erreicht" : `${kmText(-kmRest!)} drüber`;
  } else if (rest <= GELB_TAGE || (kmRest != null && kmRest <= GELB_KM)) {
    stufe = "bald";
    if (rest > GELB_TAGE) text = `noch ${kmText(kmRest)}`;
    else text = rest === 0 ? "heute fällig" : `in ${tage(rest)}`;
  } else {
    text = rest > MONAT_AB_TAGEN ? `bis ${faelligAm.slice(5, 7)}/${faelligAm.slice(0, 4)}` : `in ${tage(rest)}`;
  }
  return { pruefung, stufe, text, faelligAm, kmGrenze, kmRest };
}

/** Welche Reifen heute drauf gehören: Winterzeit von Oktober bis März. */
export function saisonPflicht(heute: string): "Winter" | "Sommer" {
  const m = Number(heute.slice(5, 7));
  return m >= 10 || m <= 3 ? "Winter" : "Sommer";
}

/** Seit wann die Pflicht gilt (`start`, 1.10. bzw. 1.4.) und ab wann der falsche Satz überfällig ist (`rotAb`). */
export function saisonWechsel(heute: string): { pflicht: "Winter" | "Sommer"; start: string; rotAb: string } {
  const pflicht = saisonPflicht(heute);
  const jahr = Number(heute.slice(0, 4));
  const start = pflicht === "Winter" ? `${Number(heute.slice(5, 7)) >= 10 ? jahr : jahr - 1}-10-01` : `${jahr}-04-01`;
  return { pflicht, start, rotAb: plusMonate(start, 1) };
}

/**
 * Der Tag, ab dem das Reifenalter zählt: 1. Januar plus (Woche − 1) × 7 Tage. `null`, wenn `dot` keine vier
 * Ziffern `WWJJ` mit Woche 01 bis 53 sind — die Eingabe prüft das, alte Zeilen sollen hier trotzdem nicht werfen.
 */
export function dotDatum(dot: string): string | null {
  if (!/^\d{4}$/.test(dot)) return null;
  const woche = Number(dot.slice(0, 2));
  if (woche < 1 || woche > 53) return null;
  return alsTag(new Date(Date.UTC(2000 + Number(dot.slice(2, 4)), 0, 1 + (woche - 1) * 7)));
}

/** Volle Monate von `von` bis `bis`, mit derselben Monatsende-Klemme wie `plusMonate`; nie negativ. */
function volleMonate(von: string, bis: string): number {
  let n = (Number(bis.slice(0, 4)) - Number(von.slice(0, 4))) * 12 + Number(bis.slice(5, 7)) - Number(von.slice(5, 7));
  if (plusMonate(von, n) > bis) n -= 1;
  return Math.max(0, n);
}

/** Ab so vielen Jahren sind die Reifen dieses Fahrzeugs überfällig bzw. bald zu tauschen. */
export function reifenGrenzen(besonderheiten: readonly string[]): { gelb: number; rot: number; tempo100: boolean } {
  const tempo100 = besonderheiten.includes(TEMPO_100);
  return tempo100
    ? { gelb: REIFEN_GELB_JAHRE - 1, rot: REIFEN_ROT_JAHRE_TEMPO_100, tempo100 }
    : { gelb: REIFEN_GELB_JAHRE, rot: REIFEN_ROT_JAHRE, tempo100 };
}

function alterTeil(dot: string, art: ReifenArt, besonderheiten: readonly string[], heute: string): { alterJahre: number; teil: ReifenTeil } {
  const ab = dotDatum(dot);
  if (!ab) return { alterJahre: 0, teil: { stufe: "offen", text: "Herstellwoche nicht erfasst", kurz: "DOT fehlt" } };
  const monate = volleMonate(ab, heute);
  const alterJahre = Math.floor(monate / 12);
  const g = reifenGrenzen(besonderheiten);
  if (monate >= g.rot * 12) {
    return { alterJahre, teil: {
      stufe: "ueberfaellig", kurz: `${jahre(alterJahre)} alt`,
      text: `${jahre(alterJahre)} alt${g.tempo100 ? `, Tempo 100 nur bis ${jahre(REIFEN_ROT_JAHRE_TEMPO_100)}` : ", tauschen"}`,
    } };
  }
  if (monate >= g.gelb * 12) {
    return { alterJahre, teil: { stufe: "bald", kurz: `${jahre(alterJahre)} alt`, text: `${jahre(alterJahre)} alt, Ersatz einplanen` } };
  }
  return { alterJahre, teil: { stufe: "ok", text: `DOT ${dot}, ${jahre(alterJahre)}`, kurz: `${art} drauf` } };
}

function saisonTeil(art: ReifenArt, heute: string): ReifenTeil {
  if (art !== "Ganzjahres") {
    const w = saisonWechsel(heute);
    if (art !== w.pflicht) {
      const rot = heute >= w.rotAb;
      return {
        stufe: rot ? "ueberfaellig" : "bald",
        kurz: `${w.pflicht}reifen fällig`,
        text: `${w.pflicht}reifen fällig${rot ? ` seit ${datum(w.start)}` : ""}`,
      };
    }
  }
  return { stufe: "ok", text: `${art}reifen drauf`, kurz: `${art} drauf` };
}

/** `null`, solange nicht erfasst ist, welcher Satz drauf ist, oder es keinen Satz dieser Art gibt. */
export function reifenStand(akte: Pick<AkteDTO, "aufgezogen" | "reifensaetze" | "technik">, heute: string): ReifenStand | null {
  if (!akte.aufgezogen) return null;
  const satz = akte.reifensaetze.find((s) => s.art === akte.aufgezogen);
  if (!satz) return null;
  const { alterJahre, teil: alter } = alterTeil(satz.dot, satz.art, akte.technik.besonderheiten, heute);
  const saison = saisonTeil(satz.art, heute);
  return { satz, alterJahre, alter, saison, stufe: schlimmste(alter.stufe, saison.stufe) };
}

/** Alles, was ein Fahrzeug an Ständen hat — eine Rechnung für Tafel, Akte und „Was steht an“. */
export function auswerten(akte: AkteDTO, heute: string): Auswertung {
  const pruefungen = akte.pruefungen.map((p) => pruefStand(p, akte.km, heute));
  const reifen = reifenStand(akte, heute);
  let stufe = pruefungen.reduce<Stufe>((s, p) => schlimmste(s, p.stufe), "ok");
  if (reifen) stufe = schlimmste(stufe, reifen.stufe);
  // Eine Akte ohne jede Prüfung ist nicht „in Ordnung“, sondern nicht erfasst — die Tafel soll sie nicht grün zeigen.
  if (pruefungen.length === 0) stufe = schlimmste(stufe, "offen");
  let naechster: PruefStand | null = null;
  for (const p of pruefungen) {
    if (p.faelligAm && (!naechster || p.faelligAm < naechster.faelligAm!)) naechster = p;
  }
  return { pruefungen, reifen, stufe, naechster };
}
