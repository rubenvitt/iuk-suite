"use client";

import { Button, DatePicker, Popconfirm, Select } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { KONFLIKT_TITEL, offeneAnforderungen, type Auswertung } from "../_lib/pruefung";
import { erfuellt } from "../_lib/qualis";
import { type EinheitDTO, type PlanHelfer, type PlanungDTO, type SchichtDTO, RASTER_MIN, STUNDE, schluessel } from "../_lib/typen";
import { rasten, zeitspanne } from "../_lib/zeit";
import { alsDayjs, ausDayjs } from "./datum";
import s from "./schichtplan.module.css";
import { Chip, name, QualiChips } from "./teile";

export interface SchichtAktionen {
  zuteilen: (schichtId: string, helferSchluessel: string) => void;
  austragen: (schichtId: string, helferSchluessel: string) => void;
  schichtSetzen: (schichtId: string, von: number, bis: number) => void;
  schichtLoeschen: (schichtId: string) => void;
}

/**
 * Eine Schicht mit Eingabefeldern — der Weg für Tastatur und Telefon: Konflikte, Soll, Eingeteilte,
 * Helfer hinzufügen (die passenden zuerst), Zeit per Datumsfeld oder in Stundenschritten, löschen.
 */
export function SchichtInhalt({ p, a, helfer, sch, e, aktionen, onGeloescht }: {
  p: PlanungDTO; a: Auswertung; helfer: PlanHelfer[]; sch: SchichtDTO; e: EinheitDTO; aktionen: SchichtAktionen; onGeloescht: () => void;
}) {
  const map = new Map(helfer.map((h) => [h.schluessel, h]));
  const ids = p.zuordnungen.filter((z) => z.schichtId === sch.id).map((z) => schluessel(z.quelle, z.helferId));
  const personen = ids.map((k) => map.get(k)).filter((h): h is PlanHelfer => !!h);
  const offen = offeneAnforderungen(e, personen);
  const konflikte = a.jeSchicht.get(sch.id) ?? [];

  // Wer ist in diesem Zeitfenster schon woanders eingeteilt?
  const belegt = new Map<string, string>();
  const schichtVon = new Map(p.schichten.map((x) => [x.id, x]));
  const einheitVon = new Map(p.einheiten.map((x) => [x.id, x]));
  for (const z of p.zuordnungen) {
    const t = schichtVon.get(z.schichtId);
    if (!t || t.id === sch.id || t.bis <= sch.von || t.von >= sch.bis) continue;
    belegt.set(schluessel(z.quelle, z.helferId), `${einheitVon.get(t.einheitId)?.name ?? "?"} ${zeitspanne(t.von, t.bis)}`);
  }
  const kandidaten = helfer.filter((h) => !ids.includes(h.schluessel));
  const deckt = (h: PlanHelfer) => offen.filter((o) => erfuellt(h.qualifikationen, o.quali)).map((o) => o.quali.name);
  const gruppe = (pred: (h: PlanHelfer) => boolean) => kandidaten.filter(pred).map((h) => {
    const d = deckt(h);
    const b = belegt.get(h.schluessel);
    return {
      value: h.schluessel,
      suche: `${name(h)} ${h.qualifikationen.map((q) => q.kurz).join(" ")}`,
      label: (
        <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span>{name(h)} <span className={s.neben}>{h.qualifikationen.map((q) => q.kurz).join(", ")}</span></span>
          {b ? <Chip ton="rot">belegt: {b}</Chip> : d.length ? <Chip ton="ok">deckt {d.join(", ")}</Chip> : null}
        </span>
      ),
    };
  });
  const optionen = [
    { label: "Deckt eine offene Anforderung", options: gruppe((h) => !belegt.has(h.schluessel) && deckt(h).length > 0) },
    { label: "Verfügbar", options: gruppe((h) => !belegt.has(h.schluessel) && deckt(h).length === 0) },
    { label: "Zur selben Zeit schon eingeteilt", options: gruppe((h) => belegt.has(h.schluessel)) },
  ].filter((g) => g.options.length > 0);

  const setze = (von: number, bis: number) => {
    if (von < p.von || bis > p.bis || bis <= von) return;
    aktionen.schichtSetzen(sch.id, von, bis);
  };

  return (
    <div>
      {konflikte.length > 0 ? (
        <div className={s.abschnitt}>
          {konflikte.map((k, i) => <div key={i} className={s.warnbox}><strong>{KONFLIKT_TITEL[k.art]}:</strong> {k.text}</div>)}
        </div>
      ) : null}

      <div className={s.abschnitt}>
        <span className={s.kicker}>Soll</span>
        <div className={s.anforderung}><Chip ton={ids.length >= e.soll ? "ok" : "gelb"}>{ids.length}/{e.soll}</Chip> Plätze besetzt</div>
        {e.anforderungen.map((an) => {
          const fehlt = offen.find((o) => o.quali.kurz === an.quali.kurz)?.anzahl ?? 0;
          return (
            <div key={an.quali.kurz} className={s.anforderung}>
              <Chip ton={fehlt ? "gelb" : "ok"}>{fehlt ? `${fehlt} fehlt` : "erfüllt"}</Chip>
              {an.anzahl}× {an.quali.name} oder höher
            </div>
          );
        })}
      </div>

      <div className={s.abschnitt}>
        <span className={s.kicker}>Eingeteilt</span>
        {ids.length === 0 ? <span className={s.neben}>Noch niemand.</span> : null}
        <div>
          {ids.map((k) => {
            const h = map.get(k);
            const eigene = (a.jeHelfer.get(k) ?? []).filter((x) => x.schichtIds.includes(sch.id));
            const titel = h ? name(h) : "Nicht mehr im Bestand";
            return (
              <div key={k} className={s.personZeile}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{titel} {h?.quelle === "temp" ? <Chip ton="temp">Temporär</Chip> : null}</span>
                  {h ? <QualiChips qualis={h.qualifikationen} /> : null}
                  {eigene.map((x, i) => <span key={i} className={s.neben} style={{ color: "var(--sp-rot-text)" }}>{KONFLIKT_TITEL[x.art]}</span>)}
                </div>
                <Button aria-label={`${titel} austragen`} icon={<Icons8Ikone name="close" groesse={16} />} onClick={() => aktionen.austragen(sch.id, k)} />
              </div>
            );
          })}
        </div>
        <Select
          showSearch={{ optionFilterProp: "suche" }}
          placeholder="Helfer hinzufügen"
          aria-label="Helfer hinzufügen"
          value={null}
          options={optionen}
          onChange={(v: string) => aktionen.zuteilen(sch.id, v)}
          listHeight={360}
        />
      </div>

      <div className={s.abschnitt}>
        <span className={s.kicker}>Zeit</span>
        <DatePicker.RangePicker
          showTime={{ format: "HH:mm", minuteStep: RASTER_MIN }}
          format="DD.MM.YYYY HH:mm"
          value={[alsDayjs(sch.von), alsDayjs(sch.bis)]}
          allowClear={false}
          aria-label="Beginn und Ende"
          onChange={(w) => { if (w?.[0] && w[1]) setze(rasten(ausDayjs(w[0])), rasten(ausDayjs(w[1]))); }}
        />
        <div className={s.zeile}>
          <Button disabled={sch.von - STUNDE < p.von} onClick={() => setze(sch.von - STUNDE, sch.bis - STUNDE)}>1 h früher</Button>
          <Button disabled={sch.bis + STUNDE > p.bis} onClick={() => setze(sch.von + STUNDE, sch.bis + STUNDE)}>1 h später</Button>
          <Button disabled={sch.bis + STUNDE > p.bis} onClick={() => setze(sch.von, sch.bis + STUNDE)}>1 h länger</Button>
          <Button disabled={sch.bis - sch.von <= STUNDE} onClick={() => setze(sch.von, sch.bis - STUNDE)}>1 h kürzer</Button>
        </div>
        <span className={s.neben}>Gilt nur für diese Schicht. Im Raster geht es auch per Ziehen.</span>
      </div>

      <div className={s.abschnitt}>
        <Popconfirm title="Schicht löschen?" description={ids.length ? "Die Einteilungen dieser Schicht fallen weg." : undefined} okText="Löschen" cancelText="Abbrechen" onConfirm={() => { aktionen.schichtLoeschen(sch.id); onGeloescht(); }}>
          <Button style={{ alignSelf: "flex-start" }}>Schicht löschen</Button>
        </Popconfirm>
      </div>
    </div>
  );
}
