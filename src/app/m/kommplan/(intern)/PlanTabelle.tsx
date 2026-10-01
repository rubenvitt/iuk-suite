"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Drawer, Dropdown, type InputRef, type MenuProps, type TableProps } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { Kartentabelle, nachText } from "@/core/tabelle";
import { archiviereAction, dupliziereAction, speichereAlsVorlageAction, stelleWiederHerAction } from "../_actions/verwaltung";
import type { EinfachErgebnis } from "../_lib/ergebnis";
import type { Liste, Listenzeile } from "../_lib/plaene";
import type { VorlageWahl } from "../_lib/planverwaltung";
import { NeuerPlanFormular } from "./NeuerPlan";

const NAME: Record<Liste, string> = { plaene: "Pläne", vorlagen: "Vorlagen", archiv: "Archivierte Pläne" };
const LEER: Record<Liste, string> = {
  plaene: "Noch keine Pläne.",
  vorlagen: "Noch keine Vorlagen. „Als Vorlage speichern“ im Menü eines Plans legt eine Kopie als Vorlage an.",
  archiv: "Das Archiv ist leer.",
};
type Aktion = "duplizieren" | "vorlage" | "vorlageArchivieren" | "archivieren" | "wiederherstellen" | "ausVorlage";
const MENUE: Record<Liste, { key: Aktion; label: string }[]> = {
  plaene: [{ key: "duplizieren", label: "Duplizieren" }, { key: "vorlage", label: "Als Vorlage speichern" }, { key: "archivieren", label: "Archivieren" }],
  vorlagen: [{ key: "ausVorlage", label: "Neu aus Vorlage" }, { key: "vorlageArchivieren", label: "Vorlage archivieren" }],
  archiv: [{ key: "wiederherstellen", label: "Wiederherstellen" }],
};
const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";
/**
 * `fokus`: nach einer Aktion aus dem Menü — die Zeile ist weg, der Fokus kommt in den Hinweis (sonst fiel er auf body).
 * `oeffnen`: die ID einer eben angelegten Vorlage — „Vorlage öffnen“ (Phase 5, Entscheidung 16) — oder der schon
 * vorhandenen gleichen Titels; dann bietet `trotzdem` „Trotzdem anlegen“ für die Zeile (Review Phase 5).
 */
interface Hinweis { text: string; zurueck?: string; oeffnen?: string; trotzdem?: Listenzeile; fokus?: boolean }

/**
 * DIE DREI LISTEN DER PLANLISTE (Spec §6.1, §6.7, §8.3; Umsetzungsplan Phase 4, Entscheidungen 7–10).
 * Client-Insel, weil die Spalten render-Funktionen tragen (Falle 9); Titel als Zeichenketten (Falle 17);
 * `Kartentabelle` (docs/design/README.md „Mobil"). Das Aktionen-Menü erscheint nur bei `darfBearbeiten` —
 * dasselbe Prädikat wie jede Action. Nach einer Aktion `router.refresh()`; Duplizieren führt in den Editor.
 */
export function PlanTabelle({ zeilen, liste, darfBearbeiten, vorlagen = [], heute }: { zeilen: Listenzeile[]; liste: Liste; darfBearbeiten: boolean; vorlagen?: VorlageWahl[]; heute?: string }) {
  const router = useRouter();
  const [hinweis, setHinweis] = useState<Hinweis | null>(null);
  const [ausVorlage, setAusVorlage] = useState<string | null>(null);
  /** ID der Zeile, deren Aktion gerade läuft: ihr „Aktionen" lädt, alle anderen sind gesperrt (kein zweites Duplikat). */
  const [laeuft, setLaeuft] = useState<string | null>(null);
  /** Dieselbe Sperre synchron: ein Menü im Portal kann noch den Rückruf des vorigen Renders tragen (Doppelklick). */
  const sperre = useRef<string | null>(null);
  const setzeLauf = (id: string | null) => { sperre.current = id; setLaeuft(id); };
  const hinweisRef = useRef<HTMLParagraphElement>(null);
  const zurueckRef = useRef<HTMLButtonElement>(null);
  const oeffnenRef = useRef<HTMLAnchorElement>(null);
  const titelRef = useRef<InputRef>(null);
  // Nach Archivieren auf „Rückgängig“, nach „Als Vorlage speichern“ auf „Vorlage öffnen“, sonst auf die Meldung selbst (Review Phase 4).
  useEffect(() => { if (hinweis?.fokus) (zurueckRef.current ?? oeffnenRef.current ?? hinweisRef.current)?.focus(); }, [hinweis]);

  async function fuehreAus(z: Listenzeile, a: Aktion, trotzdem = false) {
    if (a === "ausVorlage") { setAusVorlage(z.id); return; }
    if (sperre.current !== null) return;
    setzeLauf(z.id);
    if (a === "duplizieren") {
      const r = await dupliziereAction(z.id).catch(() => ({ ok: false as const, fehler: NETZ, feldFehler: {} }));
      // Bei Erfolg bleibt die Zeile „laufend", bis der Editor der Kopie steht — sonst wäre ein zweiter Klick frei.
      if (r.ok) { router.push(`/p/${r.id}?kopie=${r.titel}`); return; }
      setzeLauf(null);
      setHinweis({ text: r.fehler });
      return;
    }
    let neueVorlage: string | undefined;
    let vorhanden: string | undefined;
    const lauf: Record<Exclude<Aktion, "ausVorlage" | "duplizieren">, () => Promise<EinfachErgebnis>> = {
      vorlage: () => speichereAlsVorlageAction(z.id, trotzdem).then((r): EinfachErgebnis => {
        if (!r.ok) { if ("vorhanden" in r) vorhanden = r.vorhanden; return { ok: false, fehler: r.fehler }; }
        neueVorlage = r.id;
        return { ok: true };
      }),
      vorlageArchivieren: () => archiviereAction(z.id),
      archivieren: () => archiviereAction(z.id),
      wiederherstellen: () => stelleWiederHerAction(z.id),
    };
    const r = await lauf[a]().catch((): EinfachErgebnis => ({ ok: false, fehler: NETZ }));
    setzeLauf(null);
    // Gleicher Titel schon als Vorlage: nichts angelegt — „Vorlage öffnen“ (die vorhandene) oder „Trotzdem anlegen“.
    if (!r.ok) { setHinweis(vorhanden ? { text: r.fehler, oeffnen: vorhanden, trotzdem: z, fokus: true } : { text: r.fehler, fokus: true }); return; }
    const text = {
      vorlage: `Vorlage „${z.titel}“ angelegt — sie steht unter „Vorlagen“.`,
      vorlageArchivieren: `Vorlage „${z.titel}“ archiviert.`,
      archivieren: `„${z.titel}“ archiviert.`,
      wiederherstellen: z.vorlage ? `„${z.titel}“ wiederhergestellt — sie steht wieder unter „Vorlagen“.` : `„${z.titel}“ wiederhergestellt.`,
    }[a];
    setHinweis({ text, zurueck: a === "archivieren" || a === "vorlageArchivieren" ? z.id : undefined, oeffnen: neueVorlage, fokus: true });
    router.refresh();
  }
  /** „Rückgängig" nach dem Archivieren — unter derselben Sperre wie das Menü: ein Doppelklick schickte sonst eine zweite
   *  Wiederherstellung, die keinen archivierten Plan mehr fände und den Erfolg mit „gibt es nicht mehr" überschriebe. */
  async function zurueck(id: string) {
    if (sperre.current !== null) return;
    setzeLauf(id);
    const r = await stelleWiederHerAction(id).catch((): EinfachErgebnis => ({ ok: false, fehler: NETZ }));
    setzeLauf(null);
    setHinweis(r.ok ? { text: "Wiederhergestellt.", fokus: true } : { text: r.fehler, fokus: true });
    if (r.ok) router.refresh();
  }

  const spalten: NonNullable<TableProps<Listenzeile>["columns"]> = [
    { key: "titel", title: "Titel", dataIndex: "titel", sorter: nachText<Listenzeile>((z) => z.titel),
      render: (_: unknown, z: Listenzeile) => <Link href={`/p/${z.id}`}>{z.titel}</Link> },
    { key: "kennzeichen", title: "Kennzeichen", render: (_: unknown, z: Listenzeile) => (
      <span className="kp-chips">
        {z.lesbar ? null : <span className="kp-chip kp-chip-hinweis">nicht lesbar</span>}
        {liste === "archiv" && z.vorlage ? <span className="kp-chip">Vorlage</span> : null}
      </span>
    ) },
    { key: "typ", title: "Art", dataIndex: "typ" },
    { key: "datum", title: "Datum", dataIndex: "datum", render: (d: string | null) => d ?? "—" },
    liste === "archiv"
      ? { key: "archiviert", title: "Archiviert", dataIndex: "archiviert", render: (d: string | null) => d ?? "—" }
      : { key: "stand", title: "Stand", dataIndex: "stand" },
    ...(darfBearbeiten ? [{
      key: "aktionen", title: "Aktionen", render: (_: unknown, z: Listenzeile) => (
        <Dropdown trigger={["click"]} menu={{
          items: MENUE[liste].map((m) => ({ key: m.key, label: m.label })) as MenuProps["items"],
          onClick: ({ key }) => void fuehreAus(z, key as Aktion),
        }}>
          <Button aria-label={`Aktionen für ${z.titel}`} loading={laeuft === z.id} disabled={laeuft !== null && laeuft !== z.id}>Aktionen</Button>
        </Dropdown>
      ),
    }] : []),
  ];
  const vorlage = vorlagen.find((v) => v.id === ausVorlage);
  return (
    <>
      {hinweis ? (
        <p ref={hinweisRef} className="kp-listenhinweis" role="status" tabIndex={-1}>
          {hinweis.text}
          {hinweis.zurueck ? <Button ref={zurueckRef} onClick={() => void zurueck(hinweis.zurueck!)} loading={laeuft === hinweis.zurueck}>Rückgängig</Button> : null}
          {hinweis.oeffnen ? <Button ref={oeffnenRef} href={`/p/${hinweis.oeffnen}`}>Vorlage öffnen</Button> : null}
          {hinweis.trotzdem ? <Button onClick={() => void fuehreAus(hinweis.trotzdem!, "vorlage", true)} loading={laeuft === hinweis.trotzdem.id}>Trotzdem anlegen</Button> : null}
        </p>
      ) : null}
      <Kartentabelle<Listenzeile>
        aria-label={NAME[liste]} rowKey="id" dataSource={zeilen} columns={spalten}
        leer={{ nichts: LEER[liste] }} karte={{ titel: "titel", kennzeichen: ["kennzeichen"] }}
      />
      {liste === "vorlagen" ? (
        // Fokus ins Titelfeld wie bei „Neu“ (NeuerPlan.tsx, afterOpenChange) — vorher blieb er am Container (Review Phase 4).
        <Drawer open={vorlage !== undefined} onClose={() => setAusVorlage(null)} title="Neuer Plan aus Vorlage" size={flyinBreite(480)} destroyOnHidden
          afterOpenChange={(auf) => { if (auf) titelRef.current?.focus(); }}>
          {vorlage ? <NeuerPlanFormular titelRef={titelRef} vorlagen={vorlagen} startVorlage={vorlage.id} heute={heute} onAngelegt={(id) => router.push(`/p/${id}`)} onAbbrechen={() => setAusVorlage(null)} /> : null}
        </Drawer>
      ) : null}
    </>
  );
}
