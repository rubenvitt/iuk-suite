"use client";

import { useState } from "react";
import { App, Button, Card, Popconfirm, Segmented, Select } from "antd";
import { xlsxHerunterladen } from "@/core/export/client";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Kartentabelle, nachText, nachZahl } from "@/core/tabelle";
import { KONFLIKT_TITEL, type Auswertung, type KonfliktArt } from "../_lib/pruefung";
import { schluessel, type PlanHelfer, type PlanungDTO } from "../_lib/typen";
import { stunden, wanduhr, zeitspanne } from "../_lib/zeit";
import { Blaetter, type Sicht } from "./Blaetter";
import { dateiname, eintraege, planungsMappe } from "./export";
import s from "./schichtplan.module.css";
import { Chip, EinheitZeichen, einheitTitel, KpiReihe, name, QualiChips } from "./teile";

// ── Helfer ─────────────────────────────────────────────────────────────────

type HelferFilter = "alle" | "eingeteilt" | "frei" | "temp";

export function HelferAnsicht({ p, a, helfer, neuTemp, bearbeiteTemp, entferneTemp }: {
  p: PlanungDTO; a: Auswertung; helfer: PlanHelfer[];
  neuTemp: () => void; bearbeiteTemp: (id: string) => void; entferneTemp: (id: string) => void;
}) {
  const [filter, setFilter] = useState<HelferFilter>("alle");
  const anzahl = new Map<string, number>();
  for (const z of p.zuordnungen) anzahl.set(schluessel(z.quelle, z.helferId), (anzahl.get(schluessel(z.quelle, z.helferId)) ?? 0) + 1);
  const n = (h: PlanHelfer) => anzahl.get(h.schluessel) ?? 0;
  const zeilen = helfer.filter((h) =>
    filter === "alle" ? true : filter === "eingeteilt" ? n(h) > 0 : filter === "frei" ? n(h) === 0 : h.quelle === "temp");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className={s.zeile} style={{ justifyContent: "space-between" }}>
        <Segmented<HelferFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { label: `Alle (${helfer.length})`, value: "alle" }, { label: "Eingeteilt", value: "eingeteilt" },
            { label: "Nicht eingeteilt", value: "frei" }, { label: `Temporär (${p.temporaere.length})`, value: "temp" },
          ]}
        />
        <Button type="primary" onClick={neuTemp} icon={<Icons8Ikone name="plus" groesse={16} />}>Temporären Helfer anlegen</Button>
      </div>
      <Kartentabelle<PlanHelfer>
        rowKey="schluessel"
        aria-label="Helfer der Planung"
        dataSource={zeilen}
        leer={{ nichts: "Im Helfer-Modul steht noch niemand, und es gibt keine temporären Helfer.", gefiltert: "Niemand passt zu diesem Filter.", aktiv: filter !== "alle" }}
        columns={[
          { title: "Name", key: "name", sorter: nachText<PlanHelfer>((h) => `${h.nachname} ${h.vorname}`), render: (_: unknown, h: PlanHelfer) => <strong>{name(h)}</strong> },
          {
            title: "Herkunft", key: "quelle",
            render: (_: unknown, h: PlanHelfer) => (h.quelle === "temp"
              ? <span><Chip ton="temp">Temporär</Chip><div className={s.neben}>{[h.organisation, h.telefon].filter(Boolean).join(" · ")}</div></span>
              : <Chip ton="grau">Helfer-Modul</Chip>),
          },
          { title: "Qualifikationen", key: "q", render: (_: unknown, h: PlanHelfer) => <QualiChips qualis={h.qualifikationen} /> },
          { title: "Schichten", key: "s", align: "right", sorter: nachZahl<PlanHelfer>(n), render: (_: unknown, h: PlanHelfer) => n(h) || "–" },
          { title: "Stunden", key: "h", align: "right", sorter: nachZahl<PlanHelfer>((h) => a.dauer.get(h.schluessel) ?? 0), render: (_: unknown, h: PlanHelfer) => (a.dauer.get(h.schluessel) ? stunden(a.dauer.get(h.schluessel)!) : "–") },
          {
            title: "Hinweise", key: "k",
            render: (_: unknown, h: PlanHelfer) => {
              const k = a.jeHelfer.get(h.schluessel) ?? [];
              return k.length ? <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{k.map((x, i) => <span key={i} title={x.text}><Chip ton="rot">{KONFLIKT_TITEL[x.art]}</Chip></span>)}</div> : null;
            },
          },
          {
            title: "Aktionen", key: "aktion",
            render: (_: unknown, h: PlanHelfer) => (h.quelle === "temp" ? (
              <span style={{ display: "flex", gap: 4 }}>
                <Button aria-label={`${name(h)} bearbeiten`} icon={<Icons8Ikone name="pencil" groesse={16} />} onClick={() => bearbeiteTemp(h.id)} />
                <Popconfirm title={`${name(h)} entfernen?`} description="Die Einteilungen dieser Person fallen weg." okText="Entfernen" cancelText="Abbrechen" onConfirm={() => entferneTemp(h.id)}>
                  <Button aria-label={`${name(h)} entfernen`} icon={<Icons8Ikone name="trash" groesse={16} />} />
                </Popconfirm>
              </span>
            ) : null),
          },
        ]}
      />
    </div>
  );
}

// ── Prüfen ─────────────────────────────────────────────────────────────────

const ARTEN: readonly KonfliktArt[] = ["doppelt", "quali", "dienst", "bestand"];

export function PruefAnsicht({ p, a, zurSchicht }: { p: PlanungDTO; a: Auswertung; zurSchicht: (id: string) => void }) {
  const schicht = new Map(p.schichten.map((x) => [x.id, x]));
  const einheit = new Map(p.einheiten.map((x) => [x.id, x]));
  const offen = a.luecken.reduce((n, l) => n + l.fehlen, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <KpiReihe a={a} p={p} />
      {ARTEN.map((art) => {
        const liste = a.konflikte.filter((k) => k.art === art);
        return (
          <Card key={art} title={<span>{KONFLIKT_TITEL[art]} <Chip ton={liste.length ? "rot" : "ok"}>{liste.length}</Chip></span>}>
            {liste.length === 0 ? <span className={s.neben}>Nichts gefunden.</span> : (
              <div className={s.befundListe}>
                {liste.map((k, i) => (
                  <div key={i} className={s.befund}>
                    <Icons8Ikone name="warning" groesse={18} style={{ color: "var(--sp-rot-text)", flex: "none" }} />
                    <span style={{ flex: 1 }}>{k.text}</span>
                    <Button onClick={() => zurSchicht(k.schichtIds[0])}>Zur Schicht</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      <Card title={<span>Offene Plätze <Chip ton={offen ? "gelb" : "ok"}>{offen}</Chip></span>}>
        {a.luecken.length === 0 ? <span className={s.neben}>{p.schichten.length ? "Alle Schichten sind voll besetzt." : "Noch keine Schichten."}</span> : (
          <div className={s.befundListe}>
            {a.luecken.map((l) => {
              const sch = schicht.get(l.schichtId);
              const e = sch ? einheit.get(sch.einheitId) : undefined;
              if (!sch || !e) return null;
              return (
                <div key={l.schichtId} className={s.befund}>
                  <EinheitZeichen e={e} />
                  <span style={{ flex: 1 }}>
                    {einheitTitel(e)}, {zeitspanne(sch.von, sch.bis, true)}: {l.fehlen === 1 ? "1 Platz" : `${l.fehlen} Plätze`} offen
                    {l.braucht.length ? `, davon ${l.braucht.map((x) => `${x.anzahl}× ${x.quali.name}`).join(", ")}` : ""}
                  </span>
                  <Button onClick={() => zurSchicht(sch.id)}>Zur Schicht</Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Ausgabe ────────────────────────────────────────────────────────────────

const tagIso = (ms: number) => {
  const w = wanduhr(ms);
  return `${w.jahr}-${String(w.monat).padStart(2, "0")}-${String(w.tag).padStart(2, "0")}`;
};

export function AusgabeAnsicht({ p, a, helfer, jetzt }: { p: PlanungDTO; a: Auswertung; helfer: PlanHelfer[]; jetzt: number }) {
  const { message } = App.useApp();
  const [sicht, setSicht] = useState<Sicht>("abschnitt");
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const liste = eintraege(p, helfer);
  const eingeteilt = helfer.filter((h) => liste.some((x) => x.personen.includes(h)));
  const druck = `/p/${p.id}/druck?sicht=${sicht}${auswahl ? `&auswahl=${encodeURIComponent(auswahl)}` : ""}`;

  async function excel() {
    setLaeuft(true);
    try {
      await xlsxHerunterladen(dateiname(p, tagIso(p.von)), planungsMappe(p, a, helfer));
    } catch {
      void message.warning("Die Excel-Datei ließ sich nicht erzeugen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className={s.zeile}>
        <Segmented<Sicht> value={sicht} onChange={(v) => { setSicht(v); setAuswahl(null); }} options={[{ label: "Je Abschnitt", value: "abschnitt" }, { label: "Je Helfer", value: "helfer" }]} />
        <Select
          allowClear
          showSearch={{ optionFilterProp: "label" }}
          style={{ minWidth: 260 }}
          aria-label="Blatt wählen"
          placeholder={sicht === "helfer" ? "Alle eingeteilten Helfer" : "Alle Abschnitte und Fahrzeuge"}
          value={auswahl}
          onChange={(v) => setAuswahl(v ?? null)}
          options={sicht === "helfer" ? eingeteilt.map((h) => ({ value: h.schluessel, label: name(h) })) : p.einheiten.map((e) => ({ value: e.id, label: einheitTitel(e) }))}
        />
        <span style={{ flex: 1 }} />
        <Button href={druck} target="_blank" icon={<Icons8Ikone name="print" groesse={16} />}>Drucken</Button>
        <Button type="primary" loading={laeuft} onClick={() => void excel()} icon={<Icons8Ikone name="download" groesse={16} />}>Excel herunterladen</Button>
      </div>
      <Blaetter p={p} helfer={helfer} sicht={sicht} auswahl={auswahl} jetzt={jetzt} />
    </div>
  );
}
