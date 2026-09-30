import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { baueBaum, nachkommen } from "../plan/baum";
import { fuegeStelleEin, fuegeVerbindungEin } from "../plan/operationen";
import type { PlanInhalt, Stelle } from "../plan/schema";
import { OHNE_VERBINDUNG, anzeigereihenfolge, gruppenAnzahl } from "./gruppen";
import { MIN_MASSSTAB } from "./masse";
import { offeneSchnitte, teileAuf } from "./papier";
import { pruefeAlles } from "./pruefung";
import { umgebungFuer } from "./teilbaum";
import type { Zeichnungsdaten, Ziel } from "./typen";
import { zeichne } from "./zeichne";
import { alsGliederung, mische, mulberry32, zufallsPlan } from "./zufall";

const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);
const STAB_SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i);
const erklaere = (seed: number, inhalt: PlanInhalt, text: string) => `Seed ${seed}: ${text}\n${alsGliederung(inhalt)}`;
const befundeVon = (z: Zeichnungsdaten, inhalt: PlanInhalt) => pruefeAlles(z, inhalt);
/** Bricht irgendwo in diesem Plan eine Gruppe als Kamm um? */
function kaemmt(inhalt: PlanInhalt, ziel: Ziel): boolean {
  const u = umgebungFuer(inhalt, ziel);
  return u.sicht.sichtbar.some((s) => u.gruppen(s).some((g) => g.reihen.length > 1));
}

describe.each(["bildschirm", "a4-quer"] as const)("Zufallsbäume (%s)", (ziel) => {
  it.each(SEEDS)("Seed %i: keine Überlappung, keine Kreuzung, alles angebunden, Eltern mittig", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 5 + (seed % 36), mehrereWurzeln: seed % 7 === 0 });
    const z = zeichne(inhalt, ziel);
    const befunde = befundeVon(z, inhalt);
    expect(befunde, erklaere(seed, inhalt, befunde.map((b) => b.text).join("; "))).toEqual([]);
    expect(z.karten.map((k) => k.id).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
  });
});

/**
 * STAB-FÖRMIGE PLÄNE: der freie Generator hängt jede Stelle an eine zufällige Trägerin — flache
 * Grade, fast nie ein Kamm. Hier entstehen breite Ebenen mit Seitenstellen an Kammkindern, zwei
 * Kammgruppen nebeneinander, Kamm unter einer Karte mit Einheiten (Gasse) — die Fälle der großen
 * Stab-Lage. Dass sie wirklich kämmen, zählt der letzte Fall.
 */
describe.each(["bildschirm", "a4-quer"] as const)("Stab-förmige Zufallspläne (%s)", (ziel) => {
  it.each(STAB_SEEDS)("Seed %i: sauber und angebunden", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 120, form: "stab" });
    const z = zeichne(inhalt, ziel);
    const befunde = befundeVon(z, inhalt);
    expect(befunde, erklaere(seed, inhalt, befunde.map((b) => b.text).join("; "))).toEqual([]);
  });
  it("mindestens ein Drittel der Stab-Seeds kämmt irgendwo — sonst prüfen die Fälle darüber keinen Kamm", () => {
    const mitKamm = STAB_SEEDS.filter((seed) => kaemmt(zufallsPlan(seed, { stellen: 120, form: "stab" }), ziel));
    expect(mitKamm.length).toBeGreaterThanOrEqual(STAB_SEEDS.length / 3);
  });
});

describe("Gleiche Daten, gleiches Bild", () => {
  it.each(SEEDS.slice(0, 60))("Seed %i: ein umsortiertes stellen-Array ändert nichts", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 20 });
    expect(zeichne({ ...inhalt, stellen: mische(inhalt.stellen, seed) }, "bildschirm")).toEqual(zeichne(inhalt, "bildschirm"));
  });
  it.each(SEEDS.slice(0, 30))("Seed %i: gleiche reihenfolge-Werte entscheidet die id, nicht die Array-Position", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 15 });
    const gleich = { ...inhalt, stellen: inhalt.stellen.map((s) => ({ ...s, reihenfolge: 0 })) };
    expect(zeichne({ ...gleich, stellen: mische(gleich.stellen, seed + 1) }, "bildschirm")).toEqual(zeichne(gleich, "bildschirm"));
  });
});

/** Karten-Lage relativ zur ersten Karte der Menge. */
function relativ(z: Zeichnungsdaten, ids: string[]): Record<string, [number, number]> {
  const lage = new Map(z.karten.map((k) => [k.id, [k.x, k.y] as [number, number]]));
  const [x0, y0] = lage.get(ids[0])!;
  return Object.fromEntries(ids.map((id) => { const [x, y] = lage.get(id)!; return [id, [Math.round((x - x0) * 1e6) / 1e6, Math.round((y - y0) * 1e6) / 1e6]]; }));
}

type Variante = "ende" | "mitte" | "neue Gruppe";
interface Einfuegung { inhalt: PlanInhalt; neu: PlanInhalt; wirksam: boolean; geschwister: number; gruppen: number }

/**
 * Drei Arten einzufügen (Spec §10, Präzisierung im Umsetzungsplan Task 11):
 * - „ende": letzte Unterstelle, tritt der Verbindung des bisher letzten Kindes bei;
 * - „mitte": zwischen zwei Geschwister (oder vor das erste), mit der Verbindung des Vorgängers —
 *   die Gruppenfolge bleibt, frühere Geschwister stehen weiter links;
 * - „neue Gruppe": letzte Unterstelle mit einer neuen Verbindung, also eine Gruppe mehr.
 * Wirksam ist ein Fall nur ohne Kamm (vorher wie nachher) und bei gleichen Zeilenhöhen und Lücken:
 * eine Gruppe mehr darf die Ebenenlücke wachsen lassen, dann rückt zu Recht alles darunter.
 * Die Trägerin wird bevorzugt unter denen mit Kindern gewählt (bei „neue Gruppe": mit mehreren
 * Gruppen) — sonst prüft die Geschwister- und Gruppenebene nichts.
 */
function einfuegung(seed: number, variante: Variante): Einfuegung {
  const inhalt = zufallsPlan(seed, { stellen: 25 });
  const baum = baueBaum(inhalt);
  const r = mulberry32(seed + 1000);
  const traeger = inhalt.stellen.filter((s) => s.lage === "unter");
  const mitKindern = traeger.filter((s) => baum.unter(s.id).length > 0);
  const mitGruppen = mitKindern.filter((s) => gruppenAnzahl(baum.unter(s.id)) > 1);
  const auswahl = variante === "ende" ? traeger
    : variante === "neue Gruppe" && mitGruppen.length > 0 ? mitGruppen
    : mitKindern.length > 0 ? mitKindern : traeger;
  const p = auswahl[Math.floor(r() * auswahl.length)];
  const kinder = baum.unter(p.id);
  let neu: PlanInhalt;
  if (variante === "mitte" && kinder.length > 0) {
    const i = Math.floor(r() * kinder.length);
    const reihenfolge = i === 0 ? kinder[0].reihenfolge - 1 : (kinder[i - 1].reihenfolge + kinder[i].reihenfolge) / 2;
    neu = fuegeStelleEin(inhalt, { id: "neu", titel: "N", eltern: p.id, verbindungId: kinder[Math.max(0, i - 1)].verbindungId, reihenfolge });
  } else {
    const bisher = anzeigereihenfolge(kinder);
    const reihenfolge = kinder.length === 0 ? 0 : Math.max(...kinder.map((s) => s.reihenfolge)) + 1;
    if (variante === "neue Gruppe") {
      const mitV = fuegeVerbindungEin(inhalt, { id: "vneu", art: "tmo", bezeichnung: "NEU" });
      neu = fuegeStelleEin(mitV, { id: "neu", titel: "N", eltern: p.id, verbindungId: "vneu", reihenfolge });
    } else {
      neu = fuegeStelleEin(inhalt, { id: "neu", titel: "N", eltern: p.id, verbindungId: bisher.at(-1)?.verbindungId ?? null, reihenfolge });
    }
  }
  // Vorbedingung (Abweichung 10): kein Kamm, weder vorher noch nachher — ein Kamm verteilt die
  // Breite der ganzen Kinderreihe neu, auch für frühere Gruppen. Das ist gewollt, kein Befund.
  const zeilen = (x: PlanInhalt) => umgebungFuer(x, "bildschirm").zeilen;
  const wirksam = !kaemmt(inhalt, "bildschirm") && !kaemmt(neu, "bildschirm")
    && JSON.stringify(zeilen(inhalt)) === JSON.stringify(zeilen(neu));
  return { inhalt, neu, wirksam, geschwister: kinder.length, gruppen: gruppenAnzahl(kinder) };
}

const EINFUEGE_SEEDS = SEEDS.slice(0, 80);
const VARIANTEN: Variante[] = ["ende", "mitte", "neue Gruppe"];

describe.each(VARIANTEN)("Einfügen (%s) verschiebt nichts, was links steht", (variante) => {
  it.each(EINFUEGE_SEEDS)("Seed %i", (seed) => {
    const { inhalt, neu, wirksam } = einfuegung(seed, variante);
    if (!wirksam) return;
    const vorher = zeichne(inhalt, "bildschirm");
    const nachher = zeichne(neu, "bildschirm");
    // keine vorhandene Karte ändert ihr y
    const yVorher = new Map(vorher.karten.map((k) => [k.id, k.y]));
    for (const k of nachher.karten) if (k.id !== "neu") expect(k.y, erklaere(seed, inhalt, `y von ${k.id}`)).toBeCloseTo(yVorher.get(k.id)!, 6);
    // Je Ebene bleiben zwei Blöcke starr: die früheren Gruppen untereinander und die früheren
    // Geschwister in der Gruppe von C. Die Gruppe von C als Ganzes darf gegen die früheren Gruppen
    // rücken: C steht mittig über seinen Kindern, eine Stelle rechts zieht die Kinder von C nach
    // links, damit wächst die linke Kontur der Gruppe, und das Links-Packen setzt sie weiter
    // rechts an (Reingold-Tilford; Review Phase 1, Seed 70 „neue Gruppe" unter s14).
    const nachBaum = baueBaum(neu);
    const teilbaumIds = (gs: Stelle[]) => gs.flatMap((g) => [g.id, ...nachkommen(nachBaum, g.id).map((n) => n.id)]);
    let c = nachBaum.stelle("neu")!;
    while (c.eltern !== null) {
      const geschwister = anzeigereihenfolge(nachBaum.unter(c.eltern));
      const frueher = geschwister.slice(0, geschwister.findIndex((g) => g.id === c.id));
      const gruppe = (g: Stelle) => g.verbindungId ?? OHNE_VERBINDUNG;
      for (const [block, ids] of [
        ["frühere Gruppen", teilbaumIds(frueher.filter((g) => gruppe(g) !== gruppe(c)))],
        ["frühere Geschwister in der Gruppe", teilbaumIds(frueher.filter((g) => gruppe(g) === gruppe(c)))],
      ] as const) {
        if (ids.length > 1) expect(relativ(nachher, ids), erklaere(seed, inhalt, `Ebene über ${c.id}, ${block}`)).toEqual(relativ(vorher, ids));
      }
      c = nachBaum.stelle(c.eltern)!;
    }
  });
  it("genug wirksame Fälle neben Geschwistern und neben mehreren Gruppen — sonst prüft die Geschwisterebene nichts", () => {
    const faelle = EINFUEGE_SEEDS.map((seed) => einfuegung(seed, variante)).filter((f) => f.wirksam);
    // Gemessen (80 Seeds): ende 29/14, mitte 77/42, neue Gruppe 12/12 — eine Gruppe mehr lässt oft die Lücke wachsen.
    const mindestens = { ende: [20, 10], mitte: [60, 30], "neue Gruppe": [10, 10] }[variante];
    expect(faelle.filter((f) => f.geschwister > 0).length).toBeGreaterThanOrEqual(mindestens[0]);
    expect(faelle.filter((f) => f.gruppen > 1).length).toBeGreaterThanOrEqual(mindestens[1]);
  });
});

describe("Grenzfälle", () => {
  const V = [
    { id: "v", art: "tmo" as const, bezeichnung: "R_UE_2" }, { id: "w2", art: "tmo" as const, bezeichnung: "R_UE_3" },
    { id: "x", art: "tmo" as const, bezeichnung: "R_UE_4" }, { id: "d", art: "draht" as const, bezeichnung: "Standleitung" },
  ];
  const kinder = (eltern: string, n: number, verbindung: string, rest: object = {}) =>
    Array.from({ length: n }, (_, i) => ({ id: `${eltern}-${verbindung}-${i}`, titel: `EA ${i}`, eltern, verbindung, ...rest }));
  function sauber(inhalt: PlanInhalt): void {
    for (const ziel of ["bildschirm", "a4-quer"] as const) {
      const befunde = befundeVon(zeichne(inhalt, ziel), inhalt);
      expect(befunde.map((b) => b.text), ziel).toEqual([]);
    }
  }

  it("30 Einheiten, drei Seitenstellen links und zwölf Kinder an einer Verbindung — sauber auf Bildschirm und A4", () => {
    sauber(baue({
      verbindungen: V,
      stellen: [
        { id: "w", titel: "Stab", einheiten: Array.from({ length: 30 }, (_, i) => `ELW ${i}`) },
        ...[1, 2, 3].map((i) => ({ id: `l${i}`, titel: `Links ${i}`, eltern: "w", lage: "links" as const, verbindung: "d" })),
        ...kinder("w", 12, "v", { einheiten: ["RTW 1"] }),
      ],
    }));
  });
  it("Kamm mit Seitenstellen an Kammkindern, auch links am ersten Kind einer Reihe", () => {
    const k = kinder("w", 14, "v");
    const seiten = [0, 3, 5, 6, 7, 12].map((i) => ({ id: `s${i}`, titel: "Seite", eltern: k[i].id, lage: (i % 2 === 0 ? "links" : "rechts") as "links" | "rechts", verbindung: "d" }));
    const inhalt = baue({ verbindungen: V, stellen: [{ id: "w", titel: "W" }, ...k, ...seiten] });
    expect(umgebungFuer(inhalt, "a4-quer").gruppen(baueBaum(inhalt).wurzeln[0])[0].reihen.length).toBeGreaterThan(1);
    sauber(inhalt);
  });
  it("zwei Kammgruppen nebeneinander unter einer Karte mit Einheiten und Kanal (Gasse)", () => {
    const inhalt = baue({ verbindungen: V, stellen: [
      { id: "w", titel: "W", einheiten: ["ELW 1", "ELW 2"], kanaele: ["x"] }, ...kinder("w", 9, "v"), ...kinder("w", 9, "w2"),
    ] });
    const u = umgebungFuer(inhalt, "a4-quer");
    expect(u.gruppen(u.sicht.wurzeln[0]).map((g) => g.reihen.length > 1)).toEqual([true, true]);
    sauber(inhalt);
  });
  it("drei Verbindungen à fünf Blattkinder: das Budget gilt für die ganze Reihe", () => {
    const inhalt = baue({ verbindungen: V, stellen: [{ id: "w", titel: "W" }, ...kinder("w", 5, "v"), ...kinder("w", 5, "w2"), ...kinder("w", 5, "x")] });
    const u = umgebungFuer(inhalt, "a4-quer");
    expect(u.gruppen(u.sicht.wurzeln[0]).every((g) => g.reihen.length > 1)).toBe(true);
    sauber(inhalt);
  });
  it("sechs Kinder mit je zwölf Einheiten und eines mit zwei Seitenstellen: Kamm nach Breite", () => {
    const zwoelf = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const inhalt = baue({ verbindungen: V, stellen: [
      { id: "w", titel: "W" }, ...kinder("w", 6, "v", { einheiten: zwoelf }),
      { id: "breit", titel: "Breit", eltern: "w", verbindung: "v" },
      { id: "bl", titel: "L", eltern: "breit", lage: "links", verbindung: "d" },
      { id: "br", titel: "R", eltern: "breit", lage: "rechts", verbindung: "d" },
    ] });
    expect(umgebungFuer(inhalt, "a4-quer").gruppen(baueBaum(inhalt).wurzeln[0])[0].reihen.length).toBeGreaterThan(1);
    sauber(inhalt);
  });
  it("Kinder mit eigenen Unterstellen kämmen nicht; die Zeichnung bleibt sauber", () => {
    const stellen: Parameters<typeof baue>[0]["stellen"] = [{ id: "w", titel: "W" }];
    for (let i = 0; i < 12; i++) stellen.push({ id: `eal${i}`, titel: `EAL ${i}`, eltern: "w", verbindung: "v" }, ...kinder(`eal${i}`, 3, "x"));
    const inhalt = baue({ verbindungen: V, stellen });
    expect(umgebungFuer(inhalt, "bildschirm").gruppen(baueBaum(inhalt).wurzeln[0])[0].reihen).toHaveLength(1);
    sauber(inhalt);
  });
});

describe("Aufteilung deckt jede Stelle genau einmal ab, jedes Blatt sauber und angebunden", () => {
  const faelle = [
    ...SEEDS.slice(0, 40).map((seed) => [seed, zufallsPlan(seed, { stellen: 30 + (seed % 50), mehrereWurzeln: seed % 5 === 0 })] as const),
    ...STAB_SEEDS.slice(0, 20).map((seed) => [seed, zufallsPlan(seed, { stellen: 120, form: "stab" })] as const),
  ];
  it.each(faelle)("Seed %i", (seed, inhalt) => {
    const blaetter = teileAuf(inhalt, "a4-quer");
    const normal = blaetter.flatMap((b) => b.zeichnung.karten.filter((k) => k.art === "normal").map((k) => k.id));
    expect(normal.sort(), erklaere(seed, inhalt, "Abdeckung")).toEqual(inhalt.stellen.map((s) => s.id).sort());
    for (const b of blaetter) {
      expect(befundeVon(b.zeichnung, inhalt).map((x) => x.text), erklaere(seed, inhalt, `Blatt ${b.nummer}`)).toEqual([]);
      // Spec §5.6: „reicht das nicht: aufteilen" — unter 6 pt bleibt nur ein Blatt, auf dem nichts
      // mehr zu schneiden ist (heute: durch die Höhe begrenzte Blätter mit vielen Blattkindern).
      if (b.massstab < MIN_MASSSTAB - 1e-9) expect(offeneSchnitte(inhalt, b), erklaere(seed, inhalt, `Blatt ${b.nummer} unter 6 pt, aber teilbar`)).toEqual([]);
      // Verweisnummern steigen in Lesereihenfolge und zeigen auf das Blatt ihres Teilbaums
      const verweise = b.zeichnung.karten.filter((k) => k.verweis !== null);
      for (const k of verweise) expect(blaetter[Number(k.verweis!.text.replace("→ Blatt ", "")) - 1].wurzelId).toBe(k.id);
    }
  });
});
