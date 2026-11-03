/**
 * Rechenkern Unterkunft und Zelte (IDA-322, IDA-323). Reine Funktion `rechne(eingabe, richtwerte) → ergebnis`,
 * läuft im Browser; die Suite hat dafür bewusst weder Endpunkt noch Datenbank.
 *
 * DIESELBE RECHNUNG WIE IN LIFELINE HUB: übertragen aus `frontend/src/betreuung/unterkunft/rechnerKern.ts`
 * (LLH-1520), mit denselben Schlüsseln, Typen und Feldnamen. Den Beweis führen die gemeinsamen Testfälle
 * `lifeline-hub/faelle.json` (`rechner.faelle.test.ts`). Eine Änderung hier gehört auch dorthin.
 * Zusätze der Suite: die Basis als Vorgabe für `richtwerte`, `plaetzeImRaum` und ein lauter Fehler bei
 * unbekanntem Weg.
 *
 * Grundsatz: Bedarf wird aufgerundet, Kapazität aus Fläche abgerundet, gerundet wird erst am Ende jeder
 * Größe (behebt W5, W6, W8 aus den Ausgangstabellen).
 *
 * KEIN "use client": reine Funktionen, von Server Components wie Client-Inseln lesbar (Falle 6).
 */
import { RICHTWERTE, ZELTTYPEN, type Richtwerte, type ZeltTyp } from "./richtwerte";

export type Weg = "personen" | "raeume" | "flaeche" | "zelte";
export type Gruppe = "gesamt" | "maenner" | "frauen";
export type Belegung = "maenner" | "frauen";

export interface Abzug {
  laenge_m: number;
  breite_m: number;
}

export interface Raum {
  bezeichnung?: string;
  laenge_m: number;
  breite_m: number;
  abzuege?: Abzug[];
  /** Nur bei Trennung: welche Gruppe den Raum belegt. */
  belegung?: Belegung;
}

export type Zeltbestand = Partial<Record<ZeltTyp, number>>;

export interface Eingabe {
  weg: Weg;
  trennung?: boolean;
  personen?: { gesamt?: number; maenner?: number; frauen?: number };
  flaeche?: { gesamt_m2?: number; maenner_m2?: number; frauen_m2?: number };
  raeume?: Raum[];
  zelte?: { gesamt?: Zeltbestand; maenner?: Zeltbestand; frauen?: Zeltbestand };
}

export interface TypAnzahl {
  typ: ZeltTyp;
  anzahl: number;
}

export interface RaumErgebnis {
  bezeichnung: string;
  nutzflaeche_m2: number;
  plaetze: number;
  gruppe: Gruppe;
}

export interface Ergebnis {
  weg: Weg;
  trennung: boolean;
  personen: number;
  gruppen: { gruppe: Gruppe; personen: number }[];
  /** Kapazität aus Räumen, Fläche oder Zelten; beim Weg Personen `null`. */
  kapazitaet: { plaetze: number; raeume: RaumErgebnis[] | null } | null;
  schlafen: {
    flaeche_m2: number;
    zelte_je_typ: TypAnzahl[];
    zeltmix: TypAnzahl[];
    zeltmix_grundflaeche_m2: number;
    zeltmix_platzbedarf_m2: number;
  };
  material: { feldbetten: number; decken: number };
  sanitaer: { toiletten: number; urinale: number; waschplaetze: number; duschen: number };
  gesundheit: { betten: number; flaeche_m2: number; isolierstation: boolean };
  versorgung: {
    wasser_l_tag: number;
    davon_trinkwasser_l_tag: number;
    faekalien_l_tag: number;
    abfall_l_tag: number;
  };
  verpflegung: {
    ausgabestellen: number;
    sitzplaetze: number;
    garnituren: number;
    aufenthaltszelte_je_typ: TypAnzahl[];
  };
}

/** Glättet Gleitkomma-Reste (3.0000000004) vor dem Runden. */
const glatt = (x: number) => Math.round(x * 1e6) / 1e6;
const auf = (x: number) => Math.ceil(glatt(x));
const ab = (x: number) => Math.floor(glatt(x));
const eineStelle = (x: number) => Math.round(glatt(x) * 10) / 10;
const zweiStellen = (x: number) => Math.round(glatt(x) * 100) / 100;
const ganz = (x: number) => Math.round(glatt(x));

/** Positive endliche Zahl oder 0. */
function zahl(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function w(rw: Readonly<Richtwerte>, schluessel: string): number {
  const v = rw[schluessel];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Richtwert fehlt: ${schluessel}`);
  }
  return v;
}

export interface Zelt {
  typ: ZeltTyp;
  schlafplaetze: number;
  garnituren: number;
  laenge_m: number;
  breite_m: number;
}

export function zelte(rw: Readonly<Richtwerte> = RICHTWERTE): Zelt[] {
  return ZELTTYPEN.map(({ typ }) => ({
    typ,
    schlafplaetze: w(rw, `zelt_${typ}_schlafplaetze`),
    garnituren: w(rw, `zelt_${typ}_garnituren`),
    laenge_m: w(rw, `zelt_${typ}_laenge_m`),
    breite_m: w(rw, `zelt_${typ}_breite_m`),
  }));
}

/** Nutzfläche eines Raums: Länge × Breite abzüglich der Abzüge, nie negativ, zwei Stellen. */
export function nutzflaeche(raum: Raum): number {
  let f = zahl(raum.laenge_m) * zahl(raum.breite_m);
  for (const a of raum.abzuege ?? []) f -= zahl(a.laenge_m) * zahl(a.breite_m);
  return Math.max(0, zweiStellen(f));
}

/**
 * Zeltmix für `n` Personen: so wenige Zelte wie möglich, das größte zuerst, der Rest ins kleinste
 * Zelt, das ihn fasst.
 */
/** Plätze eines Raums: Nutzfläche durch Fläche je Person, abgerundet (W5). */
export function plaetzeImRaum(raum: Raum, rw: Readonly<Richtwerte> = RICHTWERTE): number {
  return ab(nutzflaeche(raum) / w(rw, "flaeche_je_person_m2"));
}

export function zeltmix(n: number, typen: readonly Zelt[]): TypAnzahl[] {
  if (n <= 0) return [];
  const absteigend = [...typen].sort((a, b) => b.schlafplaetze - a.schlafplaetze);
  const groesstes = absteigend[0];
  const mix = new Map<ZeltTyp, number>();
  const volle = Math.floor(n / groesstes.schlafplaetze);
  const rest = n - volle * groesstes.schlafplaetze;
  if (volle > 0) mix.set(groesstes.typ, volle);
  if (rest > 0) {
    const passend = [...absteigend].reverse().find((t) => t.schlafplaetze >= rest) ?? groesstes;
    mix.set(passend.typ, (mix.get(passend.typ) ?? 0) + 1);
  }
  return typen.filter((t) => mix.has(t.typ)).map((t) => ({ typ: t.typ, anzahl: mix.get(t.typ)! }));
}

function gruppenAus(
  eingabe: Eingabe,
  rw: Readonly<Richtwerte>,
  typen: readonly Zelt[],
): { gruppen: { gruppe: Gruppe; personen: number }[]; raeume: RaumErgebnis[] | null } {
  const getrennt = !!eingabe.trennung;
  const m2 = w(rw, "flaeche_je_person_m2");
  const zaehler: Record<Gruppe, number> = { gesamt: 0, maenner: 0, frauen: 0 };
  let raeume: RaumErgebnis[] | null = null;

  const bestand = (b: Zeltbestand | undefined) =>
    typen.reduce((s, t) => s + ab(zahl(b?.[t.typ])) * t.schlafplaetze, 0);

  switch (eingabe.weg) {
    case "personen": {
      const p = eingabe.personen ?? {};
      if (getrennt) {
        zaehler.maenner = ab(zahl(p.maenner));
        zaehler.frauen = ab(zahl(p.frauen));
      } else {
        zaehler.gesamt = ab(p.gesamt != null ? zahl(p.gesamt) : zahl(p.maenner) + zahl(p.frauen));
      }
      break;
    }
    case "flaeche": {
      const f = eingabe.flaeche ?? {};
      if (getrennt) {
        zaehler.maenner = ab(zahl(f.maenner_m2) / m2);
        zaehler.frauen = ab(zahl(f.frauen_m2) / m2);
      } else {
        const gesamt =
          f.gesamt_m2 != null ? zahl(f.gesamt_m2) : zahl(f.maenner_m2) + zahl(f.frauen_m2);
        zaehler.gesamt = ab(gesamt / m2);
      }
      break;
    }
    case "raeume": {
      raeume = (eingabe.raeume ?? []).map((r) => {
        const nutz = nutzflaeche(r);
        const plaetze = ab(nutz / m2);
        const gruppe: Gruppe = getrennt
          ? r.belegung === "frauen"
            ? "frauen"
            : "maenner"
          : "gesamt";
        zaehler[gruppe] += plaetze;
        return { bezeichnung: r.bezeichnung ?? "", nutzflaeche_m2: nutz, plaetze, gruppe };
      });
      break;
    }
    case "zelte": {
      const z = eingabe.zelte ?? {};
      if (getrennt) {
        zaehler.maenner = bestand(z.maenner);
        zaehler.frauen = bestand(z.frauen);
      } else {
        zaehler.gesamt = bestand(z.gesamt);
      }
      break;
    }
    default:
      throw new Error(`weg unbekannt: ${String((eingabe as { weg: unknown }).weg)}`);
  }
  const gruppen: Gruppe[] = getrennt ? ["maenner", "frauen"] : ["gesamt"];
  return { gruppen: gruppen.map((g) => ({ gruppe: g, personen: zaehler[g] })), raeume };
}

export function rechne(eingabe: Eingabe, rw: Readonly<Richtwerte> = RICHTWERTE): Ergebnis {
  const typen = zelte(rw);
  const { gruppen, raeume } = gruppenAus(eingabe, rw, typen);
  const n = gruppen.reduce((s, g) => s + g.personen, 0);
  const getrennt = !!eingabe.trennung;

  /** Summe über die Gruppen mit Personen; jede Gruppe für sich aufgerundet. */
  const jeGruppe = (f: (g: { gruppe: Gruppe; personen: number }) => number) =>
    gruppen.reduce((s, g) => s + (g.personen > 0 ? f(g) : 0), 0);
  const toiletteJe = (g: Gruppe) =>
    w(
      rw,
      g === "maenner"
        ? "toilette_je_personen_maenner"
        : g === "frauen"
          ? "toilette_je_personen_frauen"
          : "toilette_je_personen_gemischt",
    );

  const zelteJeTyp = typen.map((t) => ({
    typ: t.typ,
    anzahl: jeGruppe((g) => auf(g.personen / t.schlafplaetze)),
  }));
  const mixSumme = new Map<ZeltTyp, number>();
  for (const g of gruppen) {
    for (const e of zeltmix(g.personen, typen)) {
      mixSumme.set(e.typ, (mixSumme.get(e.typ) ?? 0) + e.anzahl);
    }
  }
  const mix = typen
    .filter((t) => mixSumme.has(t.typ))
    .map((t) => ({ typ: t.typ, anzahl: mixSumme.get(t.typ)! }));
  const abstand = w(rw, "zelt_abstand_m");
  const zeltVon = (typ: ZeltTyp) => typen.find((t) => t.typ === typ)!;
  const grund = mix.reduce((s, e) => {
    const t = zeltVon(e.typ);
    return s + e.anzahl * t.laenge_m * t.breite_m;
  }, 0);
  const platz = mix.reduce((s, e) => {
    const t = zeltVon(e.typ);
    return s + e.anzahl * (t.laenge_m + abstand) * (t.breite_m + abstand);
  }, 0);

  const maenner = gruppen.find((g) => g.gruppe === "maenner")?.personen ?? 0;
  const urinale = getrennt
    ? auf(maenner / w(rw, "urinal_je_maenner"))
    : auf((n * w(rw, "maenneranteil_ohne_trennung_prozent")) / 100 / w(rw, "urinal_je_maenner"));

  const betten =
    n > 0 ? auf(n / w(rw, "krankenbett_je_personen")) + w(rw, "krankenbett_zuschlag") : 0;
  const sitzplaetze = auf(n / w(rw, "personen_je_sitzplatz"));
  const garnituren = auf(sitzplaetze / w(rw, "plaetze_je_garnitur"));

  return {
    weg: eingabe.weg,
    trennung: getrennt,
    personen: n,
    gruppen,
    kapazitaet: eingabe.weg === "personen" ? null : { plaetze: n, raeume },
    schlafen: {
      flaeche_m2: eineStelle(n * w(rw, "flaeche_je_person_m2")),
      zelte_je_typ: zelteJeTyp,
      zeltmix: mix,
      zeltmix_grundflaeche_m2: eineStelle(grund),
      zeltmix_platzbedarf_m2: ganz(platz),
    },
    material: {
      feldbetten: auf(n * w(rw, "feldbett_je_person")),
      decken: auf(n * w(rw, "decken_je_person")),
    },
    sanitaer: {
      toiletten: jeGruppe((g) => auf(g.personen / toiletteJe(g.gruppe))),
      urinale,
      waschplaetze: jeGruppe((g) => auf(g.personen / w(rw, "waschplatz_je_personen"))),
      duschen: jeGruppe((g) => auf(g.personen / w(rw, "dusche_je_personen"))),
    },
    gesundheit: {
      betten,
      flaeche_m2: eineStelle(betten * w(rw, "krankenflaeche_je_bett_m2")),
      isolierstation: n >= w(rw, "isolierstation_ab_personen"),
    },
    versorgung: {
      wasser_l_tag: ganz(n * w(rw, "wasser_je_person_l")),
      davon_trinkwasser_l_tag: ganz(n * w(rw, "trinkwasser_je_person_l")),
      faekalien_l_tag: eineStelle(n * w(rw, "faekalien_je_person_l")),
      abfall_l_tag: ganz(n * w(rw, "abfall_je_person_l")),
    },
    verpflegung: {
      ausgabestellen: n === 0 ? 0 : n >= w(rw, "zweite_ausgabestelle_ab_personen") ? 2 : 1,
      sitzplaetze,
      garnituren,
      aufenthaltszelte_je_typ: typen.map((t) => ({
        typ: t.typ,
        anzahl: auf(garnituren / t.garnituren),
      })),
    },
  };
}
