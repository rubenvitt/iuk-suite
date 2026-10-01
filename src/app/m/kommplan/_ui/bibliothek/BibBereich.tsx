"use client";

import { useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, type InputRef, type TableProps } from "antd";
import { Kartentabelle, type KartentabelleProps } from "@/core/tabelle";
import { passt } from "../../_lib/bibliothek/typen";
import { NETZFEHLER, type FeldFehler } from "../../_lib/ergebnis";
import { feldHilfe, useFokusNachFlyin } from "./BibFlyin";

/**
 * DER RAHMEN EINES BIBLIOTHEKSBEREICHS (Entscheidung 11) — Stellen, Einheiten und Verbindungen teilen ihn
 * (Abnahme kommplan: drei fast wörtliche Kopien). Suche, „Neue …“, Meldung, Kartentabelle und die Rückrufe ans
 * Flyin samt `runde` für „Speichern und nächste“. Was je Bereich anders ist, kommt als Text, Spalten und Kinder.
 */
export interface BibBereichZustand<T extends { id: string }> {
  suche: string;
  oeffne(eintrag: T | "neu"): void;
  meldung(text: string | null): void;
  /** Für das Flyin: `key` montiert je Eintrag und je Runde ein frisches Formular. */
  flyin: { key: string; eintrag: T | "neu" | null; onSchliessen(): void; onFertig(meldung: string): void; onWeiter(meldung: string): void };
}

export function BibBereich<T extends { id: string }>({ name, mehrzahl, neu, leer, eintraege, sucheIn, spalten, karte, werkzeuge, children }: {
  /** „Stellen der Bibliothek“ — Name des Bereichs; `mehrzahl` für Suche und Tabelle („Stellen“). */
  name: string; mehrzahl: string; neu: string; leer: { nichts: string; gefiltert: string };
  eintraege: T[]; sucheIn(e: T): (string | null)[];
  spalten(z: BibBereichZustand<T>): NonNullable<TableProps<T>["columns"]>;
  karte: KartentabelleProps<T>["karte"];
  /** Weitere Knöpfe hinter „Neue …“ (Einheiten: Liste einfügen, CSV). */
  werkzeuge?: (z: BibBereichZustand<T>) => ReactNode;
  /** Das Flyin und was der Bereich sonst noch öffnet. */
  children(z: BibBereichZustand<T>): ReactNode;
}) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<T | "neu" | null>(null);
  const neuKnopf = useFokusNachFlyin(offen !== null);
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Zählt „Speichern und nächste“: jede Runde montiert ein leeres Formular neu (Fokus wieder im ersten Feld). */
  const [runde, setRunde] = useState(0);
  const z: BibBereichZustand<T> = {
    suche, oeffne: setOffen, meldung: setMeldung,
    flyin: {
      key: offen === null ? "zu" : offen === "neu" ? `neu:${runde}` : offen.id, eintrag: offen,
      onSchliessen: () => setOffen(null),
      onFertig: (text) => { setOffen(null); setMeldung(text); router.refresh(); },
      onWeiter: (text) => { setMeldung(text); setRunde((n) => n + 1); router.refresh(); },
    },
  };
  const sichtbar = eintraege.filter((e) => passt(suche, sucheIn(e)));
  return (
    <section aria-label={name} className="kp-bib-bereich">
      <div className="kp-bib-werkzeuge">
        <Input className="kp-bib-suche" aria-label={`${mehrzahl} suchen`} placeholder="Suchen" allowClear value={suche} onChange={(e) => setSuche(e.target.value)} />
        <Button ref={neuKnopf} type="primary" onClick={() => setOffen("neu")}>{neu}</Button>
        {werkzeuge?.(z)}
      </div>
      {meldung ? <p className="kp-hinweis" role="status">{meldung}</p> : null}
      <Kartentabelle<T> aria-label={mehrzahl} rowKey="id" dataSource={sichtbar} columns={spalten(z)}
        leer={{ ...leer, aktiv: suche.trim() !== "" }} karte={karte} />
      {children(z)}
    </section>
  );
}

/**
 * DER ZUSTAND EINES BIBLIOTHEKS-FLYINS: Fehler, Feldfehler, „läuft“, Fokus ins erste Feld (beim Öffnen; nach
 * „Speichern und nächste“ montiert das Formular neu) und `sende` für Speichern und Löschen — ein `.catch` mit
 * demselben Netztext für alle. Den Ref des ersten Felds hält das Flyin selbst (React liest Refs nicht im Rendern).
 */
export function useBibFormular(eintrag: unknown, erstesFeld: RefObject<InputRef | null>) {
  const basis = useId();
  useEffect(() => { if (eintrag !== null) erstesFeld.current?.focus(); }, [eintrag, erstesFeld]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  type Antwort = { ok: true } | { ok: false; fehler: string; feldFehler?: FeldFehler };
  async function sende<R extends Antwort>(aufruf: () => Promise<R>): Promise<Extract<R, { ok: true }> | null> {
    setLaeuft(true);
    const r: Antwort = await aufruf().catch((): Antwort => ({ ok: false, fehler: NETZFEHLER }));
    setLaeuft(false);
    if (r.ok) return r as Extract<R, { ok: true }>;
    setFehler(r.fehler);
    setFeldFehler(r.feldFehler ?? {});
    return null;
  }
  return {
    basis, fehler, laeuft, sende,
    f: (name: string) => feldHilfe(basis, feldFehler, name),
    onGeoeffnet: () => erstesFeld.current?.focus(),
  };
}
