import type { KontaktArt, VerbindungsArt } from "../plan/schema";

export type Ziel = "bildschirm" | "a4-quer" | "a3-quer";
export type Papierformat = Exclude<Ziel, "bildschirm">;
export type Darstellung = "normal" | "anker" | { verweisAufBlatt: number };
/** Text relativ zu seinem Träger (Karte, Einheitenkasten, Sechseck, Abzeichen); y = Grundlinie. */
export interface TextZeile { text: string; x: number; y: number; groesse: number; fett: boolean; anker: "start" | "mitte" | "ende" }
export interface KontaktZeileL { art: KontaktArt; y: number; hoehe: number; zeilen: TextZeile[] }
export interface KarteL {
  id: string; x: number; y: number; breite: number; hoehe: number; kopfHoehe: number;
  art: "normal" | "anker" | "verweis"; hervorheben: boolean; zeichen: string | null;
  titel: TextZeile[]; titelVoll: string; gekuerzt: boolean; leiter: TextZeile | null;
  kontakte: KontaktZeileL[]; verweis: TextZeile | null; einklappbar: boolean; eingeklappt: boolean;
}
export interface EinheitL { id: string; stelleId: string; x: number; y: number; breite: number; hoehe: number; zeilen: TextZeile[]; voll: string; zeichen: string | null }
export interface Strecke { netz: string; x1: number; y1: number; x2: number; y2: number; duenn: boolean }
export type SechseckForm = "funk" | "leitung" | "mobil";
export interface SechseckL { netz: string; verbindungId: string; art: VerbindungsArt; form: SechseckForm; x: number; y: number; breite: number; hoehe: number; beschriftung: TextZeile; voll: string; piktogramm: string }
export interface AbzeichenL { stelleId: string; x: number; y: number; breite: number; hoehe: number; text: TextZeile }
export interface Spanne { stelleId: string; links: number; rechts: number }
export interface LegendenEintrag { art: VerbindungsArt; text: string; reserve: boolean }
export interface Elemente { karten: KarteL[]; einheiten: EinheitL[]; linien: Strecke[]; sechsecke: SechseckL[]; abzeichen: AbzeichenL[]; spannen: Spanne[] }
export interface Zeichnungsdaten extends Elemente { breite: number; hoehe: number; legende: LegendenEintrag[] }
export interface Blatt {
  nummer: number; von: number; wurzelId: string | null; ankerId: string | null;
  zeichnung: Zeichnungsdaten; massstab: number; ursprung: { x: number; y: number };
  legendeZeilen: LegendenEintrag[][]; unterMindestschrift: boolean;
}
export interface Layout extends Zeichnungsdaten { seiten: Blatt[] }
export interface LayoutOptionen {
  eingeklappt?: ReadonlySet<string>;
  darstellung?: ReadonlyMap<string, Darstellung>;
  blatt?: { wurzelId: string; ankerId: string | null };
}

export function leereElemente(): Elemente {
  return { karten: [], einheiten: [], linien: [], sechsecke: [], abzeichen: [], spannen: [] };
}

export function verschiebeElemente(e: Elemente, dx: number, dy: number): Elemente {
  return {
    karten: e.karten.map((k) => ({ ...k, x: k.x + dx, y: k.y + dy })),
    einheiten: e.einheiten.map((x) => ({ ...x, x: x.x + dx, y: x.y + dy })),
    linien: e.linien.map((l) => ({ ...l, x1: l.x1 + dx, x2: l.x2 + dx, y1: l.y1 + dy, y2: l.y2 + dy })),
    sechsecke: e.sechsecke.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
    abzeichen: e.abzeichen.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
    spannen: e.spannen.map((s) => ({ ...s, links: s.links + dx, rechts: s.rechts + dx })),
  };
}
