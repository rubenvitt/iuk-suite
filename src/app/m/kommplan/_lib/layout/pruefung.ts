import { baueBaum } from "../plan/baum";
import type { PlanInhalt } from "../plan/schema";
import { MINDEST } from "./masse";
import type { KarteL, SechseckL, Strecke, Zeichnungsdaten } from "./typen";

/**
 * Geometrische Zusicherungen an eine fertige Zeichnung (Spec §10), in zwei Hälften:
 *
 * - `pruefeZeichnung` ist NEGATIV: nichts überlappt, nichts kreuzt, nichts kommt sich zu nahe.
 *   Eine Zeichnung mit weniger Linien hat hier weniger Befunde — und eine ohne Linien keine.
 * - `pruefeVerbindungen` ist POSITIV: was verbunden sein muss, ist es. Erst beide zusammen sagen
 *   „sauber UND vollständig".
 *
 * Genutzt von den Eigenschafts-, Beispiel- und Aufteilungstests und dem Vorschau-Skript — ein
 * Befund dort ist derselbe wie im Test. Die Mindestabstände hält das Packen selbst ein
 * (`kontur.ts`, `LUFT_Y`), sonst meldete die Prüfung, was die Engine gebaut hat.
 */
export interface Befund {
  art: "ueberlappung" | "abstand" | "kreuzung" | "naehe" | "durchstich" | "kante" | "schraeg" | "mitte" | "verbindung";
  text: string;
}
interface Kasten { name: string; besitzer: string; x: number; y: number; b: number; h: number; sechseck?: SechseckL }

const TOL = 0.01;

/** Wem ein Netz gehört: der Stelle vor `>` (Gruppe), `<` (Seite) oder `#` (Kanäle) — keines davon ist ein ID-Zeichen. */
export const besitzerVon = (netz: string) => netz.split(/[<>#]/)[0];

function kaesten(z: Zeichnungsdaten): Kasten[] {
  return [
    ...z.karten.map((k) => ({ name: `Karte ${k.id}`, besitzer: k.id, x: k.x, y: k.y, b: k.breite, h: k.hoehe })),
    ...z.einheiten.map((e) => ({ name: `Einheit ${e.id}`, besitzer: e.stelleId, x: e.x, y: e.y, b: e.breite, h: e.hoehe })),
    ...z.sechsecke.map((s) => ({ name: `Sechseck ${s.netz}/${s.verbindungId}`, besitzer: besitzerVon(s.netz), x: s.x, y: s.y, b: s.breite, h: s.hoehe, sechseck: s })),
    ...z.abzeichen.map((a) => ({ name: `Abzeichen ${a.stelleId}`, besitzer: a.stelleId, x: a.x, y: a.y, b: a.breite, h: a.hoehe })),
  ];
}

const ueberlappen = (a: Kasten, b: Kasten) =>
  a.x + TOL < b.x + b.b && b.x + TOL < a.x + a.b && a.y + TOL < b.y + b.h && b.y + TOL < a.y + a.h;
/** Kleinster Abstand zweier achsenparalleler Rechtecke; 0, wenn sie sich berühren oder überlappen. */
function kastenAbstand(a: Kasten, b: Kasten): number {
  const dx = Math.max(0, b.x - (a.x + a.b), a.x - (b.x + b.b));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

const waagerecht = (l: Strecke) => Math.abs(l.y1 - l.y2) < TOL;
const senkrecht = (l: Strecke) => Math.abs(l.x1 - l.x2) < TOL;
const bereich = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

/** Berühren oder kreuzen sich zwei achsenparallele Strecken (T-Stoß und Überdeckung eingeschlossen)? */
function beruehren(p: Strecke, q: Strecke): boolean {
  const [px0, px1] = bereich(p.x1, p.x2), [py0, py1] = bereich(p.y1, p.y2);
  const [qx0, qx1] = bereich(q.x1, q.x2), [qy0, qy1] = bereich(q.y1, q.y2);
  if (waagerecht(p) && waagerecht(q)) return Math.abs(p.y1 - q.y1) < TOL && Math.min(px1, qx1) - Math.max(px0, qx0) > -TOL;
  if (senkrecht(p) && senkrecht(q)) return Math.abs(p.x1 - q.x1) < TOL && Math.min(py1, qy1) - Math.max(py0, qy0) > -TOL;
  const [h, v] = waagerecht(p) ? [p, q] : [q, p];
  const [hx0, hx1] = bereich(h.x1, h.x2), [vy0, vy1] = bereich(v.y1, v.y2);
  return v.x1 >= hx0 - TOL && v.x1 <= hx1 + TOL && h.y1 >= vy0 - TOL && h.y1 <= vy1 + TOL;
}

/** Zwei parallele Strecken, die sich (fast) überdecken und näher als `MINDEST.linie` liegen. */
function zuNah(p: Strecke, q: Strecke): boolean {
  const d = MINDEST.linie - TOL;
  if (waagerecht(p) && waagerecht(q)) {
    const [px0, px1] = bereich(p.x1, p.x2), [qx0, qx1] = bereich(q.x1, q.x2);
    return Math.abs(p.y1 - q.y1) < d && Math.min(px1, qx1) - Math.max(px0, qx0) > -d;
  }
  if (senkrecht(p) && senkrecht(q)) {
    const [py0, py1] = bereich(p.y1, p.y2), [qy0, qy1] = bereich(q.y1, q.y2);
    return Math.abs(p.x1 - q.x1) < d && Math.min(py1, qy1) - Math.max(py0, qy0) > -d;
  }
  return false;
}

function durchsticht(l: Strecke, k: Kasten): boolean {
  const [x0, x1] = bereich(l.x1, l.x2), [y0, y1] = bereich(l.y1, l.y2);
  const innenX = (x: number) => x > k.x + TOL && x < k.x + k.b - TOL;
  const innenY = (y: number) => y > k.y + TOL && y < k.y + k.h - TOL;
  if (waagerecht(l)) return innenY(l.y1) && Math.min(x1, k.x + k.b - TOL) > Math.max(x0, k.x + TOL);
  return innenX(l.x1) && Math.min(y1, k.y + k.h - TOL) > Math.max(y0, k.y + TOL);
}

/** Läuft die Strecke ein Stück AUF einer Kante des Kastens? Ein Ende, das die Kante nur trifft, zählt nicht. */
function aufKante(l: Strecke, k: Kasten): boolean {
  if (waagerecht(l)) {
    const [x0, x1] = bereich(l.x1, l.x2);
    const aufY = Math.abs(l.y1 - k.y) < TOL || Math.abs(l.y1 - (k.y + k.h)) < TOL;
    return aufY && Math.min(x1, k.x + k.b) - Math.max(x0, k.x) > TOL;
  }
  if (senkrecht(l)) {
    const [y0, y1] = bereich(l.y1, l.y2);
    const aufX = Math.abs(l.x1 - k.x) < TOL || Math.abs(l.x1 - (k.x + k.b)) < TOL;
    return aufX && Math.min(y1, k.y + k.h) - Math.max(y0, k.y) > TOL;
  }
  return false;
}

/** Die einzige Ausnahme vom Durchstich: der waagerechte Zweig desselben Netzes genau durch die Mitte seines Sechsecks. */
const traegtSechseck = (l: Strecke, k: Kasten) =>
  k.sechseck !== undefined && k.sechseck.netz === l.netz && waagerecht(l) && Math.abs(l.y1 - (k.y + k.h / 2)) < TOL;

export function pruefeZeichnung(z: Zeichnungsdaten): Befund[] {
  const befunde: Befund[] = [];
  const ks = kaesten(z);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const [a, b] = [ks[i], ks[j]];
    if (ueberlappen(a, b)) befunde.push({ art: "ueberlappung", text: `${a.name} überlappt ${b.name}` });
    else if (a.besitzer !== b.besitzer && kastenAbstand(a, b) < MINDEST.kasten - TOL) {
      befunde.push({ art: "abstand", text: `${a.name} liegt ${kastenAbstand(a, b).toFixed(2)} mm neben ${b.name}` });
    }
  }
  const linien = z.linien;
  for (const l of linien) if (!waagerecht(l) && !senkrecht(l)) befunde.push({ art: "schraeg", text: `Linie in ${l.netz} ist schräg` });
  for (let i = 0; i < linien.length; i++) for (let j = i + 1; j < linien.length; j++) {
    const [p, q] = [linien[i], linien[j]];
    if (p.netz === q.netz) continue;
    if (beruehren(p, q)) befunde.push({ art: "kreuzung", text: `${p.netz} kreuzt ${q.netz}` });
    else if (zuNah(p, q)) befunde.push({ art: "naehe", text: `${p.netz} läuft zu nah an ${q.netz}` });
  }
  for (const l of linien) for (const k of ks) {
    if (!waagerecht(l) && !senkrecht(l)) continue;
    if (traegtSechseck(l, k)) continue;
    if (durchsticht(l, k)) befunde.push({ art: "durchstich", text: `${l.netz} läuft durch ${k.name}` });
    else if (!(k.sechseck && k.sechseck.netz === l.netz) && aufKante(l, k)) befunde.push({ art: "kante", text: `${l.netz} läuft auf der Kante von ${k.name}` });
  }
  return befunde;
}

export function pruefeMitte(z: Zeichnungsdaten): Befund[] {
  return z.spannen.flatMap((s) => {
    const k = z.karten.find((x) => x.id === s.stelleId);
    if (!k) return [{ art: "mitte" as const, text: `Spanne ohne Karte: ${s.stelleId}` }];
    const abweichung = k.x + k.breite / 2 - (s.links + s.rechts) / 2;
    return Math.abs(abweichung) > 1e-6 ? [{ art: "mitte" as const, text: `${s.stelleId} steht ${abweichung.toFixed(3)} mm neben der Mitte` }] : [];
  });
}

const gleich = (a: number, b: number) => Math.abs(a - b) < TOL;
const endetIn = (l: Strecke, x: number, y: number) => (gleich(l.x1, x) && gleich(l.y1, y)) || (gleich(l.x2, x) && gleich(l.y2, y));

/** Hängt das Sechseck an dieser Linie seines Netzes? Mitte oben/unten (Gruppe), Spitze links/rechts (Kanal), Zweig durch die Mitte (Seite). */
function haengtAn(h: SechseckL, l: Strecke): boolean {
  const cx = h.x + h.breite / 2, cy = h.y + h.hoehe / 2;
  const punkte: [number, number][] = [[cx, h.y], [cx, h.y + h.hoehe], [h.x, cy], [h.x + h.breite, cy]];
  if (punkte.some(([x, y]) => endetIn(l, x, y))) return true;
  const [x0, x1] = bereich(l.x1, l.x2);
  return waagerecht(l) && gleich(l.y1, cy) && x0 < h.x + TOL && x1 > h.x + h.breite - TOL;
}

/** Beginnt das Netz an der Karte seines Besitzers? Gruppen und Kanäle an der Unterkante, Seitenzweige an der Seitenkante. */
function anKante(p: KarteL, netz: string, x: number, y: number): boolean {
  const imKopf = y > p.y - TOL && y < p.y + p.hoehe + TOL;
  if (netz.endsWith("<links")) return gleich(x, p.x) && imKopf;
  if (netz.endsWith("<rechts")) return gleich(x, p.x + p.breite) && imKopf;
  return gleich(y, p.y + p.hoehe) && x > p.x + TOL && x < p.x + p.breite - TOL;
}

export function pruefeVerbindungen(z: Zeichnungsdaten, inhalt: PlanInhalt): Befund[] {
  const befunde: Befund[] = [];
  const melde = (text: string) => befunde.push({ art: "verbindung", text });
  const baum = baueBaum(inhalt);
  const karte = new Map(z.karten.map((k) => [k.id, k]));
  const imNetz = (n: string) => z.linien.filter((l) => l.netz === n);

  // 1. Jede gezeichnete Stelle, deren Elternstelle auch gezeichnet ist, hängt an ihr.
  for (const k of z.karten) {
    const s = baum.stelle(k.id);
    if (!s || s.eltern === null || !karte.has(s.eltern)) continue;
    if (s.lage === "unter") {
      const x = k.x + k.breite / 2;
      if (!z.linien.some((l) => l.netz.startsWith(`${s.eltern}>`) && senkrecht(l) && endetIn(l, x, k.y))) {
        melde(`${k.id} hängt an keinem Bus von ${s.eltern}`);
      }
    } else {
      const x = s.lage === "links" ? k.x + k.breite : k.x;
      if (!imNetz(`${s.eltern}<${s.lage}`).some((l) => waagerecht(l) && endetIn(l, x, k.y + k.kopfHoehe / 2))) {
        melde(`${k.id} hängt an keinem Zweig von ${s.eltern}`);
      }
    }
  }
  // 2. Jedes Sechseck hängt an einer Linie seines Netzes.
  for (const h of z.sechsecke) {
    if (!imNetz(h.netz).some((l) => haengtAn(h, l))) melde(`Sechseck ${h.verbindungId} in ${h.netz} hängt an keiner Linie`);
  }
  // 3. Jedes Netz ist EIN Stück (Sechsecke verbinden, was an ihnen hängt) und beginnt an seiner Stelle.
  for (const n of new Set(z.linien.map((l) => l.netz))) {
    const linien = imNetz(n);
    const hexe = z.sechsecke.filter((h) => h.netz === n);
    const eltern = [...linien, ...hexe].map((_, i) => i);
    const wurzel = (i: number): number => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])));
    const vereine = (a: number, b: number) => { eltern[wurzel(a)] = wurzel(b); };
    for (let i = 0; i < linien.length; i++) for (let j = i + 1; j < linien.length; j++) if (beruehren(linien[i], linien[j])) vereine(i, j);
    hexe.forEach((h, j) => linien.forEach((l, i) => { if (haengtAn(h, l)) vereine(i, linien.length + j); }));
    const teile = new Set(eltern.map((_, i) => wurzel(i))).size;
    if (teile > 1) melde(`Netz ${n} zerfällt in ${teile} Teile`);
    const p = karte.get(besitzerVon(n));
    if (!p) { melde(`Netz ${n} ohne Karte ${besitzerVon(n)}`); continue; }
    if (!linien.some((l) => anKante(p, n, l.x1, l.y1) || anKante(p, n, l.x2, l.y2))) melde(`Netz ${n} beginnt nicht an ${p.id}`);
  }
  return befunde;
}
