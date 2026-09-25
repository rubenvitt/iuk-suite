/**
 * Die Verwaltung am Rechner (Spec §4.7): Blöcke aus Rust holen, die Kette lokal mit dem geteilten
 * Kern prüfen, die Inhaltsschlüssel von der Suite freigeben lassen (Rust schickt in 200er-Paketen,
 * `suite::gib_frei`) und jeden Block NUR im Speicher öffnen (`oeffneBlock`).
 *
 * Verwerfen heißt (Review Focus 5): Kein Klartext und kein CEK bleibt im React-Zustand oder in
 * einer Ref. CEKs stehen nie im Zustand — sie leben nur als lokale Variable im Ladelauf und werden
 * nach dem Öffnen mit Nullen überschrieben. Ein Generationszähler verwirft jedes Ergebnis, das
 * nach `verwerfen()` oder nach dem Deaktivieren eintrifft, statt einen verworfenen Stand wieder
 * aufzumachen.
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { kettenzustandAus, type Kettenzustand } from "@kern/ansichten/modell";
import type { Ankerangabe } from "@kern/ansichten/Kettenpruefung";
import { oeffneBlock } from "@kern/block";
import { ausBase64 } from "@kern/bytes";
import type { Block } from "@kern/format";
import { pruefeKette } from "@kern/kette";

import { befehle } from "../befehle";
import type { Ankerstand } from "../typen";
import type { Offen } from "./modell";

export type Verwaltungszustand =
  | { art: "laedt" }
  | {
      art: "offen";
      offen: Offen[];
      zu: Block[];
      /** Die Freigabe ist gescheitert — wörtlich die Meldung aus Rust; dann sind alle Blöcke `zu`. */
      fehler: string | null;
      pruefung: Kettenzustand | null;
      /** Der zuletzt von der Suite bestätigte Anker, sobald „Kette prüfen“ einen bekam. */
      anker: Ankerangabe | null;
      /** Rohstand des letzten Ankerabgleichs (bestätigt bis, offline, Abweichung). */
      ankerstand: Ankerstand | null;
      /** Der Ankerabgleich selbst schlug fehl — wörtlich die Meldung aus Rust. */
      ankerFehler: string | null;
    }
  | { art: "fehler"; meldung: string; zu: Block[] };

const LAEDT: Verwaltungszustand = { art: "laedt" };

/** Tauri liefert Fehler als Zeichenkette (`Result<_, String>`), alles andere wird lesbar gemacht. */
function fehlerText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

async function pruefe(bloecke: readonly Block[]): Promise<Kettenzustand> {
  return kettenzustandAus(await pruefeKette(bloecke), bloecke);
}

/** Öffnet die Blöcke mit den freigegebenen CEKs; wer keinen CEK hat oder nicht aufgeht, bleibt zu. */
async function oeffne(bloecke: readonly Block[], ceks: ReadonlyMap<number, string>): Promise<{ offen: Offen[]; zu: Block[] }> {
  const offen: Offen[] = [];
  const zu: Block[] = [];
  for (const block of bloecke) {
    const text = ceks.get(block.kopf.block);
    if (text === undefined) {
      zu.push(block);
      continue;
    }
    let cek: Uint8Array | null = null;
    try {
      const bytes = ausBase64(text);
      cek = bytes;
      offen.push({ block, einsatz: await oeffneBlock(block, bytes) });
    } catch {
      zu.push(block);
    } finally {
      cek?.fill(0);
    }
  }
  return { offen, zu };
}

function ankerAus(stand: Ankerstand): Ankerangabe | null {
  if (stand.bestaetigtBis <= 0 || stand.hash === null || stand.gemeldetAm === null) return null;
  return { block: stand.bestaetigtBis, hash: stand.hash, gemeldetAm: stand.gemeldetAm };
}

export function useVerwaltung(aktiv: boolean): {
  zustand: Verwaltungszustand;
  kettePruefen: () => Promise<void>;
  verwerfen: () => void;
  neuLaden: () => void;
} {
  const [zustand, setZustand] = useState<Verwaltungszustand>(LAEDT);
  /** Generation des Ladelaufs; ein Objekt, damit der Aufräumer dasselbe Zählwerk hochzählt. */
  const laufRef = useRef({ nr: 0 });
  /** Zählt „neu laden“; als Abhängigkeit des Ladeeffekts startet jede Erhöhung einen frischen Lauf. */
  const [ladung, setLadung] = useState(0);

  const lade = useEffectEvent(async (nr: number) => {
    const gilt = () => nr === laufRef.current.nr;
    let bloecke: Block[];
    try {
      bloecke = await befehle.bloecke();
    } catch (e) {
      if (gilt()) setZustand({ art: "fehler", meldung: fehlerText(e), zu: [] });
      return;
    }
    if (!gilt()) return;
    const pruefung = await pruefe(bloecke);
    if (!gilt()) return;
    const rest = { pruefung, anker: null, ankerstand: null, ankerFehler: null };
    let ceks: Map<number, string>;
    try {
      ceks = new Map((await befehle.schluesselFreigeben()).map((p) => [p.block, p.cek]));
    } catch (e) {
      if (gilt()) setZustand({ art: "offen", offen: [], zu: bloecke, fehler: fehlerText(e), ...rest });
      return;
    }
    if (!gilt()) return;
    const { offen, zu } = await oeffne(bloecke, ceks);
    ceks.clear();
    if (gilt()) setZustand({ art: "offen", offen, zu, fehler: null, ...rest });
  });

  useEffect(() => {
    if (!aktiv) return;
    const lauf = laufRef.current;
    void lade(++lauf.nr);
    return () => {
      // Deaktiviert (Sperre, Abmelden, Seite verlassen) oder neu geladen: laufende Ergebnisse
      // gelten nicht mehr, und der Klartext geht mit.
      lauf.nr++;
      setZustand(LAEDT);
    };
  }, [aktiv, ladung]);

  /** Verwirft Klartext und laufende Ergebnisse sofort; neu geladen wird erst beim nächsten Aktivieren. */
  function verwerfen() {
    laufRef.current.nr++;
    setZustand(LAEDT);
  }

  /**
   * Lädt Blöcke und Schlüssel neu, etwa nach einer Wiederherstellung: über `ladung` im Effekt,
   * also nur, solange aktiv (ein gesperrter Stand bleibt zu). Der Aufräumer des vorigen Laufs
   * erklärt dessen Ergebnisse für ungültig.
   */
  function neuLaden() {
    setLadung((n) => n + 1);
  }

  /** „Kette prüfen“ (Spec §4.6): die gespeicherte Kette lokal und, wenn online, gegen den Anker der Suite. */
  async function kettePruefen() {
    const nr = laufRef.current.nr;
    const gilt = () => nr === laufRef.current.nr;
    let pruefung: Kettenzustand;
    try {
      pruefung = await pruefe(await befehle.bloecke());
    } catch (e) {
      if (gilt()) setZustand((z) => (z.art === "offen" ? { ...z, ankerFehler: fehlerText(e) } : z));
      return;
    }
    if (!gilt()) return;
    setZustand((z) => (z.art === "offen" ? { ...z, pruefung } : z));
    let stand: Ankerstand;
    try {
      stand = await befehle.ankerAbgleichen();
    } catch (e) {
      if (gilt()) setZustand((z) => (z.art === "offen" ? { ...z, anker: null, ankerstand: null, ankerFehler: fehlerText(e) } : z));
      return;
    }
    if (gilt()) setZustand((z) => (z.art === "offen" ? { ...z, anker: ankerAus(stand), ankerstand: stand, ankerFehler: null } : z));
  }

  return { zustand, kettePruefen, verwerfen, neuLaden };
}
