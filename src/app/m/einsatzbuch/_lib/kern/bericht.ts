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

export interface Berichtsdaten {
  /** Spec §12: Das Berichtsblatt trägt dann „TESTDATEN" im Kopf. */
  test: boolean;
  nummer: string;
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
    block: block.kopf.block,
    stichwort: e.stichwort,
    ...einsatzTexte(e, extra.zeitzone),
    vorOrt: e.vorOrt,
    transport: e.transport,
    gesamt: e.vorOrt + e.transport,
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
