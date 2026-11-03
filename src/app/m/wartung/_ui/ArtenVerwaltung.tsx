"use client";

import { useState } from "react";
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { artLoeschenAction, artSpeichernAction } from "../_actions/verwaltung";
import { ART_IKONEN, KURZ_MAX, NOTIZ_MAX, PUNKT_MAX, type ArtEingabe } from "../_lib/eingabe";
import { intervallText, WER_TEXT, type Wer } from "../_lib/fristen";
import type { ArtDTO } from "../_lib/typen";
import { ArtZeichen, Kicker } from "./teile";
import { useAktion } from "./useAktion";
import s from "./wartung.module.css";

type Entwurf = ArtEingabe & { id: string | null };

const WER_WAHL = (Object.keys(WER_TEXT) as Wer[]).map((w) => ({ value: w, label: WER_TEXT[w] }));

function entwurfAus(a: ArtDTO | null): Entwurf {
  if (!a) {
    return {
      id: null, name: "", einzahl: "", ikone: "wrench", stundenPflicht: false,
      fristen: [{ id: null, name: "Quartalsprüfung", wer: "intern", monate: 3, stunden: null }],
      checkliste: [{ id: null, text: "Sichtprüfung", hinweis: "" }],
    };
  }
  return {
    id: a.id, name: a.name, einzahl: a.einzahl, ikone: a.ikone, stundenPflicht: a.stundenPflicht,
    fristen: a.fristen.map((f) => ({ id: f.id, name: f.name, wer: f.wer, monate: f.monate, stunden: f.stunden })),
    checkliste: a.checkliste.map((p) => ({ id: p.id, text: p.text, hinweis: p.hinweis })),
  };
}

/** Gerätearten mit Fristen und Checkliste; sie gelten für alle Gruppen. Bearbeitet wird im Dialog. */
export function ArtenVerwaltung({ arten }: { arten: ArtDTO[] }) {
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [e, setE] = useState<Entwurf | null>(null);
  const oeffne = (a: ArtDTO | null) => { setFeldFehler({}); setE(entwurfAus(a)); };
  const setze = (teil: Partial<Entwurf>) => setE((alt) => (alt ? { ...alt, ...teil } : alt));
  const fehler = (feld: string) => (feldFehler[feld] ? { validateStatus: "error" as const, help: feldFehler[feld] } : {});
  const verschiebe = (i: number, d: number) => {
    if (!e) return;
    const l = [...e.checkliste];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    setze({ checkliste: l });
  };

  return (
    <>
      <Seitenkopf
        titel="Gerätearten und Checklisten"
        aktionen={<Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => oeffne(null)}>Geräteart anlegen</Button>}
      />
      {arten.length === 0 && <p className={s.neben}>Noch keine Gerätearten.</p>}
      {arten.map((a) => (
        <Card
          key={a.id}
          title={<span className={s.reihe}><ArtZeichen ikone={a.ikone} /> {a.name} <span className={s.neben} style={{ fontWeight: 400 }}>· {a.geraete} {a.geraete === 1 ? "Gerät" : "Geräte"}</span></span>}
          extra={
            <span className={s.reihe}>
              <Button icon={<Icons8Ikone name="pencil" groesse={16} />} onClick={() => oeffne(a)}>Bearbeiten</Button>
              {a.geraete === 0 && (
                <Popconfirm title={`${a.name} löschen?`} okText="Löschen" okButtonProps={{ danger: true }} cancelText="Abbrechen"
                  onConfirm={() => fuehreAus(() => artLoeschenAction(a.id), "Gelöscht.")}>
                  <Button type="text" disabled={laeuft}>Löschen</Button>
                </Popconfirm>
              )}
            </span>
          }
        >
          <Kicker>Fristen</Kicker>
          <ul className={s.zeilen} style={{ marginBottom: 16 }}>
            {a.fristen.map((f) => (
              <li key={f.id} className={s.zeile}>
                <strong>{f.name}</strong> <span className={s.neben}>· {intervallText(f)} · {WER_TEXT[f.wer]}</span>
              </li>
            ))}
          </ul>
          {a.stundenPflicht && <p className={s.neben}>Betriebsstunden bei jeder Prüfung Pflicht.</p>}
          {a.checkliste.length > 0 && (
            <>
              <Kicker>Checkliste der Prüfung am Gerät</Kicker>
              <ol style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
                {a.checkliste.map((p) => <li key={p.id}>{p.text}</li>)}
              </ol>
            </>
          )}
        </Card>
      ))}

      <Modal
        open={e !== null}
        width={880}
        title={e?.id ? "Geräteart bearbeiten" : "Geräteart anlegen"}
        okText="Speichern"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onCancel={() => setE(null)}
        onOk={() => {
          if (!e) return;
          const { id, ...eingabe } = e;
          fuehreAus(() => artSpeichernAction(id, eingabe), "Gespeichert.", () => setE(null));
        }}
        destroyOnHidden
      >
        {e && (
          <Form layout="vertical" component="div">
            <Form.Item label="Name (Mehrzahl)" htmlFor="gw-art-name" {...fehler("name")}>
              <Input id="gw-art-name" autoFocus value={e.name} maxLength={KURZ_MAX} onChange={(x) => setze({ name: x.target.value })} />
            </Form.Item>
            <Form.Item label="Einzahl" htmlFor="gw-art-einzahl" {...fehler("einzahl")}>
              <Input id="gw-art-einzahl" value={e.einzahl} maxLength={KURZ_MAX} onChange={(x) => setze({ einzahl: x.target.value })} />
            </Form.Item>
            <Form.Item label="Zeichen" htmlFor="gw-art-ikone">
              <Select
                id="gw-art-ikone"
                value={e.ikone}
                onChange={(v) => setze({ ikone: v })}
                options={ART_IKONEN.map((i) => ({ value: i.name, label: <span className={s.reihe}><ArtZeichen ikone={i.name} groesse={16} /> {i.titel}</span> }))}
              />
            </Form.Item>
            <Form.Item label="Betriebsstunden bei jeder Prüfung Pflicht">
              <Switch checked={e.stundenPflicht} onChange={(v) => setze({ stundenPflicht: v })} aria-label="Betriebsstunden bei jeder Prüfung Pflicht" />
            </Form.Item>

            <Kicker>Fristen</Kicker>
            {feldFehler.fristen && <div className={s.textRot}>{feldFehler.fristen}</div>}
            {e.fristen.map((f, i) => {
              const setzeFrist = (teil: Partial<typeof f>) => setze({ fristen: e.fristen.map((x, j) => (j === i ? { ...x, ...teil } : x)) });
              return (
                <div key={f.id ?? `neu-${i}`} className={s.fristreihe}>
                  <Input value={f.name} maxLength={KURZ_MAX} onChange={(x) => setzeFrist({ name: x.target.value })} aria-label={`Frist ${i + 1}: Name`} status={feldFehler[`fristen.${i}.name`] ? "error" : undefined} />
                  <InputNumber value={f.monate ?? undefined} min={1} max={120} precision={0} suffix="Monate" onChange={(v) => setzeFrist({ monate: v ?? null })} aria-label={`Frist ${i + 1}: alle … Monate`} style={{ width: "100%" }} status={feldFehler[`fristen.${i}.monate`] ? "error" : undefined} />
                  <InputNumber value={f.stunden ?? undefined} min={1} precision={0} suffix="h" onChange={(v) => setzeFrist({ stunden: v ?? null })} aria-label={`Frist ${i + 1}: oder alle … Betriebsstunden`} style={{ width: "100%" }} />
                  <Select value={f.wer} options={WER_WAHL} onChange={(v) => setzeFrist({ wer: v })} aria-label={`Frist ${i + 1}: wer erledigt`} />
                  <Button type="text" aria-label={`Frist ${i + 1} entfernen`} disabled={e.fristen.length === 1} onClick={() => setze({ fristen: e.fristen.filter((_, j) => j !== i) })} icon={<Icons8Ikone name="trash" groesse={16} />} />
                </div>
              );
            })}
            <Button
              type="dashed"
              icon={<Icons8Ikone name="plus" groesse={16} />}
              style={{ margin: "8px 0 24px" }}
              onClick={() => setze({ fristen: [...e.fristen, { id: null, name: "", wer: "fachfirma", monate: 12, stunden: null }] })}
            >
              Frist hinzufügen
            </Button>

            <Kicker>Checkliste der Prüfung am Gerät</Kicker>
            {feldFehler.checkliste && <div className={s.textRot}>{feldFehler.checkliste}</div>}
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {e.checkliste.map((p, i) => {
                const setzePunkt = (teil: Partial<typeof p>) => setze({ checkliste: e.checkliste.map((x, j) => (j === i ? { ...x, ...teil } : x)) });
                return (
                  <li key={p.id ?? `neu-${i}`} className={s.punkt}>
                    <span className={s.nummer}>{i + 1}</span>
                    <div className={s.felder}>
                      <Input value={p.text} maxLength={PUNKT_MAX} onChange={(x) => setzePunkt({ text: x.target.value })} aria-label={`Punkt ${i + 1}`} status={feldFehler[`checkliste.${i}.text`] ? "error" : undefined} />
                      <Input.TextArea value={p.hinweis} maxLength={NOTIZ_MAX} autoSize={{ minRows: 1, maxRows: 4 }} placeholder="So geht’s" onChange={(x) => setzePunkt({ hinweis: x.target.value })} aria-label={`So geht Punkt ${i + 1}`} />
                    </div>
                    <div className={s.knoepfe}>
                      <Button type="text" aria-label={`Punkt ${i + 1} nach oben`} disabled={i === 0} onClick={() => verschiebe(i, -1)} icon={<Icons8Ikone name="arrow-up" groesse={16} />} />
                      <Button type="text" aria-label={`Punkt ${i + 1} nach unten`} disabled={i === e.checkliste.length - 1} onClick={() => verschiebe(i, 1)} icon={<Icons8Ikone name="arrow-down" groesse={16} />} />
                      <Button type="text" aria-label={`Punkt ${i + 1} entfernen`} onClick={() => setze({ checkliste: e.checkliste.filter((_, j) => j !== i) })} icon={<Icons8Ikone name="trash" groesse={16} />} />
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button
              type="dashed"
              icon={<Icons8Ikone name="plus" groesse={16} />}
              style={{ marginTop: 8 }}
              onClick={() => setze({ checkliste: [...e.checkliste, { id: null, text: "", hinweis: "" }] })}
            >
              Punkt hinzufügen
            </Button>
          </Form>
        )}
      </Modal>
    </>
  );
}
