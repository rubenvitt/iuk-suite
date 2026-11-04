"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Modal, Popconfirm } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachZahl } from "@/core/tabelle";
import { sperrzeitAnlegenAction, sperrzeitLoeschenAction } from "../../_actions/vermietung";
import { ueberlappt } from "../../_lib/belegung";
import { anfrageAlsEintrag, sperreAlsEintrag, type AnfrageDTO, type SperrzeitDTO } from "../../_lib/vermietungTypen";
import { zeitraumText } from "../../_lib/vermietungText";
import { zeitpunkt } from "../../_lib/zeit";
import { useEntscheidung } from "./Entscheidung";
import { Eintragsflyin } from "./Eintragsflyin";
import { useTokensAmBody } from "./teile";
import s from "./vermietung.module.css";

type Entwurf = { vonTag: string; vonUhr: string; bisTag: string; bisUhr: string; grund: string };

/** Der Zeitraum des Entwurfs, sobald er vollständig und sinnvoll ist — nur für die Vorschau; der Server rechnet selbst. */
function zeitraum(e: Entwurf): { von: number; bis: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.vonTag) || !/^\d{4}-\d{2}-\d{2}$/.test(e.bisTag) || !/^\d{2}:\d{2}$/.test(e.vonUhr) || !/^\d{2}:\d{2}$/.test(e.bisUhr)) return null;
  const von = zeitpunkt(e.vonTag, e.vonUhr);
  const bis = zeitpunkt(e.bisTag, e.bisUhr);
  return bis > von ? { von, bis } : null;
}

/**
 * Sperrzeiten der Bar: eigene (anlegen, löschen) und die aus Events mit „Bar belegen“ (nur Link zum Event). Beim
 * Anlegen zeigt der Dialog, welche Anfragen der Zeitraum trifft; liegt eine Zusage darin, geht Eintragen nicht.
 */
export function Sperrzeitenliste({ anfragen, sperren, heute }: { anfragen: AnfrageDTO[]; sperren: SperrzeitDTO[]; heute: string }) {
  useTokensAmBody();
  const { message } = App.useApp();
  const router = useRouter();
  const entscheidung = useEntscheidung();
  const leer: Entwurf = { vonTag: heute, vonUhr: "18:00", bisTag: heute, bisUhr: "23:00", grund: "" };
  const [neu, setNeu] = useState(false);
  const [e, setE] = useState<Entwurf>(leer);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [offenId, setOffenId] = useState<string | null>(null);
  const alle = useMemo(() => [...anfragen.map(anfrageAlsEintrag), ...sperren.map(sperreAlsEintrag)], [anfragen, sperren]);
  const offen = offenId ? alle.find((x) => x.id === offenId) ?? null : null;

  const z = zeitraum(e);
  const getroffen = z ? anfragen.filter((a) => (a.status === "zugesagt" || a.status === "angefragt") && ueberlappt(a, z)) : [];
  const zusageDrin = getroffen.some((a) => a.status === "zugesagt");

  const setFeld = (k: keyof Entwurf) => (ev: React.ChangeEvent<HTMLInputElement>) => setE((alt) => ({ ...alt, [k]: ev.target.value }));

  async function eintragen() {
    setLaeuft(true);
    setFeldFehler({});
    try {
      const r = await sperrzeitAnlegenAction(e);
      if (!r.ok) { setFeldFehler(r.feldFehler ?? { _: r.fehler }); return; }
      message.success("Sperrzeit eingetragen. Für Externe steht die Bar dann als belegt im Kalender.");
      setNeu(false);
      setE(leer);
      router.refresh();
    } finally {
      setLaeuft(false);
    }
  }

  async function loeschen(id: string) {
    const r = await sperrzeitLoeschenAction(id);
    if (!r.ok) { message.warning(r.fehler); return; }
    message.success("Sperrzeit gelöscht.");
    router.refresh();
  }

  const fehler = (k: string) => (feldFehler[k] ? <div className={s.neben} role="alert">{feldFehler[k]}</div> : null);

  return (
    <div className={s.modul}>
      <Seitenkopf titel="Sperrzeiten"
        aktionen={<Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => { setE(leer); setFeldFehler({}); setNeu(true); }}>Sperrzeit eintragen</Button>} />
      <Kartentabelle<SperrzeitDTO>
        rowKey="id"
        aria-label="Sperrzeiten der Bar"
        dataSource={sperren}
        leer={{ nichts: "Keine Sperrzeiten", figur: "gemeinschaft" }}
        columns={[
          { title: "Wann", key: "wann", sorter: nachZahl<SperrzeitDTO>((x) => x.von), defaultSortOrder: "ascend", render: (_: unknown, x: SperrzeitDTO) => zeitraumText(x.von, x.bis) },
          { title: "Grund", key: "grund", render: (_: unknown, x: SperrzeitDTO) => <Button type="link" style={{ paddingInline: 0, whiteSpace: "normal", textAlign: "start", height: "auto", minHeight: 44 }} onClick={() => setOffenId(x.id)}>{x.grund}</Button> },
          {
            title: "Aktion", key: "aktion",
            render: (_: unknown, x: SperrzeitDTO) => (x.eventId
              ? <Button href={`/v/${x.eventId}`}>Zum Event</Button>
              : (
                <Popconfirm title="Sperrzeit löschen?" okText="Löschen" cancelText="Abbrechen" onConfirm={() => loeschen(x.id)}>
                  <Button>Löschen</Button>
                </Popconfirm>
              )),
          },
        ]}
      />
      <Modal open={neu} title="Sperrzeit eintragen" okText="Eintragen" cancelText="Abbrechen" onCancel={() => setNeu(false)} onOk={eintragen} destroyOnHidden
        okButtonProps={{ disabled: !z || e.grund.trim().length < 3 || zusageDrin, loading: laeuft }}>
        <div className={s.details}>
          <div className={s.zeile} style={{ alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 150px" }}><div className={s.feldname}>Beginn</div><Input type="date" value={e.vonTag} onChange={setFeld("vonTag")} /></label>
            <label style={{ flex: "1 1 110px" }}><div className={s.feldname}>Uhrzeit</div><Input type="time" step={900} value={e.vonUhr} onChange={setFeld("vonUhr")} /></label>
          </div>
          {fehler("vonTag")}{fehler("vonUhr")}
          <div className={s.zeile} style={{ alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 150px" }}><div className={s.feldname}>Ende</div><Input type="date" value={e.bisTag} min={e.vonTag} onChange={setFeld("bisTag")} /></label>
            <label style={{ flex: "1 1 110px" }}><div className={s.feldname}>Uhrzeit</div><Input type="time" step={900} value={e.bisUhr} onChange={setFeld("bisUhr")} /></label>
          </div>
          {fehler("bisTag")}{fehler("bisUhr")}
          <label><div className={s.feldname}>Grund <span>(sieht nur die Verwaltung)</span></div>
            <Input value={e.grund} maxLength={120} onChange={setFeld("grund")} placeholder="Zum Beispiel Dienstabend, Blutspende, Wartung" />
          </label>
          {fehler("grund")}{fehler("_")}
          {getroffen.length > 0 ? (
            <div className={s.konflikt} data-testid="sperre-konflikt">
              {zusageDrin
                ? <span><b>Hier liegt schon eine Zusage.</b> Nimm sie zuerst zurück, damit die Person Bescheid bekommt:</span>
                : <span><b>Offene Anfragen in diesem Zeitraum.</b> Lehn sie danach mit Begründung ab:</span>}
              {getroffen.map((a) => (
                <div key={a.id}>
                  „{a.anlass}“ · {zeitraumText(a.von, a.bis)}{" "}
                  <Button type="link" style={{ paddingInline: 4 }} onClick={() => { setNeu(false); setOffenId(a.id); }}>Öffnen</Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
      <Eintragsflyin eintrag={offen} anfragen={anfragen} eintraege={alle} schliessen={() => setOffenId(null)} entscheidung={entscheidung} />
      {entscheidung.dialog}
    </div>
  );
}
