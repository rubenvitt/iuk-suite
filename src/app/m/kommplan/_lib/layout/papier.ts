import { baueBaum, teilbaumGroesse, type Baum } from "../plan/baum";
import type { PlanInhalt, Stelle } from "../plan/schema";
import { anzeigereihenfolge } from "./gruppen";
import { BLATT, MIN_MASSSTAB, PAPIER, QR_BOX } from "./masse";
import { baueSicht, type Sicht } from "./sicht";
import { textBreite } from "./text";
import type { Blatt, Darstellung, LayoutOptionen, LegendenEintrag, Papierformat, Zeichnungsdaten } from "./typen";
import { zeichne } from "./zeichne";

/** Die Legende steht unskaliert auf dem Blatt (8 pt), wie Kopf und Fuß. */
export const LEGENDE = { symbolBreite: 9, symbolLuft: 1.5, eintragLuft: 6, schrift: 8 } as const;

export function legendenZeilen(legende: LegendenEintrag[], breite: number): LegendenEintrag[][] {
  const zeilen: LegendenEintrag[][] = [];
  let aktuell: LegendenEintrag[] = [];
  let x = 0;
  for (const e of legende) {
    const b = LEGENDE.symbolBreite + LEGENDE.symbolLuft + textBreite(e.text, LEGENDE.schrift, false);
    if (aktuell.length > 0 && x + b > breite) { zeilen.push(aktuell); aktuell = []; x = 0; }
    aktuell.push(e);
    x += b + LEGENDE.eintragLuft;
  }
  if (aktuell.length > 0) zeilen.push(aktuell);
  return zeilen;
}

/** Die Linie unter dem Kopf, 1 mm über dessen Unterkante. */
export function kopflinieY(): number {
  return BLATT.randOben + BLATT.kopf - 1;
}

/** Oberkante der ersten Legendenzeile: die Legende steht unten, direkt über dem Fuß. */
export function legendeObenY(format: Papierformat, legendeZeilen: number): number {
  return PAPIER[format].hoehe - BLATT.randUnten - BLATT.fuss - legendeZeilen * BLATT.legendeZeile;
}

/**
 * AUFWANDSGRENZE DER AUFTEILUNG (Abnahme kommplan, Befund „Token-Druck blockiert"): jede Probe in `schneide` zeichnet
 * den Teilbaum neu, synchron auf dem einen Node-Thread, und die Druckrouten rufen das bei jeder Anfrage. Gezählt
 * werden gezeichnete Karten über alle Proben eines Plans; ist das Budget aufgebraucht, schneidet kein weiteres Blatt
 * mehr — der Rest bleibt ungeteilt, notfalls unter 6 pt. Die Beispielpläne brauchen unter 200, ein breiter Plan mit
 * 500 Stellen rund 24 000. Mit der Tiefengrenze des Schemas (`GRENZE.ebenen`) hält das jeden gültigen Plan bei
 * etwa einer Sekunde; `druckdaten.ts` merkt sich das Ergebnis je Inhalt.
 */
export const AUFTEILUNG = { kartenProben: 30_000 } as const;

/** `aufwand`: zählt die gezeichneten Karten aller Proben mit (für Tests); `budget` ersetzt `AUFTEILUNG.kartenProben`. */
export interface PapierOptionen { qr?: boolean; budget?: number; aufwand?: { karten: number } }

/** Die QR-Box unten rechts, direkt über der Fußzeile; `oben` schließt die Beschriftung ein. */
export function qrBox(format: Papierformat): { x: number; y: number; kante: number; oben: number } {
  const p = PAPIER[format];
  const x = p.breite - BLATT.randX - QR_BOX.kante;
  const y = p.hoehe - BLATT.randUnten - BLATT.fuss - QR_BOX.kante;
  return { x, y, kante: QR_BOX.kante, oben: y - QR_BOX.beschriftung };
}

/** Breite einer Legendenzeile; mit QR steht die Legende links neben der Box. */
export function legendenBreite(format: Papierformat, qr = false): number {
  return PAPIER[format].breite - 2 * BLATT.randX - (qr ? QR_BOX.kante + QR_BOX.luft : 0);
}

/**
 * Wo die Zeichnung stehen darf: unter der Kopflinie, über der Legende, je `BLATT.luft` Abstand. Mit `qr` zusätzlich über
 * der Beschriftung der QR-Box, über die volle Breite — das ist nur noch die sichere Untergrenze für `massstabMitQr`.
 */
export function zeichenflaeche(format: Papierformat, legendeZeilen: number, qr = false) {
  const p = PAPIER[format];
  const y = kopflinieY() + BLATT.luft;
  const ohneQr = legendeZeilen === 0 ? p.hoehe - BLATT.randUnten - BLATT.fuss : legendeObenY(format, legendeZeilen) - BLATT.luft;
  const unten = qr ? Math.min(ohneQr, qrBox(format).oben - BLATT.luft) : ohneQr;
  return { x: BLATT.randX, y, breite: p.breite - 2 * BLATT.randX, hoehe: unten - y };
}

export function massstabFuer(z: Pick<Zeichnungsdaten, "breite" | "hoehe">, flaeche: { breite: number; hoehe: number }): number {
  if (z.breite === 0 || z.hoehe === 0) return 1;
  return Math.min(1, flaeche.breite / z.breite, flaeche.hoehe / z.hoehe);
}

type Auftrag = NonNullable<LayoutOptionen["blatt"]>;

/** Wo mit QR nichts von der Zeichnung stehen darf: die Box samt Beschriftung, links und oben `BLATT.luft` Abstand. */
export function qrSperre(format: Papierformat): { x: number; y: number } {
  const b = qrBox(format);
  return { x: b.x - BLATT.luft, y: b.oben - BLATT.luft };
}

/** Berührt die Zeichnung bei Maßstab `m`, waagerecht mittig in `f`, die QR-Sperre? Jedes Element einzeln, als Kasten. */
function trifftQr(z: Zeichnungsdaten, m: number, f: { x: number; y: number; breite: number }, sperre: { x: number; y: number }): boolean {
  const ox = f.x + (f.breite - z.breite * m) / 2;
  const rein = (x: number, y: number, b: number, h: number) => ox + (x + b) * m > sperre.x && f.y + (y + h) * m > sperre.y;
  return z.karten.some((k) => rein(k.x, k.y, k.breite, k.hoehe))
    || z.einheiten.some((e) => rein(e.x, e.y, e.breite, e.hoehe))
    || z.sechsecke.some((s) => rein(s.x, s.y, s.breite, s.hoehe))
    || z.abzeichen.some((a) => rein(a.x, a.y, a.breite, a.hoehe))
    || z.linien.some((l) => rein(Math.min(l.x1, l.x2), Math.min(l.y1, l.y2), Math.abs(l.x2 - l.x1), Math.abs(l.y2 - l.y1)));
}

/**
 * DER MASSSTAB EINES BLATTS. Mit QR (Abnahme kommplan, Befund „Der QR-Code nimmt der Zeichnung einen Streifen über die
 * ganze Blattbreite"): die Box belegt nur die Ecke unten rechts. Also zuerst die volle Fläche; berührt ein Element die
 * Sperre, der größte Maßstab dazwischen, bei dem keines sie berührt — gesucht per Halbierung zwischen dem vollen und dem
 * Maßstab über dem Streifen (`zeichenflaeche(…, qr)`), der sie nie berührt. Ohne QR wie bisher.
 */
function massstabMitQr(z: Zeichnungsdaten, format: Papierformat, zeilen: number, f: ReturnType<typeof zeichenflaeche>): number {
  const voll = massstabFuer(z, f);
  const sperre = qrSperre(format);
  if (!trifftQr(z, voll, f, sperre)) return voll;
  let frei = massstabFuer(z, zeichenflaeche(format, zeilen, true));
  let trifft = voll;
  for (let i = 0; i < 16 && trifft - frei > 1e-4; i++) {
    const m = (frei + trifft) / 2;
    if (trifftQr(z, m, f, sperre)) trifft = m; else frei = m;
  }
  return frei;
}

function blattAus(nummer: number, format: Papierformat, z: Zeichnungsdaten, auftrag: Auftrag | undefined, qr: boolean): Blatt {
  const zeilen = legendenZeilen(z.legende, legendenBreite(format, qr));
  const f = zeichenflaeche(format, zeilen.length);
  const massstab = qr ? massstabMitQr(z, format, zeilen.length, f) : massstabFuer(z, f);
  return {
    nummer, von: 0, wurzelId: auftrag?.wurzelId ?? null, ankerId: auftrag?.ankerId ?? null,
    zeichnung: z, massstab, legendeZeilen: zeilen, unterMindestschrift: massstab < MIN_MASSSTAB - 1e-9,
    ursprung: { x: f.x + (f.breite - z.breite * massstab) / 2, y: f.y },
  };
}

/** Lesereihenfolge eines Blatts: Tiefensuche, Kinder in Anzeigereihenfolge (Gruppe für Gruppe, Reihe für Reihe). */
export function lesereihenfolge(sicht: Sicht): string[] {
  const aus: string[] = [];
  const besuche = (s: Stelle) => {
    aus.push(s.id);
    for (const k of anzeigereihenfolge(sicht.kinder(s.id))) besuche(k);
  };
  sicht.wurzeln.forEach(besuche);
  return aus;
}

/**
 * Wer auf diesem Blatt zur Verweiskarte werden darf, nach Tiefe: sichtbar, normal, eine Unterstelle
 * mit sichtbaren Kindern, weder Blattwurzel noch Kind des Ankers. Zeigt ein Blatt ohne Anker
 * mehrere Wurzeln, sind auch die Wurzeln Kandidaten (Tiefe 0) — sonst ließen sich zwei
 * untereinander zu hohe Bäume nie auf zwei Blätter verteilen. Auch dann nur mit sichtbaren
 * Kindern: die Verweiskarte einer kinderlosen Stelle ist so breit wie die Karte selbst, der
 * Schnitt spart nichts und hinterließe ein Blatt mit genau einer Karte.
 */
function kandidaten(sicht: Sicht, auftrag: Auftrag | undefined): Map<number, Stelle[]> {
  const mehrereWurzeln = auftrag === undefined && sicht.wurzeln.length > 1;
  const geschuetzt = new Set<string>(mehrereWurzeln ? [] : sicht.wurzeln.map((w) => w.id));
  for (const w of sicht.wurzeln) if (sicht.darstellung(w.id) === "anker") for (const k of sicht.kinder(w.id)) geschuetzt.add(k.id);
  const nachTiefe = new Map<number, Stelle[]>();
  for (const s of sicht.sichtbar) {
    if (geschuetzt.has(s.id) || s.lage !== "unter" || sicht.darstellung(s.id) !== "normal") continue;
    if (sicht.kinder(s.id).length === 0) continue;
    const t = sicht.tiefe(s.id);
    nachTiefe.set(t, [...(nachTiefe.get(t) ?? []), s]);
  }
  return nachTiefe;
}

interface Schnittplan { auftrag: Auftrag | undefined; schnitte: string[]; unter: Schnittplan[] }

/** Beim Messen steht auf jeder Verweiskarte „Blatt 0": die Nummer ändert keine Geometrie (feste Breite, eine Zeile fester Höhe). */
const PLATZHALTER: Darstellung = { verweisAufBlatt: 0 };

interface Lauf { inhalt: PlanInhalt; format: Papierformat; baum: Baum; qr: boolean; rest: number; aufwand?: { karten: number } }

/** `null`: das Budget ist aufgebraucht, es wurde nicht mehr gezeichnet. */
function passt(l: Lauf, auftrag: Auftrag | undefined, schnitte: ReadonlySet<string>): boolean | null {
  if (l.rest <= 0) return null;
  const darstellung = new Map<string, Darstellung>([...schnitte].map((id) => [id, PLATZHALTER]));
  const z = zeichne(l.inhalt, l.format, { blatt: auftrag, darstellung });
  l.rest -= Math.max(1, z.karten.length);
  if (l.aufwand) l.aufwand.karten += z.karten.length;
  return !blattAus(0, l.format, z, auftrag, l.qr).unterMindestschrift;
}

/**
 * DURCHLAUF 1: der Schnittplan eines Blatts, rekursiv (Abweichung 14). Von der tiefsten
 * Kandidatenebene her: jede Ebene baut auf „alles Tiefere geschnitten" auf und schneidet gierig
 * nach Teilbaumgröße, bis das Blatt passt. Das größte D, bei dem es passt, gewinnt — Blatt 1
 * behält die oberen Ebenen. Jede Probe zeichnet neu, weil ein Schnitt die Sicht ändert (eine
 * Verweiskarte ist ein Blatt, ihre Elterngruppe kann danach kämmen). Ist das Budget (`AUFTEILUNG`) aufgebraucht,
 * bleibt dieses und jedes weitere Blatt ungeteilt — deterministisch, derselbe Inhalt teilt immer gleich auf.
 */
function schneide(l: Lauf, auftrag: Auftrag | undefined): Schnittplan {
  const ungeteilt: Schnittplan = { auftrag, schnitte: [], unter: [] };
  if (passt(l, auftrag, new Set()) !== false) return ungeteilt;
  const { inhalt, baum } = l;
  const sicht = baueSicht(inhalt, { blatt: auftrag });
  const rang = new Map(lesereihenfolge(sicht).map((id, i) => [id, i]));
  const nachTiefe = kandidaten(sicht, auftrag);
  let basis = new Set<string>();
  let gewaehlt: Set<string> | null = null;
  for (const t of [...nachTiefe.keys()].sort((a, b) => b - a)) {
    const ebene = [...nachTiefe.get(t)!].sort((a, b) =>
      teilbaumGroesse(baum, b.id) - teilbaumGroesse(baum, a.id) || rang.get(a.id)! - rang.get(b.id)!);
    const s = new Set(basis);
    for (const k of ebene) {
      s.add(k.id);
      const p = passt(l, auftrag, s);
      if (p === null) return ungeteilt;
      if (p) { gewaehlt = s; break; }
    }
    if (gewaehlt) break;
    basis = s;
  }
  const alle = gewaehlt ?? basis;
  const innen = (id: string) => {
    for (let e = baum.stelle(id)?.eltern ?? null; e !== null; e = baum.stelle(e)?.eltern ?? null) if (alle.has(e)) return true;
    return false;
  };
  const schnitte = [...alle].filter((id) => !innen(id)).sort((a, b) => rang.get(a)! - rang.get(b)!);
  return {
    auftrag, schnitte,
    unter: schnitte.map((id) => schneide(l, { wurzelId: id, ankerId: baum.stelle(id)!.eltern })),
  };
}

/**
 * Was auf einem fertigen Blatt noch geschnitten werden könnte. Leer heißt: das Blatt ist so weit
 * aufgeteilt, wie die Regel reicht. Für die Zusicherung „unter 6 pt nur, wenn unteilbar"
 * (Spec §5.6, `eigenschaften.test.ts`).
 */
export function offeneSchnitte(inhalt: PlanInhalt, blatt: Blatt): string[] {
  const auftrag: Auftrag | undefined = blatt.wurzelId === null ? undefined : { wurzelId: blatt.wurzelId, ankerId: blatt.ankerId };
  const darstellung = new Map<string, Darstellung>(
    blatt.zeichnung.karten.filter((k) => k.art === "verweis").map((k) => [k.id, PLATZHALTER]),
  );
  return [...kandidaten(baueSicht(inhalt, { blatt: auftrag, darstellung }), auftrag).values()].flat().map((s) => s.id);
}

/** DURCHLAUF 2: Blätter in Tiefensuche nummerieren, dann jedes Blatt mit den echten Verweisnummern zeichnen. */
export function teileAuf(inhalt: PlanInhalt, format: Papierformat, optionen: PapierOptionen = {}): Blatt[] {
  const qr = optionen.qr ?? false;
  const lauf: Lauf = { inhalt, format, baum: baueBaum(inhalt), qr, rest: optionen.budget ?? AUFTEILUNG.kartenProben, aufwand: optionen.aufwand };
  const reihe: Schnittplan[] = [];
  const sammle = (p: Schnittplan) => { reihe.push(p); p.unter.forEach(sammle); };
  sammle(schneide(lauf, undefined));
  const nummer = new Map(reihe.map((p, i) => [p, i + 1]));
  const blaetter = reihe.map((p, i) => {
    const darstellung = new Map<string, Darstellung>(p.schnitte.map((id, j) => [id, { verweisAufBlatt: nummer.get(p.unter[j])! }]));
    return blattAus(i + 1, format, zeichne(inhalt, format, { blatt: p.auftrag, darstellung }), p.auftrag, qr);
  });
  return blaetter.map((b) => ({ ...b, von: blaetter.length }));
}
