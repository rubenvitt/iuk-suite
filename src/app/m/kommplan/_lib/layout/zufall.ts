import { baue, type EinheitEingabe, type StelleEingabe } from "../beispiele/bau";
import { baueBaum } from "../plan/baum";
import { KONTAKT_ARTEN, type KontaktArt, type PlanInhalt, type Verbindung } from "../plan/schema";

/** Deterministischer Zufall für Eigenschaftstests und das Vorschau-Skript — nie in der Engine selbst. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mische<T>(liste: readonly T[], seed: number): T[] {
  const r = mulberry32(seed);
  const aus = [...liste];
  for (let i = aus.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [aus[i], aus[j]] = [aus[j], aus[i]];
  }
  return aus;
}

const WOERTER = [
  "EA", "Behandlungsplatz", "Nord", "Bereitstellungsraum", "RK", "UE", "40-05-1", "Sanitätsdienst",
  "Führung", "Logistik", "&", "Technik", "Bereitstellungsraumkoordinationsstelle", "Fußstreife", "ÖEL", "2.",
];
const VERBINDUNGEN: Verbindung[] = [
  { id: "v1", art: "tmo", bezeichnung: "R_UE_1" }, { id: "v2", art: "tmo", bezeichnung: "R_UE_2" },
  { id: "v3", art: "dmo", bezeichnung: "DMO 608" }, { id: "v4", art: "draht", bezeichnung: "Standleitung" },
  { id: "v5", art: "tmo", bezeichnung: "BOS_NI_RES_09" }, { id: "v6", art: "mobil", bezeichnung: "Handy" },
];

type Wahl = <T>(xs: readonly T[]) => T;

function titel(r: () => number, wahl: Wahl): string {
  // Leere Titel gibt es: Vorlagen lassen Zeilen für den Handeintrag frei (Abweichung 15).
  if (r() < 0.05) return wahl(["", "   "]);
  return Array.from({ length: 1 + Math.floor(r() * 5) }, () => wahl(WOERTER)).join(" ");
}
function kanaele(r: () => number, wahl: Wahl): string[] {
  if (r() >= 0.15) return [];
  const erster = wahl(VERBINDUNGEN).id;
  const zweiter = wahl(VERBINDUNGEN).id;
  return r() < 0.3 && zweiter !== erster ? [erster, zweiter] : [erster];
}
/**
 * Jede fünfte Einheit hat einen langen Typ (zwei Zeilen Typ / Rufname), jede elfte einen, der auch
 * allein nicht in eine Zeile passt — sonst prüft die Textpassung (`pruefeTexte`) keinen Umbruch.
 * Ohne zusätzlichen Zufallszug: die übrigen Pläne bleiben dieselben.
 */
function einheiten(r: () => number, n: number): EinheitEingabe[] {
  return Array.from({ length: n }, (_, j): EinheitEingabe => {
    const typ = r() < 0.5 ? "RTW" : "KTW";
    if (j % 11 === 10) return ["Gerätewagen Katastrophenschutz", `RK UE 40-74-${j}`];
    if (j % 5 === 4) return ["GW Betreuung", `RK UE 40-74-${j}`];
    return `${typ} RK UE 40-83-${j}`;
  });
}

/** Zufallsrekursivbaum: jede Stelle an eine zufällige Trägerin — flache Grade, viele Formen. */
function freieStellen(r: () => number, wahl: Wahl, o: { stellen: number; mehrereWurzeln?: boolean }): StelleEingabe[] {
  const stellen: StelleEingabe[] = [];
  const traeger: string[] = [];
  for (let i = 0; i < o.stellen; i++) {
    const id = `s${i}`;
    const wurzel = traeger.length === 0 || (o.mehrereWurzeln === true && r() < 0.05);
    const z = r();
    const lage = wurzel ? "unter" : z < 0.1 ? "links" : z < 0.2 ? "rechts" : "unter";
    const kontakte: Partial<Record<KontaktArt, string>> = {};
    const dichte = r();
    for (const art of KONTAKT_ARTEN) if (r() < dichte) kontakte[art] = art === "email" ? "max.mustermann@drk-kreisverband-uelzen.de" : "0581 / 82 266";
    stellen.push({
      id, lage,
      eltern: wurzel ? null : wahl(traeger),
      titel: titel(r, wahl),
      zeichen: r() < 0.6 ? wahl(["rezept:D.1.4", "zusatz:eal", "zusatz:ea"]) : null,
      verbindung: r() < 0.85 ? wahl(VERBINDUNGEN).id : null,
      kanaele: kanaele(r, wahl),
      leiter: r() < 0.2 ? "Max Mustermann" : null,
      hervorheben: r() < 0.1,
      kontakte,
      einheiten: einheiten(r, r() < 0.6 ? 0 : Math.floor(r() * 13)),
    });
    if (lage === "unter") traeger.push(id);
  }
  return stellen;
}

/**
 * Die Form der großen Stab-Lage: Stab mit Seitenstellen → TEL → 3–14 EAL an einer oder zwei
 * Verbindungen → je 0–12 EA, fast alle an EINER Verbindung (daraus werden Kämme), mit Seitenstellen
 * auch an EA und selten eigenen Unterstellen (dann kämmt die Gruppe nicht, Abweichung 13).
 */
function stabStellen(r: () => number, wahl: Wahl, o: { stellen: number }): StelleEingabe[] {
  const stellen: StelleEingabe[] = [
    { id: "stab", titel: "Stab", zeichen: "zusatz:stab" },
    { id: "katsl", titel: "KatSL", eltern: "stab", lage: "links", verbindung: "v4" },
    { id: "lts", titel: "Leitstelle", eltern: "stab", lage: "rechts", verbindung: "v1" },
    { id: "tel", titel: "TEL", eltern: "stab", verbindung: "v3", einheiten: einheiten(r, Math.floor(r() * 4)) },
  ];
  const ealVerbindungen = r() < 0.5 ? ["v2"] : ["v2", "v5"];
  const eals = 3 + Math.floor(r() * 12);
  for (let a = 0; a < eals && stellen.length < o.stellen; a++) {
    const eal = `eal${a}`;
    stellen.push({ id: eal, titel: titel(r, wahl), zeichen: "zusatz:eal", eltern: "tel", verbindung: wahl(ealVerbindungen), kanaele: kanaele(r, wahl) });
    const eaVerbindung = wahl(["v3", "v6", "v2"]);
    const n = Math.floor(r() * 13);
    for (let e = 0; e < n && stellen.length < o.stellen; e++) {
      const ea = `${eal}-${e}`;
      stellen.push({
        id: ea, titel: titel(r, wahl), zeichen: "zusatz:ea", eltern: eal,
        verbindung: r() < 0.9 ? eaVerbindung : wahl(VERBINDUNGEN).id,
        kontakte: r() < 0.5 ? { digitalfunk: `RK UE 4${a % 10}-${10 + e}-1` } : {},
        einheiten: einheiten(r, Math.floor(r() * 13)),
      });
      if (r() < 0.15) stellen.push({ id: `${ea}-s`, titel: "Seite", eltern: ea, lage: r() < 0.5 ? "links" : "rechts", verbindung: r() < 0.5 ? "v4" : null });
      if (r() < 0.05) {
        const u = 1 + Math.floor(r() * 3);
        for (let x = 0; x < u; x++) stellen.push({ id: `${ea}-u${x}`, titel: `U ${x}`, eltern: ea, verbindung: "v6" });
      }
    }
  }
  return stellen;
}

export function zufallsPlan(
  seed: number, o: { stellen: number; mehrereWurzeln?: boolean; leerzeilen?: boolean; form?: "frei" | "stab" },
): PlanInhalt {
  const r = mulberry32(seed);
  const wahl: Wahl = (xs) => xs[Math.floor(r() * xs.length)];
  const stellen = o.form === "stab" ? stabStellen(r, wahl, o) : freieStellen(r, wahl, o);
  return baue({ optionen: { leerzeilen: o.leerzeilen ?? r() < 0.3 }, verbindungen: VERBINDUNGEN, stellen });
}

export function alsGliederung(inhalt: PlanInhalt): string {
  const baum = baueBaum(inhalt);
  const zeilen: string[] = [];
  const zeige = (id: string, tiefe: number) => {
    const s = baum.stelle(id)!;
    const kanal = s.kanaele.length > 0 ? ` ⬡${s.kanaele.join(",")}` : "";
    zeilen.push(`${"  ".repeat(tiefe)}- ${s.id} [${s.lage}] (${s.verbindungId ?? "–"})${kanal} ${JSON.stringify(s.titel)} · ${s.kontakte.length}K ${s.einheiten.length}E`);
    const seiten = baum.seiten(id);
    for (const x of [...seiten.links, ...seiten.rechts]) zeilen.push(`${"  ".repeat(tiefe + 1)}- ${x.id} [${x.lage}] (${x.verbindungId ?? "–"}) ${JSON.stringify(x.titel)}`);
    for (const k of baum.unter(id)) zeige(k.id, tiefe + 1);
  };
  baum.wurzeln.forEach((w) => zeige(w.id, 0));
  return zeilen.join("\n");
}
