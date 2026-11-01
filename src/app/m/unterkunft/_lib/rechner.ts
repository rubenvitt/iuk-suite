/**
 * Rechenkern Unterkunft und Zelte (IDA-322). Reine Funktion `rechne(eingabe, richtwerte) → ergebnis`,
 * läuft im Browser; die Suite hat dafür bewusst weder Endpunkt noch Datenbank.
 *
 * DIESELBE RECHNUNG WIE IN LIFELINE HUB: Zeile für Zeile aus dem POC LLH-1519 (`rechner.js`) übertragen,
 * dessen Umsetzung dort LLH-1520 ist. Eine Änderung hier gehört auch dorthin.
 *
 * Grundsatz: Bedarf wird aufgerundet, Kapazität aus Fläche abgerundet, gerundet wird erst am Ende jeder
 * Größe (behebt W5, W6, W8 aus den Ausgangstabellen).
 *
 * KEIN "use client": reine Funktionen, von Server Components wie Client-Inseln lesbar (Falle 6).
 */
import { RICHTWERTE, type Richtwerte, type Zelttyp } from "./richtwerte";

export type Weg = "personen" | "flaeche" | "raeume" | "zelte";
export type Gruppe = "maenner" | "frauen" | "gesamt";
export type Belegung = "maenner" | "frauen";

export type Abzug = { laenge_m: number; breite_m: number };
export type Raum = { bezeichnung?: string; laenge_m: number; breite_m: number; abzuege?: Abzug[]; belegung?: Belegung };
/** Bestand je Zelttyp, Schlüssel ist der Typname (`SG 30`). */
export type Zeltbestand = Record<string, number>;

export type Eingabe = {
  weg: Weg;
  trennung?: boolean;
  personen?: { maenner?: number; frauen?: number; gesamt?: number };
  flaeche?: { maenner_m2?: number; frauen_m2?: number; gesamt_m2?: number };
  raeume?: Raum[];
  zelte?: { maenner?: Zeltbestand; frauen?: Zeltbestand; gesamt?: Zeltbestand };
};

export type GruppeErgebnis = { gruppe: Gruppe; personen: number };
export type RaumErgebnis = { bezeichnung: string; nutzflaeche_m2: number; plaetze: number; gruppe: Gruppe };
export type Anzahl = { typ: string; anzahl: number };

export type Ergebnis = {
  weg: Weg;
  trennung: boolean;
  personen: number;
  gruppen: GruppeErgebnis[];
  /** Nur bei Räumen, Fläche oder Zelten: dann ist `personen` die Zahl der Plätze. */
  kapazitaet: { plaetze: number; raeume: RaumErgebnis[] | null } | null;
  schlafen: {
    flaeche_m2: number;
    zelte_je_typ: Anzahl[];
    zeltmix: Anzahl[];
    zeltmix_grundflaeche_m2: number;
    zeltmix_platzbedarf_m2: number;
  };
  material: { feldbetten: number; decken: number };
  sanitaer: { toiletten: number; urinale: number; waschgelegenheiten: number; duschen: number | null };
  gesundheit: { betten: number; flaeche_m2: number; isolierstation: boolean };
  versorgung: { wasser_l_tag: number; davon_trinkwasser_l_tag: number; faekalien_l_tag: number; abfall_l_tag: number };
  verpflegung: { ausgabestellen_min: number; sitzplaetze: number; garnituren: number; aufenthaltszelte_je_typ: Anzahl[] };
  richtwerte_stand: string;
};

type Zahlenwerte = Omit<Richtwerte, "stand" | "zelte">;

function w(rw: Richtwerte, schluessel: keyof Zahlenwerte): number {
  return rw[schluessel].wert;
}

/** Aufrunden; vorher gegen Gleitkomma-Rest (z. B. 3.0000000004) glätten. */
function auf(x: number): number {
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}
function ab(x: number): number {
  return Math.floor(Math.round(x * 1e6) / 1e6);
}
/** Nur endliche, positive Zahlen zählen; alles andere ist 0. */
function zahl(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function nutzflaeche(raum: Pick<Raum, "laenge_m" | "breite_m" | "abzuege">): number {
  let f = zahl(raum.laenge_m) * zahl(raum.breite_m);
  for (const a of raum.abzuege ?? []) f -= zahl(a.laenge_m) * zahl(a.breite_m);
  return Math.max(0, Math.round(f * 100) / 100);
}

/** Plätze eines Raums: Nutzfläche durch Fläche je Person, abgerundet (W5). */
export function plaetzeImRaum(raum: Pick<Raum, "laenge_m" | "breite_m" | "abzuege">, rw: Richtwerte = RICHTWERTE): number {
  return ab(nutzflaeche(raum) / w(rw, "flaecheJePerson"));
}

/** Zeltmix: so wenige Zelte wie möglich, größtes zuerst, Rest ins kleinste passende. */
export function zeltmix(n: number, typen: readonly Zelttyp[]): Anzahl[] {
  if (n <= 0) return [];
  const sortiert = [...typen].sort((a, b) => b.schlafplaetze - a.schlafplaetze);
  const groesstes = sortiert[0];
  const anzahl = Math.floor(n / groesstes.schlafplaetze);
  const rest = n - anzahl * groesstes.schlafplaetze;
  const mix: Record<string, number> = {};
  if (anzahl > 0) mix[groesstes.typ] = anzahl;
  if (rest > 0) {
    const passend = [...sortiert].reverse().find((t) => t.schlafplaetze >= rest);
    if (passend) mix[passend.typ] = (mix[passend.typ] ?? 0) + 1;
  }
  return typen.filter((t) => mix[t.typ]).map((t) => ({ typ: t.typ, anzahl: mix[t.typ] }));
}

function gruppenAus(eingabe: Eingabe, rw: Richtwerte): { gruppen: GruppeErgebnis[]; raeume: RaumErgebnis[] | null } {
  const getrennt = !!eingabe.trennung;
  const m2 = w(rw, "flaecheJePerson");
  const typen = rw.zelte.typen;
  const gruppen: GruppeErgebnis[] = getrennt
    ? [{ gruppe: "maenner", personen: 0 }, { gruppe: "frauen", personen: 0 }]
    : [{ gruppe: "gesamt", personen: 0 }];
  const finde = (g: Gruppe): GruppeErgebnis => gruppen.find((x) => x.gruppe === (getrennt ? g : "gesamt"))!;
  let raeume: RaumErgebnis[] | null = null;

  switch (eingabe.weg) {
    case "personen": {
      const p = eingabe.personen ?? {};
      if (getrennt) {
        finde("maenner").personen = ab(zahl(p.maenner));
        finde("frauen").personen = ab(zahl(p.frauen));
      } else {
        finde("gesamt").personen = ab(zahl(p.gesamt != null ? p.gesamt : zahl(p.maenner) + zahl(p.frauen)));
      }
      break;
    }
    case "flaeche": {
      const f = eingabe.flaeche ?? {};
      if (getrennt) {
        finde("maenner").personen = ab(zahl(f.maenner_m2) / m2);
        finde("frauen").personen = ab(zahl(f.frauen_m2) / m2);
      } else {
        const gesamt = f.gesamt_m2 != null ? zahl(f.gesamt_m2) : zahl(f.maenner_m2) + zahl(f.frauen_m2);
        finde("gesamt").personen = ab(gesamt / m2);
      }
      break;
    }
    case "raeume": {
      raeume = (eingabe.raeume ?? []).map((r) => {
        const nutz = nutzflaeche(r);
        const plaetze = ab(nutz / m2);
        const g: Gruppe = getrennt ? (r.belegung === "frauen" ? "frauen" : "maenner") : "gesamt";
        finde(g).personen += plaetze;
        return { bezeichnung: r.bezeichnung ?? "", nutzflaeche_m2: nutz, plaetze, gruppe: g };
      });
      break;
    }
    case "zelte": {
      const z = eingabe.zelte ?? {};
      const summe = (bestand: Zeltbestand | undefined) =>
        typen.reduce((s, t) => s + ab(zahl((bestand ?? {})[t.typ])) * t.schlafplaetze, 0);
      if (getrennt) {
        finde("maenner").personen = summe(z.maenner);
        finde("frauen").personen = summe(z.frauen);
      } else {
        finde("gesamt").personen = summe(z.gesamt ?? (z as unknown as Zeltbestand));
      }
      break;
    }
    default:
      throw new Error(`weg unbekannt: ${String((eingabe as { weg: unknown }).weg)}`);
  }
  return { gruppen, raeume };
}

export function rechne(eingabe: Eingabe, rw: Richtwerte = RICHTWERTE): Ergebnis {
  const typen = rw.zelte.typen;
  const basis = gruppenAus(eingabe, rw);
  const gruppen = basis.gruppen;
  const n = gruppen.reduce((s, g) => s + g.personen, 0);
  const getrennt = !!eingabe.trennung;
  const maenner = getrennt ? gruppen[0].personen : null;

  const toiletteJe = (g: GruppeErgebnis): number => {
    if (g.gruppe === "maenner") return w(rw, "toiletteJeMaenner");
    if (g.gruppe === "frauen") return w(rw, "toiletteJeFrauen");
    return w(rw, "toiletteJeGemischt");
  };
  const jeGruppe = (f: (g: GruppeErgebnis) => number): number =>
    gruppen.reduce((s, g) => s + (g.personen > 0 ? f(g) : 0), 0);

  // Schlafen im Zelt: je Gruppe gerechnet; bei Trennung ist die Summe die der Gruppen (W7).
  const zelteJeTyp = typen.map((t) => ({ typ: t.typ, anzahl: jeGruppe((g) => auf(g.personen / t.schlafplaetze)) }));
  const mixRoh: Record<string, number> = {};
  for (const g of gruppen) {
    for (const e of zeltmix(g.personen, typen)) mixRoh[e.typ] = (mixRoh[e.typ] ?? 0) + e.anzahl;
  }
  const mix = typen.filter((t) => mixRoh[t.typ]).map((t) => ({ typ: t.typ, anzahl: mixRoh[t.typ] }));
  const abstand = w(rw, "zeltAbstand") || 0;
  const typVon = (name: string) => typen.find((t) => t.typ === name)!;
  const mixGrund = Math.round(mix.reduce((s, e) => {
    const t = typVon(e.typ);
    return s + e.anzahl * t.laenge_m * t.breite_m;
  }, 0) * 10) / 10;
  const mixPlatz = Math.round(mix.reduce((s, e) => {
    const t = typVon(e.typ);
    return s + e.anzahl * (t.laenge_m + abstand) * (t.breite_m + abstand);
  }, 0));

  const urinale = getrennt
    ? auf((maenner ?? 0) / w(rw, "urinalJeMaenner"))
    : auf((n * w(rw, "anteilMaennerOhneTrennung")) / w(rw, "urinalJeMaenner"));
  const duscheJe = w(rw, "duscheJe");

  const betten = n > 0 ? auf(n / w(rw, "krankenBettJe")) + w(rw, "krankenBettZuschlag") : 0;
  const sitz = auf(n * w(rw, "sitzAnteil"));
  const garnituren = auf(sitz / w(rw, "plaetzeJeGarnitur"));

  return {
    weg: eingabe.weg,
    trennung: getrennt,
    personen: n,
    gruppen,
    kapazitaet: eingabe.weg === "personen" ? null : { plaetze: n, raeume: basis.raeume },
    schlafen: {
      flaeche_m2: Math.round(n * w(rw, "flaecheJePerson") * 10) / 10,
      zelte_je_typ: zelteJeTyp,
      zeltmix: mix,
      zeltmix_grundflaeche_m2: mixGrund,
      zeltmix_platzbedarf_m2: mixPlatz,
    },
    material: {
      feldbetten: auf(n * w(rw, "feldbettJePerson")),
      decken: auf(n * w(rw, "deckenJePerson")),
    },
    sanitaer: {
      toiletten: jeGruppe((g) => auf(g.personen / toiletteJe(g))),
      urinale,
      waschgelegenheiten: jeGruppe((g) => auf(g.personen / w(rw, "waschJe"))),
      duschen: duscheJe ? jeGruppe((g) => auf(g.personen / duscheJe)) : null,
    },
    gesundheit: {
      betten,
      flaeche_m2: Math.round(betten * w(rw, "krankenFlaecheJeBett") * 10) / 10,
      isolierstation: n >= w(rw, "isolierAbPersonen"),
    },
    versorgung: {
      wasser_l_tag: Math.round(n * w(rw, "wasserJeTag")),
      davon_trinkwasser_l_tag: Math.round(n * w(rw, "trinkwasserJeTag")),
      faekalien_l_tag: Math.round(n * w(rw, "faekalienJeTag") * 10) / 10,
      abfall_l_tag: Math.round(n * w(rw, "abfallJeTag")),
    },
    verpflegung: {
      ausgabestellen_min: n === 0 ? 0 : n >= w(rw, "ausgabeZweiteAb") ? 2 : 1,
      sitzplaetze: sitz,
      garnituren,
      aufenthaltszelte_je_typ: typen.map((t) => ({ typ: t.typ, anzahl: auf(garnituren / t.garnituren) })),
    },
    richtwerte_stand: rw.stand,
  };
}
