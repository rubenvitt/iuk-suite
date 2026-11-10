"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Button, Drawer, Popconfirm, Tabs } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { flyinBreite } from "@/core/theme/flyin";
import {
  austragenAction, einheitEntfernenAction, einheitVerschiebenAction, planungLoeschenAction, schichtAnlegenAction,
  schichtLoeschenAction, schichtSetzenAction, tempHelferLoeschenAction, zuteilenAction,
} from "../_actions/planung";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { tempAlsPlanHelfer } from "../_lib/planHelfer";
import { pruefe } from "../_lib/pruefung";
import { qualiKatalog } from "../_lib/qualis";
import type { FahrzeugWahl, HelferQuelle, PlanHelfer, PlanungDTO } from "../_lib/typen";
import { MINUTE } from "../_lib/typen";
import { stunden, zeitspanne } from "../_lib/zeit";
import { AusgabeAnsicht, HelferAnsicht, PruefAnsicht } from "./ansichten";
import { EinheitFormular, PlanungFormular, TempFormular } from "./formulare";
import { Raster, type RasterAktionen } from "./Raster";
import { SchichtInhalt } from "./SchichtFlyin";
import s from "./schichtplan.module.css";
import { einheitTitel, KpiReihe, name } from "./teile";
import { useTokensAmBody } from "./useTokensAmBody";

type Ansicht = "raster" | "helfer" | "pruefen" | "ausgabe";
const ANSICHTEN: readonly Ansicht[] = ["raster", "helfer", "pruefen", "ausgabe"];
/** Falle 24: kein Fokus beim Öffnen in den Container, keine Fokus-Rückgabe beim Schließen. */
const FLYIN = { destroyOnHidden: true, autoFocus: false, focusable: { focusTriggerAfterClose: false } } as const;

function teile(k: string): { quelle: HelferQuelle; helferId: string } {
  const i = k.indexOf(":");
  return { quelle: k.slice(0, i) as HelferQuelle, helferId: k.slice(i + 1) };
}

/**
 * Der Editor einer Planung. Jede Änderung zeichnet sofort (optimistisch) und ersetzt den Stand danach
 * durch die Antwort des Servers; scheitert sie, kehrt der letzte bestätigte Stand zurück. Die Prüfregeln
 * laufen live im Browser — dieselbe Funktion wie in der Übersicht.
 */
export function PlanEditor({ start, stamm, fahrzeuge, darfLoeschen, jetzt }: {
  start: PlanungDTO; stamm: PlanHelfer[]; fahrzeuge: FahrzeugWahl[]; darfLoeschen: boolean; jetzt: number;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  useTokensAmBody();
  const suche = useSearchParams();
  const [p, setP] = useState(start);
  const [ansicht, setAnsichtState] = useState<Ansicht>(() => {
    const a = suche.get("ansicht");
    return ANSICHTEN.includes(a as Ansicht) ? (a as Ansicht) : "raster";
  });
  const [schichtId, setSchichtId] = useState<string | null>(null);
  const [einheitFlyin, setEinheitFlyin] = useState<string | "neu" | null>(null);
  const [planungFlyin, setPlanungFlyin] = useState(false);
  const [tempFlyin, setTempFlyin] = useState<string | "neu" | null>(null);
  const bestaetigt = useRef(start);
  const laufend = useRef(0);

  // Nach jedem Speichern rendert der Server die Seite neu (`revalidatePath`) und reicht den frischen Stand.
  useEffect(() => { uebernimm(start); }, [start]);

  const helfer = useMemo(() => [...stamm, ...tempAlsPlanHelfer(p.temporaere)], [stamm, p.temporaere]);
  const a = useMemo(() => pruefe(p, helfer), [p, helfer]);
  const katalog = useMemo(
    () => qualiKatalog([...helfer.flatMap((h) => h.qualifikationen), ...p.einheiten.flatMap((e) => e.anforderungen.map((x) => x.quali))]),
    [helfer, p.einheiten],
  );

  function setAnsicht(neu: Ansicht) {
    setAnsichtState(neu);
    const url = new URL(window.location.href);
    if (neu === "raster") url.searchParams.delete("ansicht"); else url.searchParams.set("ansicht", neu);
    window.history.replaceState(window.history.state, "", url);
  }

  /** Vom Server bestätigt: übernehmen, sobald keine Änderung mehr unterwegs ist. */
  function uebernimm(neu: PlanungDTO) {
    bestaetigt.current = neu;
    if (laufend.current === 0) setP(neu);
  }

  /** Liefert den bestätigten Stand, oder `null`, wenn die Änderung nicht durchging. */
  function aendere(optimistisch: (q: PlanungDTO) => PlanungDTO, aufruf: () => Promise<ActionErgebnis<PlanungDTO>>): Promise<PlanungDTO | null> {
    setP(optimistisch);
    laufend.current++;
    return aufruf()
      .then((r) => {
        if (r.ok) { bestaetigt.current = r.wert; return r.wert; }
        void message.warning(r.fehler);
        return null;
      })
      .catch(() => { void message.warning("Die Änderung ging nicht durch. Bitte die Seite neu laden."); return null; })
      .finally(() => { laufend.current--; if (laufend.current === 0) setP(bestaetigt.current); });
  }

  /** IDA-385: Jede Änderung per Ziehen meldet sich und lässt sich mit einem Klick zurücknehmen. */
  // Je Gegenstand (Schicht oder Person) gilt nur die letzte Meldung: eine neuere Änderung ersetzt oder
  // schließt sie, sonst stellte ein veraltetes „Rückgängig“ einen Stand her, den es so nie gab.
  // Ein Zähler je Gegenstand erkennt auch eine Bestätigung, die erst nach einer neueren Änderung eintrifft.
  const meldung = (gegenstand: string) => `rueckgaengig-${gegenstand}`;
  const fassungen = useRef(new Map<string, number>());
  const fassung = (gegenstand: string) => fassungen.current.get(gegenstand) ?? 0;
  function beruehre(gegenstand: string) {
    fassungen.current.set(gegenstand, fassung(gegenstand) + 1);
    message.destroy(meldung(gegenstand));
  }
  /** Zeigt die Meldung nur, wenn seit `stand` nichts mehr an `gegenstand` geändert wurde. */
  function meldeMitRueckgaengig(gegenstand: string, stand: number, text: string, zurueck: () => void) {
    if (fassung(gegenstand) !== stand) return;
    const key = meldung(gegenstand);
    void message.open({
      key, type: "success", duration: 8,
      content: (
        <span className={s.meldung}>
          {text}
          <Button type="link" style={{ paddingInline: 4, height: "auto" }} onClick={() => { message.destroy(key); zurueck(); }}>Rückgängig</Button>
        </span>
      ),
    });
  }

  const aktionen = {
    zuteilen: (sid: string, k: string, aus?: string) => {
      const { quelle, helferId } = teile(k);
      beruehre(k);
      return aendere(
        (q) => ({
          ...q,
          zuordnungen: [
            ...q.zuordnungen.filter((z) => !(z.quelle === quelle && z.helferId === helferId && (z.schichtId === sid || z.schichtId === aus))),
            { schichtId: sid, quelle, helferId },
          ],
        }),
        () => zuteilenAction(p.id, { schichtId: sid, quelle, helferId, ...(aus ? { ausSchichtId: aus } : {}) }),
      );
    },
    austragen: (sid: string, k: string) => {
      const { quelle, helferId } = teile(k);
      beruehre(k);
      return aendere(
        (q) => ({ ...q, zuordnungen: q.zuordnungen.filter((z) => !(z.schichtId === sid && z.quelle === quelle && z.helferId === helferId)) }),
        () => austragenAction(p.id, { schichtId: sid, quelle, helferId }),
      );
    },
    schichtSetzen: (sid: string, von: number, bis: number, einheitId?: string) => {
      beruehre(sid);
      return aendere(
        (q) => ({ ...q, schichten: q.schichten.map((x) => (x.id === sid ? { ...x, von, bis, einheitId: einheitId ?? x.einheitId } : x)) }),
        () => schichtSetzenAction(p.id, sid, { von, bis }, einheitId),
      );
    },
    /** Liefert die Kennung der neuen Schicht, oder `null`, wenn sie nicht angelegt wurde. */
    schichtAnlegen: async (einheitId: string, von: number, bis: number): Promise<string | null> => {
      let neu: string | null = null;
      await aendere(
        (q) => ({ ...q, schichten: [...q.schichten, { id: `entwurf-${von}-${einheitId}`, einheitId, von, bis }] }),
        () => schichtAnlegenAction(p.id, einheitId, { von, bis }).then((r) => {
          if (!r.ok) return r;
          neu = r.wert.schichtId;
          return { ok: true as const, wert: r.wert.planung };
        }),
      );
      return neu;
    },
    schichtLoeschen: (sid: string) => {
      beruehre(sid);
      return aendere(
        (q) => ({ ...q, schichten: q.schichten.filter((x) => x.id !== sid), zuordnungen: q.zuordnungen.filter((z) => z.schichtId !== sid) }),
        () => schichtLoeschenAction(p.id, sid),
      );
    },
  };

  // Was das Raster per Ziehen auslöst, mit Meldung und „Rückgängig“; Flyin und Knöpfe nehmen `aktionen`.
  const einheitVon = (sid: string) => p.einheiten.find((e) => e.id === p.schichten.find((x) => x.id === sid)?.einheitId);
  const rasterAktionen: RasterAktionen = {
    zuteilen: (sid, k, aus) => {
      const sch = p.schichten.find((x) => x.id === sid);
      const h = helfer.find((x) => x.schluessel === k);
      const zug = aktionen.zuteilen(sid, k, aus);
      const stand = fassung(k);
      void zug.then((ok) => {
        if (!ok || !sch || !h) return;
        meldeMitRueckgaengig(
          k, stand, `${name(h)} eingeteilt: ${einheitVon(sid)?.name ?? ""} ${zeitspanne(sch.von, sch.bis)}`,
          () => void (aus ? aktionen.zuteilen(aus, k, sid) : aktionen.austragen(sid, k)),
        );
      });
    },
    schichtSetzen: (sid, von, bis, einheitId) => {
      const alt = p.schichten.find((x) => x.id === sid);
      const wohin = einheitId ? ` · ${p.einheiten.find((e) => e.id === einheitId)?.name ?? ""}` : "";
      const zug = aktionen.schichtSetzen(sid, von, bis, einheitId);
      const stand = fassung(sid);
      void zug.then((ok) => {
        if (!ok || !alt) return;
        meldeMitRueckgaengig(
          sid, stand, `${bis - von === alt.bis - alt.von ? "Verschoben auf" : "Geändert auf"} ${zeitspanne(von, bis)}${wohin}`,
          () => void aktionen.schichtSetzen(alt.id, alt.von, alt.bis, einheitId ? alt.einheitId : undefined),
        );
      });
    },
    schichtAnlegen: (einheitId, von, bis) => {
      void aktionen.schichtAnlegen(einheitId, von, bis).then((id) => {
        if (id) meldeMitRueckgaengig(id, fassung(id), `Schicht ${zeitspanne(von, bis)} angelegt`, () => void aktionen.schichtLoeschen(id));
      });
    },
  };

  const offeneSchicht = schichtId ? p.schichten.find((x) => x.id === schichtId) ?? null : null;
  const offeneEinheit = offeneSchicht ? p.einheiten.find((e) => e.id === offeneSchicht.einheitId) ?? null : null;
  const bearbeitete = einheitFlyin && einheitFlyin !== "neu" ? p.einheiten.find((e) => e.id === einheitFlyin) ?? null : null;
  const einteilungenIn = (eid: string) => {
    const ids = new Set(p.schichten.filter((x) => x.einheitId === eid).map((x) => x.id));
    return p.zuordnungen.filter((z) => ids.has(z.schichtId)).length;
  };
  const temp = tempFlyin && tempFlyin !== "neu" ? p.temporaere.find((t) => t.id === tempFlyin) ?? null : null;

  async function loeschen() {
    const r = await planungLoeschenAction(p.id).catch(() => null);
    if (r?.ok) router.push("/");
    else void message.warning(r?.fehler ?? "Die Planung ließ sich nicht löschen.");
  }

  const regeln = `höchstens ${stunden(p.maxDienstMin * MINUTE)} im Dienst, ${stunden(p.minRuheMin * MINUTE)} Ruhe`;

  return (
    <div className={s.modul}>
      <Seitenkopf
        titel={p.name}
        zurueck={{ titel: "Planungen", href: "/" }}
        beschreibung={`${p.art === "lage" ? "Lage" : "Veranstaltung"} · ${zeitspanne(p.von, p.bis, true)} · ${p.ort || "Ort offen"} · ${regeln}`}
        aktionen={(
          <>
            <Button onClick={() => setPlanungFlyin(true)} icon={<Icons8Ikone name="settings" groesse={16} />}>Planung bearbeiten</Button>
            {darfLoeschen ? (
              <Popconfirm title="Planung löschen?" description="Alle Schichten und Einteilungen fallen weg." okText="Löschen" cancelText="Abbrechen" onConfirm={() => void loeschen()}>
                <Button icon={<Icons8Ikone name="trash" groesse={16} />}>Löschen</Button>
              </Popconfirm>
            ) : null}
          </>
        )}
      />
      <Tabs
        activeKey={ansicht}
        onChange={(k) => setAnsicht(k as Ansicht)}
        items={[
          {
            key: "raster", label: "Schichtraster",
            children: (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <KpiReihe a={a} p={p} />
                <Raster p={p} a={a} helfer={helfer} katalog={katalog} aktionen={rasterAktionen} oeffneSchicht={setSchichtId} bearbeiteEinheit={setEinheitFlyin} />
              </div>
            ),
          },
          {
            key: "helfer", label: "Helfer",
            children: (
              <HelferAnsicht
                p={p} a={a} helfer={helfer}
                neuTemp={() => setTempFlyin("neu")}
                bearbeiteTemp={setTempFlyin}
                entferneTemp={(id) => aendere(
                  (q) => ({ ...q, temporaere: q.temporaere.filter((t) => t.id !== id), zuordnungen: q.zuordnungen.filter((z) => !(z.quelle === "temp" && z.helferId === id)) }),
                  () => tempHelferLoeschenAction(p.id, id),
                )}
              />
            ),
          },
          {
            key: "pruefen", label: a.konflikte.length ? `Prüfen (${a.konflikte.length})` : "Prüfen",
            children: <PruefAnsicht p={p} a={a} zurSchicht={(id) => { setAnsicht("raster"); setSchichtId(id); }} />,
          },
          { key: "ausgabe", label: "Ausgabe", children: <AusgabeAnsicht p={p} a={a} helfer={helfer} jetzt={jetzt} /> },
        ]}
      />

      <Drawer
        open={!!offeneSchicht}
        onClose={() => setSchichtId(null)}
        size={flyinBreite(520)}
        title={offeneSchicht && offeneEinheit ? `${einheitTitel(offeneEinheit)}, ${zeitspanne(offeneSchicht.von, offeneSchicht.bis, true)}` : ""}
        {...FLYIN}
      >
        {offeneSchicht && offeneEinheit ? (
          <SchichtInhalt p={p} a={a} helfer={helfer} sch={offeneSchicht} e={offeneEinheit} aktionen={aktionen} onGeloescht={() => setSchichtId(null)} />
        ) : null}
      </Drawer>

      <Drawer
        open={einheitFlyin !== null}
        onClose={() => setEinheitFlyin(null)}
        size={flyinBreite(520)}
        title={bearbeitete ? `${einheitTitel(bearbeitete)} bearbeiten` : "Abschnitt oder Fahrzeug hinzufügen"}
        {...FLYIN}
      >
        {einheitFlyin !== null ? (
          <>
            <EinheitFormular
              planId={p.id} einheit={bearbeitete} fahrzeuge={fahrzeuge} katalog={katalog}
              einteilungen={bearbeitete ? einteilungenIn(bearbeitete.id) : 0}
              onPlanung={(neu) => { uebernimm(neu); setEinheitFlyin(null); }}
            />
            {bearbeitete ? (
              <div className={s.zeile} style={{ marginBlockStart: 24 }}>
                <Button disabled={bearbeitete.position === p.einheiten[0]?.position} onClick={() => aendere((q) => q, () => einheitVerschiebenAction(p.id, bearbeitete.id, -1))} icon={<Icons8Ikone name="arrow-up" groesse={16} />}>Nach oben</Button>
                <Button disabled={bearbeitete.position === p.einheiten.at(-1)?.position} onClick={() => aendere((q) => q, () => einheitVerschiebenAction(p.id, bearbeitete.id, 1))} icon={<Icons8Ikone name="arrow-down" groesse={16} />}>Nach unten</Button>
                <Popconfirm
                  title={`${bearbeitete.name} entfernen?`} description="Alle Schichten und Einteilungen dieser Zeile fallen weg." okText="Entfernen" cancelText="Abbrechen"
                  onConfirm={() => {
                    const id = bearbeitete.id;
                    setEinheitFlyin(null);
                    aendere((q) => ({ ...q, einheiten: q.einheiten.filter((e) => e.id !== id), schichten: q.schichten.filter((x) => x.einheitId !== id) }), () => einheitEntfernenAction(p.id, id));
                  }}
                >
                  <Button icon={<Icons8Ikone name="trash" groesse={16} />}>Entfernen</Button>
                </Popconfirm>
              </div>
            ) : null}
          </>
        ) : null}
      </Drawer>

      <Drawer open={planungFlyin} onClose={() => setPlanungFlyin(false)} size={flyinBreite(560)} title="Planung bearbeiten" {...FLYIN}>
        {planungFlyin ? (
          <PlanungFormular
            planung={p} fahrzeuge={fahrzeuge}
            onGespeichert={() => { setPlanungFlyin(false); router.refresh(); }}
          />
        ) : null}
      </Drawer>

      <Drawer open={tempFlyin !== null} onClose={() => setTempFlyin(null)} size={flyinBreite(480)} title={temp ? "Temporären Helfer bearbeiten" : "Temporären Helfer anlegen"} {...FLYIN}>
        {tempFlyin !== null ? <TempFormular planId={p.id} helfer={temp} katalog={katalog} onPlanung={(neu) => { uebernimm(neu); setTempFlyin(null); }} /> : null}
      </Drawer>
    </div>
  );
}
