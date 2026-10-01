"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Drawer, Dropdown, type MenuProps, type TableProps } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { Kartentabelle, nachText } from "@/core/tabelle";
import { archiviereAction, dupliziereAction, setzeVorlageAction, stelleWiederHerAction } from "../_actions/verwaltung";
import type { EinfachErgebnis } from "../_lib/ergebnis";
import type { Liste, Listenzeile } from "../_lib/plaene";
import type { VorlageWahl } from "../_lib/planverwaltung";
import { NeuerPlanFormular } from "./NeuerPlan";

const NAME: Record<Liste, string> = { plaene: "Pläne", vorlagen: "Vorlagen", archiv: "Archivierte Pläne" };
const LEER: Record<Liste, string> = {
  plaene: "Noch keine Pläne.",
  vorlagen: "Noch keine Vorlagen. „Als Vorlage speichern“ im Menü eines Plans macht ihn zur Vorlage.",
  archiv: "Das Archiv ist leer.",
};
type Aktion = "duplizieren" | "vorlage" | "keineVorlage" | "archivieren" | "wiederherstellen" | "ausVorlage";
const MENUE: Record<Liste, { key: Aktion; label: string }[]> = {
  plaene: [{ key: "duplizieren", label: "Duplizieren" }, { key: "vorlage", label: "Als Vorlage speichern" }, { key: "archivieren", label: "Archivieren" }],
  vorlagen: [{ key: "ausVorlage", label: "Neu aus Vorlage" }, { key: "keineVorlage", label: "Keine Vorlage mehr" }, { key: "archivieren", label: "Archivieren" }],
  archiv: [{ key: "wiederherstellen", label: "Wiederherstellen" }],
};
const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";
interface Hinweis { text: string; zurueck?: string }

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

  async function fuehreAus(z: Listenzeile, a: Aktion) {
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
    const lauf: Record<Exclude<Aktion, "ausVorlage" | "duplizieren">, () => Promise<EinfachErgebnis>> = {
      vorlage: () => setzeVorlageAction({ id: z.id, vorlage: true }),
      keineVorlage: () => setzeVorlageAction({ id: z.id, vorlage: false }),
      archivieren: () => archiviereAction(z.id),
      wiederherstellen: () => stelleWiederHerAction(z.id),
    };
    const r = await lauf[a]().catch((): EinfachErgebnis => ({ ok: false, fehler: NETZ }));
    setzeLauf(null);
    if (!r.ok) { setHinweis({ text: r.fehler }); return; }
    const text = { vorlage: `„${z.titel}“ steht jetzt unter „Vorlagen“.`, keineVorlage: `„${z.titel}“ steht wieder unter „Pläne“.`,
      archivieren: `„${z.titel}“ archiviert.`, wiederherstellen: `„${z.titel}“ wiederhergestellt.` }[a];
    setHinweis({ text, zurueck: a === "archivieren" ? z.id : undefined });
    router.refresh();
  }
  async function zurueck(id: string) {
    const r = await stelleWiederHerAction(id).catch((): EinfachErgebnis => ({ ok: false, fehler: NETZ }));
    setHinweis(r.ok ? { text: "Wiederhergestellt." } : { text: r.fehler });
    if (r.ok) router.refresh();
  }

  const spalten: NonNullable<TableProps<Listenzeile>["columns"]> = [
    { key: "titel", title: "Titel", dataIndex: "titel", sorter: nachText<Listenzeile>((z) => z.titel),
      render: (_: unknown, z: Listenzeile) => <Link href={`/p/${z.id}`}>{z.titel}</Link> },
    { key: "kennzeichen", title: "Kennzeichen", render: (_: unknown, z: Listenzeile) => (
      <span className="kp-chips">{z.lesbar ? null : <span className="kp-chip kp-chip-hinweis">nicht lesbar</span>}</span>
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
        <p className="kp-listenhinweis" role="status">
          {hinweis.text}
          {hinweis.zurueck ? <Button onClick={() => void zurueck(hinweis.zurueck!)}>Rückgängig</Button> : null}
        </p>
      ) : null}
      <Kartentabelle<Listenzeile>
        aria-label={NAME[liste]} rowKey="id" dataSource={zeilen} columns={spalten}
        leer={{ nichts: LEER[liste] }} karte={{ titel: "titel", kennzeichen: ["kennzeichen"] }}
      />
      {liste === "vorlagen" ? (
        <Drawer open={vorlage !== undefined} onClose={() => setAusVorlage(null)} title="Neuer Plan aus Vorlage" size={flyinBreite(480)} destroyOnHidden>
          {vorlage ? <NeuerPlanFormular vorlagen={vorlagen} startVorlage={vorlage.id} heute={heute} onAngelegt={(id) => router.push(`/p/${id}`)} onAbbrechen={() => setAusVorlage(null)} /> : null}
        </Drawer>
      ) : null}
    </>
  );
}
