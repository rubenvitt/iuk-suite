import type { Taste } from "../editor/tasten";

/**
 * TASTATUR DER GLIEDERUNG (Spec §6.5; Umsetzungsplan Phase 3, Entscheidungen 5–10) als reine Abbildung.
 * Sie gilt nur im Titelfeld einer Zeile. Strg/Cmd+Z behandelt die Gliederung vorher über
 * `globalerBefehl(…, false)` (Entscheidung 10). Rücktaste/Entf nur auf leerem Titel — sonst löschen sie
 * Zeichen. Während einer IME-Komposition bestätigt Enter die Komposition, nicht die Zeile. Gehaltene
 * Tasten (`repeat`) löschen und legen nichts an (Entscheidung 8). Alt+V/Alt+Z über `code`: Option+Taste
 * liefert auf macOS ein Sonderzeichen als `key` (Entscheidung 10); Alt+E/Alt+F bewusst nicht.
 */
export type GliederungsBefehl =
  | { art: "neu" } | { art: "neuLeer" } | { art: "einruecken" } | { art: "ausruecken" }
  | { art: "verschiebe"; richtung: "hoch" | "runter" } | { art: "wandere"; richtung: "hoch" | "runter" }
  | { art: "loeschen"; richtung: "hoch" | "runter" } | { art: "verlassen" } | { art: "details" }
  | { art: "verbindung" } | { art: "zeichen" };
export type GliederungsTaste = Taste & { isComposing?: boolean; repeat?: boolean; code?: string };

export function gliederungsBefehl(t: GliederungsTaste, titelLeer: boolean): GliederungsBefehl | null {
  if (t.isComposing) return null;
  if (t.ctrlKey || t.metaKey) return t.key === "Enter" && !t.shiftKey && !t.altKey ? { art: "details" } : null;
  if (t.key === "Tab" && !t.altKey) return t.shiftKey ? { art: "ausruecken" } : { art: "einruecken" };
  if (t.shiftKey) return null;
  if (t.altKey) {
    if (t.key === "ArrowUp") return { art: "verschiebe", richtung: "hoch" };
    if (t.key === "ArrowDown") return { art: "verschiebe", richtung: "runter" };
    if (t.code === "KeyV") return { art: "verbindung" };
    if (t.code === "KeyZ") return { art: "zeichen" };
    return null;
  }
  switch (t.key) {
    case "Enter": return t.repeat ? null : titelLeer ? { art: "neuLeer" } : { art: "neu" };
    case "ArrowUp": return { art: "wandere", richtung: "hoch" };
    case "ArrowDown": return { art: "wandere", richtung: "runter" };
    case "Backspace": return titelLeer && !t.repeat ? { art: "loeschen", richtung: "hoch" } : null;
    case "Delete": return titelLeer && !t.repeat ? { art: "loeschen", richtung: "runter" } : null;
    case "Escape": return { art: "verlassen" };
    case "F2": return { art: "details" };
    default: return null;
  }
}
