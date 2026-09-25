/**
 * Texte zur automatischen Sicherung (Spec §4.5, Stufe 6, Entscheidung 3) für die Karte
 * „Einstellungen“ der Verwaltung. Die Stufe rechnet Rust (`src-tauri/kern/src/sicherung.rs`,
 * `stufe`); hier wird sie nur in Worte gefasst, die 7-Tage-Regel also nicht ein zweites Mal
 * gerechnet. Keine React-Abhängigkeit, kein `invoke`, die Zeitzone kommt in jeden Aufruf.
 *
 * `letzte` heißt nach der Regel des Abgleich-Threads „zuletzt als aktuell bestätigt“: Auch eine
 * Runde, die nichts schreiben musste, erneuert den Zeitpunkt (`sicherung.rs`, `sichere_jetzt`).
 */
import type { Sicherungsstand, Sicherungsstufe } from "../typen";

const ZEITPUNKT_MUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const ROT_GRUND = "Seit 7 Tagen oder länger keine gelungene Sicherung.";

export interface Sicherungsanzeige {
  ton: Sicherungsstufe;
  /** Die Hauptzeile, etwa „Letzte Sicherung: 24.09.2026, 18:42 Uhr — Ordner nicht erreichbar“. */
  text: string;
  /** Die Meldung aus Rust wörtlich, sonst bei Rot der Grund; `null`, wenn nichts dazu zu sagen ist. */
  zusatz: string | null;
}

/**
 * „2026-09-24T18:42:00+02:00“ → „24.09.2026, 18:42 Uhr“, in `zeitzone`. Anders als
 * `zeitpunktText` aus `@kern/zeit` mit zweistelligem Tag und Monat (Spec §4.5). Wirft nie: Ein
 * unlesbarer Wert erscheint, wie Rust ihn lieferte, denn die Anzeige einer Sicherung soll die
 * Verwaltung nicht in die Fehlergrenze schicken.
 */
export function sicherungszeitText(zeitpunkt: string, zeitzone: string): string {
  const datum = new Date(zeitpunkt);
  if (!ZEITPUNKT_MUSTER.test(zeitpunkt) || Number.isNaN(datum.getTime())) return zeitpunkt;
  try {
    const teile = new Intl.DateTimeFormat("de-DE", {
      timeZone: zeitzone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(datum);
    const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
    return `${t.day}.${t.month}.${t.year}, ${t.hour}:${t.minute} Uhr`;
  } catch {
    return zeitpunkt;
  }
}

/**
 * Hauptzeile und Zusatz je Stufe:
 * - `aus` (Testbetrieb): „Im Testbetrieb ist die automatische Sicherung aus.“
 * - ohne Ordner: „Noch kein Sicherungsordner gewählt“.
 * - nach einem Fehlschlag: „Letzte Sicherung: … — Ordner nicht erreichbar“ bzw. „Noch keine
 *   Sicherung — Ordner nicht erreichbar“, dazu der Text aus Rust wörtlich. Er nennt den Grund,
 *   auch wenn es statt eines fehlenden Ordners eine längere Kette im Ordner ist.
 * - sonst „Letzte Sicherung: …“ bzw. „Noch keine Sicherung“.
 * Bei `rot` ohne Meldung aus Rust ist der Zusatz der Grund der Farbe.
 */
export function sicherungsanzeige(stand: Sicherungsstand, zeitzone: string): Sicherungsanzeige {
  const ton = stand.stufe;
  if (ton === "aus") return { ton, text: "Im Testbetrieb ist die automatische Sicherung aus.", zusatz: null };
  const rotGrund = ton === "rot" ? ROT_GRUND : null;
  if (!stand.ordner) return { ton, text: "Noch kein Sicherungsordner gewählt", zusatz: rotGrund };
  const letzte = stand.letzte ? `Letzte Sicherung: ${sicherungszeitText(stand.letzte, zeitzone)}` : "Noch keine Sicherung";
  if (stand.fehler) return { ton, text: `${letzte} — Ordner nicht erreichbar`, zusatz: stand.fehler };
  return { ton, text: letzte, zusatz: rotGrund };
}
