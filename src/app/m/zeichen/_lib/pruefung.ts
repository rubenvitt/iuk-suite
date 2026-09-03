import { ORDNUNG } from "./kanon";

/*
 * DIE FORMPRUEFUNGEN DER SERVER ACTION (Spec §4.3, §6.6).
 *
 * Sie liegen hier und nicht in `actions.ts`, weil eine Datei mit "use server" nur
 * asynchrone Funktionen exportieren darf — und weil sie so ohne Sitzung pruefbar
 * sind. Kein Katalogimport: `ORDNUNG` ist eine reine Zeichenkettenliste.
 */

/**
 * Obergrenze fuer das gespeicherte SVG. Das Generat traegt 246 fertige Zeichen in
 * 381.541 B — rund 1,5 KB je Zeichen bei Groesse 64. 200.000 Zeichen lassen jede
 * sinnvolle Exportgroesse durch und verhindern, dass die Tabelle als Ablage dient.
 */
export const SVG_MAX_ZEICHEN = 200_000;

const ERLAUBTE_FELDER = new Set<string>(ORDNUNG);

/** Ein Wert der Spec: Text, Zahl, Liste von Texten — oder ein flaches Metrikobjekt. */
function wertFehler(feld: string, wert: unknown, tiefe: number): string | null {
  if (typeof wert === "string" || typeof wert === "number" || typeof wert === "boolean") return null;
  if (Array.isArray(wert)) {
    return wert.every((e) => typeof e === "string")
      ? null
      : `Das Feld „${feld}“ enthält eine Liste, die nicht nur aus Text besteht.`;
  }
  if (typeof wert === "object" && wert !== null) {
    if (tiefe === 0) return `Das Feld „${feld}“ ist zu tief verschachtelt.`;
    for (const [k, v] of Object.entries(wert)) {
      const fehler = wertFehler(`${feld}.${k}`, v, tiefe - 1);
      if (fehler) return fehler;
    }
    return null;
  }
  return `Das Feld „${feld}“ hat einen Wert, der sich nicht speichern lässt.`;
}

/**
 * Prueft die FORM einer Spec, nicht ihre fachliche Gueltigkeit.
 *
 * ⛔ EINE FACHLICHE PRUEFUNG BRAEUCHTE `composeFromCatalog` — und das zoege den
 * Katalog in den Server-Graph (M1: `catalog/dist/src/index.js:23` re-exportiert
 * `fonts.js` mit `fileURLToPath` auf Modulebene, `pnpm build` bricht in der Phase
 * „Collecting page data"). Ein manipuliertes Spec-JSON schaedigt nur die eigene
 * Zeichenliste, und das Markup wird nie als HTML ausgefuehrt (§4.3).
 *
 * Alle Feldnamen muessen aus `ORDNUNG` kommen: `kanonischerSchluessel`
 * serialisiert nur diese Felder, ein fremdes Feld liesse zwei verschiedene
 * Zusammenstellungen auf denselben Schluessel fallen — und „schon gespeichert?"
 * antwortete falsch.
 */
export function specFormFehler(json: string): string | null {
  let gelesen: unknown;
  try {
    gelesen = JSON.parse(json);
  } catch {
    return "Die Zusammenstellung lässt sich nicht lesen.";
  }
  if (typeof gelesen !== "object" || gelesen === null || Array.isArray(gelesen)) {
    return "Die Zusammenstellung hat nicht die erwartete Form.";
  }
  const eintraege = Object.entries(gelesen as Record<string, unknown>);
  if (typeof (gelesen as { kind?: unknown }).kind !== "string") {
    return "Es fehlt die Grundzeichenart.";
  }
  for (const [feld, wert] of eintraege) {
    if (!ERLAUBTE_FELDER.has(feld)) return `Unbekanntes Feld „${feld}“ in der Zusammenstellung.`;
    const fehler = wertFehler(feld, wert, 2);
    if (fehler) return fehler;
  }
  return null;
}

/**
 * Prueft die Form des gelieferten SVG. HYGIENE, NICHT DER RIEGEL: der Riegel ist
 * das `<img src="data:image/svg+xml;base64,…">` auf /meine (Spec §4.3).
 */
export function svgFormFehler(svg: string): string | null {
  const t = svg.trim();
  if (!t.startsWith("<svg") || !t.endsWith("</svg>")) {
    return "Das Bild hat nicht die Form eines SVG.";
  }
  if (t.length > SVG_MAX_ZEICHEN) return "Das Bild ist zu groß zum Speichern.";
  if (/<script/i.test(t)) return "Das Bild enthält ein Script-Element.";
  // `\son…=` mit optionalem Leerraum: `onload = "…"` ist dasselbe Ereignis.
  if (/\son[a-z]+\s*=/i.test(t)) return "Das Bild enthält ein Ereignis-Attribut.";
  return null;
}

/**
 * Welche Rueckfrage vor dem Schreiben noch offen ist — oder keine.
 *
 * BEIDE FAELLE FRAGEN ZURUECK, STATT ZU ENTSCHEIDEN (Spec §6.6): gleicher Name →
 * „Überschreiben oder anders benennen?", gleiche Zusammenstellung → „Trotzdem
 * zusätzlich sichern?". Nichts wird still ueberschrieben.
 *
 * Die Namensfrage kommt zuerst, weil ihre Antwort die andere erledigt: wer
 * ueberschreibt, legt nichts Zweites an.
 */
export function konfliktFrage(
  namenVergeben: boolean,
  gleicheZusammenstellungAls: string | null,
  bestaetigung: string,
): "name" | "zusammenstellung" | null {
  if (namenVergeben && bestaetigung !== "ueberschreiben") return "name";
  if (gleicheZusammenstellungAls !== null && bestaetigung !== "zusaetzlich") {
    return "zusammenstellung";
  }
  return null;
}
