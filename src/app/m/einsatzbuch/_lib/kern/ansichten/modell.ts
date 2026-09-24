import type { Block } from "../format";
import type { Kettenergebnis } from "../kette";

/**
 * Anzeigemodell der geteilten Ansichten (Reader, Verwaltung, Desktop-App). Rein und ohne
 * React: Texte sind wörtlich die der Vorlage (`Einsatzbuch Reader.dc.html`, `renderVals`;
 * Verwaltung aus `Einsatzbuch v2.dc.html`).
 */
export type Kettenzustand =
  | { art: "ungeprueft" }
  | { art: "laeuft"; i: number; n: number }
  | { art: "intakt"; vollstaendig: true; zeit?: string }
  | { art: "intakt"; vollstaendig: false; abBlock: number; prev: string }
  | { art: "gebrochen"; block: number; grund: string };

export const kurz = (hash: string) => hash.slice(0, 8);

/** `bloecke` aufsteigend, wie `pruefeKette` sie bekommen hat — der erste nennt den fehlenden Vorgänger. */
export function kettenzustandAus(e: Kettenergebnis, bloecke: readonly Block[]): Kettenzustand {
  if (!e.ok) return { art: "gebrochen", block: e.block, grund: e.grund };
  if (e.vollstaendig || bloecke.length === 0) return { art: "intakt", vollstaendig: true };
  return { art: "intakt", vollstaendig: false, abBlock: bloecke[0].kopf.block, prev: bloecke[0].kopf.prev };
}

export function chipText(z: Kettenzustand): string {
  switch (z.art) {
    case "ungeprueft": return "Noch nicht geprüft";
    case "laeuft": return `Prüfe Block ${z.i} von ${z.n} …`;
    case "gebrochen": return `Gebrochen bei Block ${z.block}`;
    case "intakt": return z.vollstaendig ? (z.zeit ? `Kette intakt · geprüft ${z.zeit} Uhr` : "Kette intakt") : "Ausschnitt intakt";
  }
}

/** Leer, solange nichts geprüft ist — dann gibt es nichts zu erklären. */
export function pruefSatz(z: Kettenzustand): string {
  if (z.art === "gebrochen") return `Block ${z.block}: ${z.grund}. Die Datei wurde nach dem Export verändert oder ist beschädigt.`;
  if (z.art === "intakt" && z.vollstaendig) return "Alle Blöcke passen zu ihrem Fingerabdruck und bauen lückenlos auf dem Anfang der Kette auf.";
  if (z.art === "intakt") return `Ausschnitt ab Block ${z.abBlock}: Die enthaltenen Blöcke passen zusammen. Der Vorgänger #${kurz(z.prev)} ist nicht in der Datei.`;
  return "";
}

export type Chipton = "ok" | "rot" | "grau";

export function chipTon(z: Kettenzustand): Chipton {
  return z.art === "intakt" ? "ok" : z.art === "gebrochen" ? "rot" : "grau";
}

export interface Listeneintrag {
  block: number;
  nummer: string | null;
  stichwort: string | null;
  ort: string | null;
  /** Bereits formatiert („22.8.2026, 04:43 Uhr") — die Liste kennt keine Zeitzone. */
  versiegelt: string;
  hash: string;
  prev: string;
  knoten: "geprueft" | "gebrochen" | "neutral";
  /** v2-Verwaltung: „2 Fahrzeuge · 3 Kräfte · 4 Patienten". */
  meta?: string;
  /** v2-Verwaltung: Sitzung gesperrt — statt des Inhalts steht nur der Chiffretext da. */
  gesperrt?: boolean;
  /** Anschnitt des echten Chiffrats (`block.daten`) für die gesperrte Zeile; fehlt er, steht „verschlüsselt“ da. */
  chiffre?: string;
  /** „Block n lässt sich nicht öffnen“ — steht dann statt Stichwort und Ort. */
  fehler?: string;
}

/** Bis vor die Bruchstelle geprüft, die Bruchstelle gebrochen, danach neutral. */
export function knotenFuer(block: number, z: Kettenzustand): Listeneintrag["knoten"] {
  if (z.art === "gebrochen") return block < z.block ? "geprueft" : block === z.block ? "gebrochen" : "neutral";
  return z.art === "intakt" ? "geprueft" : "neutral";
}
