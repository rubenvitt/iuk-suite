import type { Block, Einsatz } from "./format";
import { datumText, dauerMinuten, dauerText, zeitpunktText } from "./zeit";

export interface Einsatztexte { ort: string; objekt: string; beginn: string; ende: string; dauer: string }

/**
 * Ort, Objekt, Beginn, Ende und Dauer — geteilt mit den Kern-Ansichten
 * (`ansichten/Einsatzdetail.tsx`), damit Detailansicht und Berichtsblatt für denselben Einsatz
 * dasselbe zeigen. `bericht()` baut seine fünf gleichnamigen Felder aus dieser Funktion.
 */
export function einsatzTexte(e: Einsatz, zeitzone: string): Einsatztexte {
  const minuten = dauerMinuten(e, zeitzone);
  return {
    ort: [e.strasse, e.ort].filter(Boolean).join(", ") || "—",
    objekt: e.objekt || "—",
    beginn: `${datumText(e.beginnDatum)}, ${e.beginnZeit} Uhr`,
    ende: e.endeDatum && e.endeZeit ? `${datumText(e.endeDatum)}, ${e.endeZeit} Uhr` : "nicht angegeben",
    dauer: minuten === null || minuten < 0 ? "—" : dauerText(minuten),
  };
}

export interface Patientenzeile { art: "Vor Ort" | "Transport"; durch: string; einsatznummer: string }

/**
 * Die Angaben je Patient als Text, leer ohne `patienten`. Geteilt mit `ansichten/Einsatzdetail.tsx`.
 * Ein leeres Feld wird „—“; bei „Vor Ort“ gibt es niemanden, der transportiert hat.
 */
export function patientenZeilen(e: Einsatz): Patientenzeile[] {
  return (e.patienten ?? []).map((p) => ({
    art: p.art === "transport" ? "Transport" : "Vor Ort",
    durch: p.art === "transport" ? p.durch || "—" : "",
    einsatznummer: p.einsatznummer || "—",
  }));
}

export interface Umsystemzeile { system: string; titel: string; einsatz: string }

/** Anzeigenamen bekannter Umsysteme; eine unbekannte Kennung erscheint, wie sie ist. */
const UMSYSTEM_NAMEN: Record<string, string> = { suchlage: "Suchlage" };

/**
 * Die verknüpften Umsysteme (IDA-359) als Text, leer ohne `umsysteme`. Geteilt mit
 * `ansichten/Einsatzdetail.tsx`. Ohne Namen trägt die Zeile die Einsatz-ID des Umsystems.
 */
export function umsystemZeilen(e: Einsatz): Umsystemzeile[] {
  return (e.umsysteme ?? []).map((u) => ({
    system: u.system,
    titel: Object.hasOwn(UMSYSTEM_NAMEN, u.system) ? UMSYSTEM_NAMEN[u.system] : u.system,
    einsatz: u.name || `Einsatz ${u.id}`,
  }));
}

export interface Berichtsdaten {
  /** Spec §12: Das Berichtsblatt trägt dann „TESTDATEN" im Kopf. */
  test: boolean;
  nummer: string;
  /** Einsatznummer der Leitstelle (IDA-284); `null`, wenn der Einsatz keine trägt. */
  leitstellenNummer: string | null;
  block: number;
  stichwort: string;
  ort: string;
  objekt: string;
  beginn: string;
  ende: string;
  dauer: string;
  vorOrt: number;
  transport: number;
  gesamt: number;
  patienten: Patientenzeile[];
  umsysteme: Umsystemzeile[];
  fahrzeuge: { typ: string; ruf: string; besatzung: string }[];
  personal: { name: string; quali: string; fahrzeug: string }[];
  notizen: string;
  hash: string;
  prev: string;
  versiegelt: string;
  pruefung: string;
  quelle: string;
  erzeugt: string;
}

/**
 * Das Modell für das Berichtsblatt (`Einsatzbericht.dc.html`). Rein: Zeitzone und
 * „erzeugt" kommen vom Aufrufer, damit Tests nicht an der Uhr hängen.
 */
export function bericht(
  block: Block, e: Einsatz,
  extra: { pruefung: string; quelle: string; erzeugt: string; zeitzone: string },
): Berichtsdaten {
  const fahrzeuge = e.fahrzeuge.map((f) => {
    const n = e.personal.filter((p) => p.fahrzeugId === f.id).length;
    return { typ: f.typ, ruf: f.ruf, besatzung: n > 0 ? String(n) : "—" };
  });
  const personal = e.personal.map((p) => {
    const f = e.fahrzeuge.find((x) => x.id === p.fahrzeugId);
    return { name: p.name, quali: p.quali, fahrzeug: f ? `${f.typ} ${f.kennung}` : "—" };
  });
  return {
    test: block.kopf.umgebung === "test",
    nummer: e.nummer,
    leitstellenNummer: e.leitstellenNummer || null,
    block: block.kopf.block,
    stichwort: e.stichwort,
    ...einsatzTexte(e, extra.zeitzone),
    vorOrt: e.vorOrt,
    transport: e.transport,
    gesamt: e.vorOrt + e.transport,
    patienten: patientenZeilen(e),
    umsysteme: umsystemZeilen(e),
    fahrzeuge,
    personal,
    notizen: e.notizen,
    hash: block.hash,
    prev: block.kopf.prev,
    versiegelt: zeitpunktText(block.kopf.versiegelt, extra.zeitzone),
    pruefung: extra.pruefung,
    quelle: extra.quelle,
    erzeugt: extra.erzeugt,
  };
}
