"use client";

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { App, Button, Input, Popover, Segmented, Select } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import type { Auswertung } from "../_lib/pruefung";
import { erfuellt } from "../_lib/qualis";
import { freieLuecke, spurenZahl, verteileSpuren } from "../_lib/spuren";
import { type EinheitDTO, type PlanHelfer, type PlanungDTO, type Quali, type SchichtDTO, MIN_SCHICHT_MIN, RASTER_MIN, MINUTE, STUNDE, schluessel } from "../_lib/typen";
import { kurzTag, rasten, stunden, stundeInZone, uhrzeit, zeitspanne } from "../_lib/zeit";
import s from "./schichtplan.module.css";
import { anforderungKurz, anforderungText, Chip, EinheitZeichen, einheitTitel, name, QualiChips, schichtAmpel } from "./teile";

/** Was der Editor für das Raster ausführt (optimistisch, dann Server). */
export interface RasterAktionen {
  zuteilen: (schichtId: string, helferSchluessel: string, ausSchichtId?: string) => void;
  schichtSetzen: (schichtId: string, von: number, bis: number, einheitId?: string) => void;
  schichtAnlegen: (einheitId: string, von: number, bis: number) => void;
}

const ZIEHDATEN = "application/x-schichtplan";
/** Unter dieser Breite trägt ein Block weder Innenabstand noch Inhalt, sonst wäre er breiter als seine Schicht. */
const SCHMAL_PX = 32;
const RASTER = RASTER_MIN * MINUTE;
const MIN_SCHICHT = MIN_SCHICHT_MIN * MINUTE;
const MAX_SCHICHT = 24 * STUNDE;
type Zoom = "eng" | "normal" | "weit";
/** IDA-385: Beschriftung bricht um, statt aus dem Knopf zu laufen (inline, Falle 5). */
const UMBRECHEND = { whiteSpace: "normal", height: "auto", minHeight: 44, textAlign: "start", maxWidth: "100%", paddingInline: 8, hyphens: "auto" } as const;
const PX: Record<Zoom, number> = { eng: 28, normal: 56, weit: 96 };

type Zug =
  | { art: "zeichnen"; einheitId: string; anker: number; ende: number }
  | { art: "verschieben" | "von" | "bis"; schichtId: string; von: number; bis: number; einheitId: string; bewegt: boolean };

/** Gezeichnet und gezogen wird nur mit Maus oder Stift; auf Touch scrollt das Raster, ein Tipp öffnet die Schicht. */
const zeichenbar = (ev: ReactPointerEvent) => (ev.pointerType === "mouse" || ev.pointerType === "pen") && ev.button === 0;
const klemme = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);
const unten = (ms: number) => Math.floor(ms / RASTER) * RASTER;

export function Raster({ p, a, helfer, katalog, aktionen, oeffneSchicht, bearbeiteEinheit }: {
  p: PlanungDTO; a: Auswertung; helfer: PlanHelfer[]; katalog: Quali[]; aktionen: RasterAktionen;
  oeffneSchicht: (id: string) => void; bearbeiteEinheit: (id: string | "neu") => void;
}) {
  const { message } = App.useApp();
  const [zoom, setZoomState] = useState<Zoom>(p.bis - p.von > 24 * STUNDE ? "eng" : "normal");
  const zoomGewaehlt = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const namenRef = useRef<HTMLDivElement>(null);
  const setZoom = (z: Zoom) => { zoomGewaehlt.current = true; setZoomState(z); };
  // IDA-385: Passt der Zeitraum bei „Normal“ nicht in die Breite, gleich „Eng“ — sonst endet der
  // sichtbare Teil mitten im Tag und die späten Schichten brauchen Querscrollen.
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (zoomGewaehlt.current || !scroll) return;
    const platz = scroll.clientWidth - (namenRef.current?.offsetWidth ?? 0);
    if (((p.bis - p.von) / STUNDE) * PX.normal > platz) setZoomState("eng");
  }, [p.von, p.bis]);
  const [ziel, setZiel] = useState<string | null>(null);
  const [zug, setZug] = useState<Zug | null>(null);
  const klickSperre = useRef(false);
  const px = PX[zoom];
  const breite = ((p.bis - p.von) / STUNDE) * px;
  const helferMap = useMemo(() => new Map(helfer.map((h) => [h.schluessel, h])), [helfer]);
  const x = (t: number) => ((t - p.von) / STUNDE) * px;

  const besetzt = (schichtId: string) => p.zuordnungen.filter((z) => z.schichtId === schichtId).map((z) => schluessel(z.quelle, z.helferId));

  // Während eines Zugs zeigt das Raster die Schicht schon an der neuen Stelle.
  const schichten: SchichtDTO[] = zug && zug.art !== "zeichnen" && zug.bewegt
    ? p.schichten.map((x0) => (x0.id === zug.schichtId ? { ...x0, von: zug.von, bis: zug.bis, einheitId: zug.einheitId } : x0))
    : p.schichten;

  // ── Helfer ablegen (HTML5 Drag and Drop) ──
  function ablegen(ev: DragEvent, schichtId: string) {
    ev.preventDefault();
    setZiel(null);
    const roh = ev.dataTransfer.getData(ZIEHDATEN) || ev.dataTransfer.getData("text/plain");
    const [k, aus] = roh.split("|");
    if (!k || aus === schichtId || !helferMap.has(k)) return;
    if (besetzt(schichtId).includes(k)) {
      void message.info(`${name(helferMap.get(k)!)} ist in dieser Schicht schon eingeteilt.`);
      return;
    }
    aktionen.zuteilen(schichtId, k, aus || undefined);
  }

  // ── Zeichnen, Verschieben, Kanten ziehen (Pointer Events, am Fenster verfolgt) ──
  function verfolge(bewegen: (ev: PointerEvent) => void, loslassen: (ev: PointerEvent) => void) {
    const weg = () => { window.removeEventListener("pointermove", bewegen); window.removeEventListener("pointerup", hoch); window.removeEventListener("pointercancel", abbruch); };
    const hoch = (ev: PointerEvent) => { weg(); loslassen(ev); };
    const abbruch = () => { weg(); setZug(null); };
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", hoch);
    window.addEventListener("pointercancel", abbruch);
  }

  function zeichneAb(ev: ReactPointerEvent<HTMLDivElement>, e: EinheitDTO) {
    if (!zeichenbar(ev) || ev.target !== ev.currentTarget) return;
    ev.preventDefault();
    const rahmen = ev.currentTarget.getBoundingClientRect();
    const zeit = (clientX: number) => klemme(rasten(p.von + ((clientX - rahmen.left) / px) * STUNDE), p.von, p.bis);
    const anker = zeit(ev.clientX);
    let stand: Zug = { art: "zeichnen", einheitId: e.id, anker, ende: anker };
    setZug(stand);
    verfolge(
      (m) => { stand = { ...stand, ende: zeit(m.clientX) } as Zug; setZug(stand); },
      () => {
        setZug(null);
        if (stand.art !== "zeichnen") return;
        const von = Math.min(stand.anker, stand.ende);
        const bis = Math.min(Math.max(stand.anker, stand.ende), von + MAX_SCHICHT);
        if (bis - von >= MIN_SCHICHT) aktionen.schichtAnlegen(e.id, von, bis);
      },
    );
  }

  function zieheAb(ev: ReactPointerEvent<HTMLElement>, sch: SchichtDTO, art: "verschieben" | "von" | "bis") {
    if (!zeichenbar(ev) || (ev.target as HTMLElement).closest('[draggable="true"]')) return;
    ev.stopPropagation();
    const startX = ev.clientX;
    const startY = ev.clientY;
    let stand: Zug = { art, schichtId: sch.id, von: sch.von, bis: sch.bis, einheitId: sch.einheitId, bewegt: false };
    verfolge(
      (m) => {
        if (stand.art === "zeichnen") return;
        const bewegt = stand.bewegt || Math.abs(m.clientX - startX) > 3 || Math.abs(m.clientY - startY) > 3;
        if (!bewegt) return;
        const d = rasten(((m.clientX - startX) / px) * STUNDE);
        let { von, bis, einheitId } = sch;
        if (art === "verschieben") {
          const dauer = sch.bis - sch.von;
          von = klemme(sch.von + d, p.von, p.bis - dauer);
          bis = von + dauer;
          const spur = document.elementFromPoint(m.clientX, m.clientY)?.closest<HTMLElement>("[data-spur]");
          einheitId = spur?.dataset.spur ?? stand.einheitId;
        } else if (art === "von") {
          von = klemme(sch.von + d, Math.max(p.von, sch.bis - MAX_SCHICHT), sch.bis - MIN_SCHICHT);
        } else {
          bis = klemme(sch.bis + d, sch.von + MIN_SCHICHT, Math.min(p.bis, sch.von + MAX_SCHICHT));
        }
        stand = { ...stand, von, bis, einheitId, bewegt: true };
        setZug(stand);
      },
      () => {
        setZug(null);
        if (stand.art === "zeichnen" || !stand.bewegt) return;
        // Der Klick nach dem Loslassen öffnet sonst die Schicht.
        klickSperre.current = true;
        window.setTimeout(() => { klickSperre.current = false; }, 0);
        if (stand.von !== sch.von || stand.bis !== sch.bis || stand.einheitId !== sch.einheitId) {
          aktionen.schichtSetzen(sch.id, stand.von, stand.bis, stand.einheitId !== sch.einheitId ? stand.einheitId : undefined);
        }
      },
    );
  }

  /** Doppelklick in eine leere Stelle: eine Schicht der üblichen Länge ab dort. */
  function doppelklick(ev: React.MouseEvent<HTMLDivElement>, e: EinheitDTO) {
    if (ev.target !== ev.currentTarget) return;
    const rahmen = ev.currentTarget.getBoundingClientRect();
    const von = klemme(unten(p.von + ((ev.clientX - rahmen.left) / px) * STUNDE), p.von, p.bis - MIN_SCHICHT);
    aktionen.schichtAnlegen(e.id, von, Math.min(von + e.schichtMin * MINUTE, p.bis));
  }

  /**
   * Für Tastatur und Telefon: eine Schicht der üblichen Länge in die nächste freie Lücke der Zeile
   * (IDA-385: nie über eine bestehende). Ist die Zeile ganz belegt, wird nichts angelegt.
   */
  function schichtAnhaengen(e: EinheitDTO) {
    const frei = freieLuecke(p.schichten.filter((x0) => x0.einheitId === e.id), p, e.schichtMin * MINUTE, MIN_SCHICHT);
    if (frei) aktionen.schichtAnlegen(e.id, frei.von, frei.bis);
    else void message.info(`${e.name} ist im ganzen Zeitraum belegt.`);
  }

  // Stundenmarken und Tagesbeginne (in der Suite-Zone) für den Kopf.
  const marken: { t: number; tag: boolean }[] = [];
  const schritt = zoom === "eng" ? 6 : zoom === "normal" ? 2 : 1;
  for (let t = Math.ceil(p.von / STUNDE) * STUNDE; t <= p.bis; t += STUNDE) {
    const h = stundeInZone(t);
    if (h % schritt === 0) marken.push({ t, tag: h === 0 });
  }

  return (
    <div className={s.arbeitsflaeche}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={s.zeile} style={{ justifyContent: "space-between" }}>
          <span />
          <Segmented<Zoom> value={zoom} onChange={setZoom} options={[{ label: "Eng", value: "eng" }, { label: "Normal", value: "normal" }, { label: "Weit", value: "weit" }]} />
        </div>
        <div className={s.raster}>
          <div className={s.rasterScroll} ref={scrollRef}>
            <div className={s.rasterInnen}>
              <div className={s.rasterKopfLinks} ref={namenRef}><span className={s.kicker}>Abschnitt / Fahrzeug</span></div>
              <div className={s.rasterKopf} style={{ width: breite }}>
                <span className={s.tagMarke} style={{ left: 0 }}>{kurzTag(p.von)}</span>
                {marken.map((m) => (
                  <span key={m.t}>
                    {m.tag && m.t > p.von ? <span className={s.tagMarke} style={{ left: x(m.t) }}>{kurzTag(m.t)}</span> : null}
                    <span className={s.stundeMarke} style={{ left: Math.max(x(m.t), 14) }}>{uhrzeit(m.t).slice(0, 2)}</span>
                  </span>
                ))}
              </div>
              {p.einheiten.map((e) => {
                const eigene = schichten.filter((x0) => x0.einheitId === e.id);
                const zeilen = Math.max(e.soll, ...eigene.map((x0) => besetzt(x0.id).length)) + 1;
                // IDA-385: Überschneiden sich Schichten, liegen sie in Spuren übereinander statt deckungsgleich.
                const lage = verteileSpuren(eigene);
                const hoehe = Math.max(128, 40 + zeilen * 20) * spurenZahl(lage);
                const anf = anforderungKurz(e);
                return (
                  <Fragment key={e.id}>
                    <div className={s.einheitZelle} style={{ minHeight: hoehe }}>
                      <button type="button" className={s.einheitName} onClick={() => bearbeiteEinheit(e.id)} title="Abschnitt bearbeiten">
                        <EinheitZeichen e={e} />
                        <span>{einheitTitel(e)}</span>
                      </button>
                      <span className={s.neben} title={anf ? anforderungText(e) : undefined}>Soll {e.soll}{anf ? ` · ${anf}` : ""}</span>
                      <span className={`${s.neben} ${s.nurBreit}`}>Schichten je {stunden(e.schichtMin * MINUTE)}</span>
                      <Button type="link" style={{ alignSelf: "flex-start", paddingInline: 0 }} onClick={() => schichtAnhaengen(e)}>Schicht anlegen</Button>
                    </div>
                    <div
                      data-spur={e.id}
                      className={`${s.spur} ${s.zeichenbar}`}
                      style={{ width: breite, minHeight: hoehe, backgroundSize: `${px}px 100%` }}
                      onPointerDown={(ev) => zeichneAb(ev, e)}
                      onDoubleClick={(ev) => doppelklick(ev, e)}
                    >
                      {zug?.art === "zeichnen" && zug.einheitId === e.id && zug.ende !== zug.anker ? (
                        <div className={s.entwurf} style={{ left: x(Math.min(zug.anker, zug.ende)), width: Math.abs(x(zug.ende) - x(zug.anker)) }}>
                          {zeitspanne(Math.min(zug.anker, zug.ende), Math.max(zug.anker, zug.ende))}
                        </div>
                      ) : null}
                      {eigene.map((sch) => {
                        const ids = besetzt(sch.id);
                        const ampel = schichtAmpel(sch, a);
                        const leer = Math.max(0, e.soll - ids.length);
                        const zieht = zug && zug.art !== "zeichnen" && zug.schichtId === sch.id && zug.bewegt;
                        const luecke = a.luecken.find((l) => l.schichtId === sch.id);
                        const { spur, spuren } = lage.get(sch.id) ?? { spur: 0, spuren: 1 };
                        return (
                          <div
                            key={sch.id}
                            role="button"
                            tabIndex={0}
                            data-schicht={sch.id}
                            aria-label={`${e.name}, ${zeitspanne(sch.von, sch.bis)}, ${ids.length} von ${e.soll} besetzt`}
                            className={`${s.block} ${s[ampel]}${x(sch.bis) - x(sch.von) < SCHMAL_PX ? ` ${s.schmal}` : ""}${ziel === sch.id ? ` ${s.ziel}` : ""}${zieht ? ` ${s.zieht}` : ""}`}
                            style={{
                              left: x(sch.von) + 2, width: Math.max(x(sch.bis) - x(sch.von) - 4, 6),
                              top: `calc(${spur} * 100% / ${spuren} + 6px)`, height: `calc(100% / ${spuren} - 12px)`, bottom: "auto",
                            }}
                            onPointerDown={(ev) => zieheAb(ev, sch, "verschieben")}
                            onClick={() => { if (!klickSperre.current) oeffneSchicht(sch.id); }}
                            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); oeffneSchicht(sch.id); } }}
                            onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (ziel !== sch.id) setZiel(sch.id); }}
                            onDragLeave={() => setZiel((z) => (z === sch.id ? null : z))}
                            onDrop={(ev) => ablegen(ev, sch.id)}
                          >
                            <span className={`${s.griff} ${s.griffVon}`} aria-hidden="true" onPointerDown={(ev) => zieheAb(ev, sch, "von")} />
                            <span className={`${s.griff} ${s.griffBis}`} aria-hidden="true" onPointerDown={(ev) => zieheAb(ev, sch, "bis")} />
                            <div className={s.blockKopf}>
                              <span>{zeitspanne(sch.von, sch.bis)}</span>
                              <Chip ton={ampel}>{ids.length}/{e.soll}</Chip>
                            </div>
                            {ids.map((k) => {
                              const h = helferMap.get(k);
                              const konflikt = (a.jeHelfer.get(k) ?? []).some((kk) => kk.schichtIds.includes(sch.id));
                              return (
                                <div
                                  key={k}
                                  className={`${s.blockName}${konflikt ? ` ${s.konflikt}` : ""}`}
                                  draggable
                                  onDragStart={(ev) => { ev.stopPropagation(); ev.dataTransfer.setData(ZIEHDATEN, `${k}|${sch.id}`); ev.dataTransfer.setData("text/plain", `${k}|${sch.id}`); ev.dataTransfer.effectAllowed = "move"; }}
                                  title={konflikt ? "Konflikt, Details in der Schicht" : undefined}
                                >
                                  {konflikt ? <Icons8Ikone name="warning" groesse={14} /> : null}
                                  {h ? name(h) : "Nicht mehr im Bestand"}
                                  {h?.quelle === "temp" ? <span className={s.neben}>(temp.)</span> : null}
                                </div>
                              );
                            })}
                            {leer > 0 ? (
                              <div className={`${s.blockName} ${s.leer}`}>
                                {leer === 1 ? "1 Platz offen" : `${leer} Plätze offen`}{luecke?.braucht.length ? `, braucht ${luecke.braucht.map((b) => b.quali.kurz).join(", ")}` : ""}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </Fragment>
                );
              })}
              <div className={s.einheitZelle} style={{ borderBlockEnd: 0 }}>
                <Button style={UMBRECHEND} onClick={() => bearbeiteEinheit("neu")} icon={<Icons8Ikone name="plus" groesse={16} />}>Abschnitt oder Fahrzeug</Button>
              </div>
              <div />
            </div>
          </div>
        </div>
        <Legende />
      </div>
      <Helferleiste p={p} a={a} helfer={helfer} katalog={katalog} zuteilen={aktionen.zuteilen} />
    </div>
  );
}

function Legende() {
  return (
    <div className={`${s.zeile} ${s.neben}`}>
      <Chip ton="ok">2/2</Chip> vollständig und ohne Konflikt
      <Chip ton="gelb">1/2</Chip> Platz offen
      <Chip ton="rot">2/2</Chip> Konflikt: doppelt verplant, Qualifikation fehlt, zu lange im Dienst
    </div>
  );
}

// ── Helferleiste ───────────────────────────────────────────────────────────

/**
 * Offene Schichten, in die eine Person passt (IDA-385: Antippen einer Karte in der Helferleiste): nicht
 * schon dort und zur selben Zeit nirgends sonst eingeteilt; wer eine offene Anforderung deckt, zuerst.
 */
function passendeSchichten(p: PlanungDTO, a: Auswertung, h: PlanHelfer): { sch: SchichtDTO; e: EinheitDTO; deckt: boolean }[] {
  const schicht = new Map(p.schichten.map((x0) => [x0.id, x0]));
  const einheit = new Map(p.einheiten.map((e) => [e.id, e]));
  const eigene = p.zuordnungen.filter((z) => schluessel(z.quelle, z.helferId) === h.schluessel).map((z) => schicht.get(z.schichtId)).filter((x0): x0 is SchichtDTO => !!x0);
  return a.luecken.flatMap((l) => {
    const sch = schicht.get(l.schichtId);
    const e = sch ? einheit.get(sch.einheitId) : undefined;
    if (!sch || !e || eigene.some((x0) => x0.von < sch.bis && x0.bis > sch.von)) return [];
    return [{ sch, e, deckt: l.braucht.some((b) => erfuellt(h.qualifikationen, b.quali)) }];
  }).sort((x0, y0) => Number(y0.deckt) - Number(x0.deckt) || x0.sch.von - y0.sch.von);
}

function Helferleiste({ p, a, helfer, katalog, zuteilen }: {
  p: PlanungDTO; a: Auswertung; helfer: PlanHelfer[]; katalog: Quali[]; zuteilen: RasterAktionen["zuteilen"];
}) {
  const [offen, setOffen] = useState<string | null>(null);
  const mehrtaegig = p.bis - p.von > 24 * STUNDE;
  const [suche, setSuche] = useState("");
  const [quali, setQuali] = useState<string | null>(null);
  const [nur, setNur] = useState<"alle" | "frei">("alle");
  const gefordert = katalog.find((q) => q.kurz === quali);
  const liste = helfer
    .filter((h) => !suche || name(h).toLocaleLowerCase("de").includes(suche.toLocaleLowerCase("de")))
    .filter((h) => !gefordert || erfuellt(h.qualifikationen, gefordert))
    .filter((h) => nur === "alle" || !a.dauer.get(h.schluessel));
  return (
    <aside className={s.leiste} aria-label="Helfer">
      <div className={s.kartenZeile}>
        <span className={s.kicker}>Helfer</span>
        <span className={s.neben}>{liste.length} von {helfer.length}</span>
      </div>
      <Input allowClear placeholder="Name suchen" value={suche} onChange={(e) => setSuche(e.target.value)} prefix={<Icons8Ikone name="search" groesse={16} />} aria-label="Helfer suchen" />
      <Select allowClear placeholder="Mindestens Qualifikation" value={quali} onChange={(v) => setQuali(v ?? null)} options={katalog.map((q) => ({ value: q.kurz, label: q.name === q.kurz ? q.kurz : `${q.name} (${q.kurz})` }))} showSearch={{ optionFilterProp: "label" }} aria-label="Nach Qualifikation filtern" />
      <Segmented<"alle" | "frei"> block value={nur} onChange={setNur} options={[{ label: "Alle", value: "alle" }, { label: "Nicht eingeteilt", value: "frei" }]} />
      <div className={s.leisteListe}>
        {liste.map((h) => {
          const dauer = a.dauer.get(h.schluessel) ?? 0;
          const k = a.jeHelfer.get(h.schluessel) ?? [];
          const passend = offen === h.schluessel ? passendeSchichten(p, a, h) : [];
          return (
            <Popover
              key={h.schluessel}
              trigger="click"
              placement="left"
              open={offen === h.schluessel}
              onOpenChange={(auf) => setOffen(auf ? h.schluessel : null)}
              title={name(h)}
              content={(
                <div className={s.passend}>
                  {passend.length === 0 ? <span className={s.neben}>Keine offene Schicht frei.</span> : null}
                  {passend.slice(0, 8).map(({ sch, e, deckt }) => (
                    <Button key={sch.id} type="text" block style={{ ...UMBRECHEND, justifyContent: "space-between" }} onClick={() => { setOffen(null); zuteilen(sch.id, h.schluessel); }}>
                      <span>{einheitTitel(e)} <span className={s.neben}>{zeitspanne(sch.von, sch.bis, mehrtaegig)}</span></span>
                      {deckt ? <Chip ton="ok">passt</Chip> : null}
                    </Button>
                  ))}
                </div>
              )}
            >
              <div
                className={s.helferKarte}
                data-helfer={h.schluessel}
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                draggable
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOffen(h.schluessel); } }}
                onDragStart={(ev) => { setOffen(null); ev.dataTransfer.setData(ZIEHDATEN, h.schluessel); ev.dataTransfer.setData("text/plain", h.schluessel); ev.dataTransfer.effectAllowed = "copyMove"; }}
              >
                <div className={s.kartenZeile}>
                  <strong style={{ fontSize: 14 }}>{name(h)}</strong>
                  {k.length > 0 ? <Chip ton="rot" title={k.map((x0) => x0.text).join("\n")}>{k.length} Konflikt{k.length > 1 ? "e" : ""}</Chip> : dauer > 0 ? <Chip ton="grau">{stunden(dauer)}</Chip> : null}
                </div>
                <div className={s.kartenZeile}>
                  <QualiChips qualis={h.qualifikationen} />
                  {h.quelle === "temp" ? <Chip ton="temp">Temporär</Chip> : null}
                </div>
              </div>
            </Popover>
          );
        })}
        {liste.length === 0 ? <span className={s.neben}>{helfer.length === 0 ? "Im Helfer-Modul steht noch niemand." : "Niemand passt zu diesem Filter."}</span> : null}
      </div>
      <span className={s.neben}>{p.temporaere.length} temporäre Helfer in dieser Planung</span>
    </aside>
  );
}
