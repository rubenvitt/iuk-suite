import { baueBaum, teilbaumGroesse, type Baum } from "../plan/baum";
import type { PlanInhalt, Stelle } from "../plan/schema";
import { anzeigereihenfolge } from "./gruppen";
import { BLATT, MIN_MASSSTAB, PAPIER } from "./masse";
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

export function zeichenflaeche(format: Papierformat, legendeZeilen: number) {
  const p = PAPIER[format];
  const legende = legendeZeilen === 0 ? 0 : legendeZeilen * BLATT.legendeZeile + BLATT.legendeRand;
  const y = BLATT.randOben + BLATT.kopf;
  return { x: BLATT.randX, y, breite: p.breite - 2 * BLATT.randX, hoehe: p.hoehe - y - BLATT.randUnten - BLATT.fuss - legende };
}

export function massstabFuer(z: Pick<Zeichnungsdaten, "breite" | "hoehe">, flaeche: { breite: number; hoehe: number }): number {
  if (z.breite === 0 || z.hoehe === 0) return 1;
  return Math.min(1, flaeche.breite / z.breite, flaeche.hoehe / z.hoehe);
}

type Auftrag = NonNullable<LayoutOptionen["blatt"]>;

function blattAus(nummer: number, format: Papierformat, z: Zeichnungsdaten, auftrag: Auftrag | undefined): Blatt {
  const zeilen = legendenZeilen(z.legende, PAPIER[format].breite - 2 * BLATT.randX);
  const f = zeichenflaeche(format, zeilen.length);
  const massstab = massstabFuer(z, f);
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

function passt(inhalt: PlanInhalt, format: Papierformat, auftrag: Auftrag | undefined, schnitte: ReadonlySet<string>): boolean {
  const darstellung = new Map<string, Darstellung>([...schnitte].map((id) => [id, PLATZHALTER]));
  return !blattAus(0, format, zeichne(inhalt, format, { blatt: auftrag, darstellung }), auftrag).unterMindestschrift;
}

/**
 * DURCHLAUF 1: der Schnittplan eines Blatts, rekursiv (Abweichung 14). Von der tiefsten
 * Kandidatenebene her: jede Ebene baut auf „alles Tiefere geschnitten" auf und schneidet gierig
 * nach Teilbaumgröße, bis das Blatt passt. Das größte D, bei dem es passt, gewinnt — Blatt 1
 * behält die oberen Ebenen. Jede Probe zeichnet neu, weil ein Schnitt die Sicht ändert (eine
 * Verweiskarte ist ein Blatt, ihre Elterngruppe kann danach kämmen).
 */
function schneide(inhalt: PlanInhalt, format: Papierformat, baum: Baum, auftrag: Auftrag | undefined): Schnittplan {
  if (passt(inhalt, format, auftrag, new Set())) return { auftrag, schnitte: [], unter: [] };
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
      if (passt(inhalt, format, auftrag, s)) { gewaehlt = s; break; }
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
    unter: schnitte.map((id) => schneide(inhalt, format, baum, { wurzelId: id, ankerId: baum.stelle(id)!.eltern })),
  };
}

/** DURCHLAUF 2: Blätter in Tiefensuche nummerieren, dann jedes Blatt mit den echten Verweisnummern zeichnen. */
export function teileAuf(inhalt: PlanInhalt, format: Papierformat): Blatt[] {
  const baum = baueBaum(inhalt);
  const reihe: Schnittplan[] = [];
  const sammle = (p: Schnittplan) => { reihe.push(p); p.unter.forEach(sammle); };
  sammle(schneide(inhalt, format, baum, undefined));
  const nummer = new Map(reihe.map((p, i) => [p, i + 1]));
  const blaetter = reihe.map((p, i) => {
    const darstellung = new Map<string, Darstellung>(p.schnitte.map((id, j) => [id, { verweisAufBlatt: nummer.get(p.unter[j])! }]));
    return blattAus(i + 1, format, zeichne(inhalt, format, { blatt: p.auftrag, darstellung }), p.auftrag);
  });
  return blaetter.map((b) => ({ ...b, von: blaetter.length }));
}
