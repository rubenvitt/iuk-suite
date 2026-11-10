import type { EhrlichAntwortweg, EhrlichStatus } from "../../_db/schema";

/** Die festen Themen für „Worum geht es?" (Entscheidung 2026-11-01: ein Kasten, feste Themen). */
export const EHRLICH_THEMEN = ["Dienstabend", "Einsatz & Dienst", "Miteinander", "Ausstattung", "Sonstiges"] as const;

export const STATUS_WORT: Record<EhrlichStatus, string> = {
  neu: "Neu",
  bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
};

export const ANTWORTWEG_WORT: Record<EhrlichAntwortweg, string> = {
  keine: "keine Antwort gewünscht",
  code: "möchte Antwort per Abholcode",
  name: "möchte, dass sich jemand meldet",
};

export const TEXT_MAX = 2000;
export const NAME_MAX = 120;
export const KONTAKT_MAX = 200;

/**
 * Erledigte Mitteilungen werden nach dieser Frist gelöscht, samt Gespräch und Notizen
 * (Entscheidung an IDA-314, 2026-11-03: 12 Monate, wie an IDA-309 vorgeschlagen).
 */
export const LOESCHFRIST_MONATE = 12;

/** Das Honigtopf-Feld des Einwurfs (IDA-340): unsichtbar, ein Mensch lässt es leer. */
export const HONIGTOPF_FELD = "webseite";
