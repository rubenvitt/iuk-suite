"use client";

import { useState } from "react";
import { Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Select, Switch } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { fingerabdruck } from "@/core/entwurf/ablage";
import { serialisiere } from "@/core/entwurf/ablage";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { artLoeschenAction, artSpeichernAction } from "../_actions/verwaltung";
import { ART_IKONEN, KURZ_MAX, NOTIZ_MAX, PUNKT_MAX, type ArtEingabe } from "../_lib/eingabe";
import { intervallText, WER_TEXT } from "../_lib/fristen";
import type { ArtDTO, PruefartDTO } from "../_lib/typen";
import { ArtZeichen, Kicker } from "./teile";
import { useAktion } from "./useAktion";
import s from "./wartung.module.css";

type Entwurf = ArtEingabe & { id: string | null };

function entwurfAus(a: ArtDTO | null, katalog: readonly PruefartDTO[]): Entwurf {
  if (!a) {
    const selbst = katalog.find((p) => p.wer === "intern" && !p.anlass);
    return {
      id: null, name: "", einzahl: "", ikone: "wrench", stundenPflicht: false, kiste: false,
      pruefarten: selbst ? [selbst.id] : [],
      checkliste: [{ id: null, text: "Sichtprüfung", hinweis: "", pruefarten: [] }],
    };
  }
  return {
    id: a.id, name: a.name, einzahl: a.einzahl, ikone: a.ikone, stundenPflicht: a.stundenPflicht, kiste: a.kiste,
    pruefarten: [...a.pruefarten],
    checkliste: a.checkliste.map((p) => ({ id: p.id, text: p.text, hinweis: p.hinweis, pruefarten: p.pruefarten ?? [] })),
  };
}

/**
 * Gerätearten mit ihren Prüfarten aus dem Katalog (IDA-368) und der Checkliste; sie gelten für alle Gruppen.
 * Bearbeitet wird im Dialog. Hat die Art mehrere Prüfungen am Gerät, sagt jeder Punkt, zu welchen er gehört
 * (IDA-369); ohne Auswahl gehört er zu allen.
 */
export function ArtenVerwaltung({ arten, katalog }: { arten: ArtDTO[]; katalog: PruefartDTO[] }) {
  const nachId = new Map(katalog.map((p) => [p.id, p]));
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [e, setE] = useState<Entwurf | null>(null);
  const [ausgang, setAusgang] = useState<Entwurf | null>(null);
  const oeffne = (a: ArtDTO | null) => { setFeldFehler({}); const x = entwurfAus(a, katalog); setAusgang(x); setE(x); };
  /*
   * IDA-358: die Eingaben im Dialog liegen je Geräteart auf dem Gerät, bis das Speichern bestätigt ist; das
   * nächste Öffnen stellt sie wieder her. Abgelegt wird nur, was vom Stand beim Öffnen abweicht (`null` = nichts
   * geändert) — sonst stünde schon das bloße Öffnen als Entwurf da.
   */
  const geaendert = e && ausgang && serialisiere(e) !== serialisiere(ausgang) ? e : null;
  const entwurf = useEntwurf<Entwurf | null>({
    schluessel: e ? `wartung:art:${e.id ? `${e.id}:${fingerabdruck(ausgang)}` : "neu"}` : null,
    stand: geaendert,
    wiederherstellen: (w) => setE(w ?? ausgang),
  });
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
          <Kicker leise>Prüfarten</Kicker>
          <ul className={s.zeilen} style={{ marginBottom: 16 }}>
            {a.pruefarten.flatMap((id) => nachId.get(id) ?? []).map((f) => (
              <li key={f.id} className={s.zeile}>
                <strong>{f.name}</strong> <span className={s.neben}>· {intervallText(f)} · {WER_TEXT[f.wer]}</span>
              </li>
            ))}
          </ul>
          {a.stundenPflicht && <p className={s.neben}>Betriebsstunden bei jeder Prüfung Pflicht.</p>}
          {a.kiste && <p className={s.neben}>Materialkiste mit Inhaltsliste.</p>}
          {!a.kiste && a.checkliste.length > 0 && (
            <>
              <Kicker leise>Checkliste der Prüfung am Gerät</Kicker>
              <ol style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
                {a.checkliste.map((p) => (
                  <li key={p.id}>
                    {p.text}
                    {(p.pruefarten ?? []).length > 0 && (
                      <span className={s.neben}> · {(p.pruefarten ?? []).map((id) => nachId.get(id)?.name ?? "?").join(", ")}</span>
                    )}
                  </li>
                ))}
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
          fuehreAus(() => artSpeichernAction(id, eingabe), "Gespeichert.", () => { entwurf.verwerfen(); setE(null); });
        }}
        destroyOnHidden
      >
        {e && (
          <Form layout="vertical" component="div">
            <EntwurfHinweis entwurf={entwurf} />
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
            <Form.Item label="Betriebsstunden bei jeder Prüfung Pflicht" {...fehler("stundenPflicht")}>
              <Switch checked={e.stundenPflicht} disabled={e.kiste} onChange={(v) => setze({ stundenPflicht: v })} aria-label="Betriebsstunden bei jeder Prüfung Pflicht" />
            </Form.Item>
            <Form.Item label="Materialkiste mit Inhaltsliste">
              <Switch checked={e.kiste} onChange={(v) => setze(v ? { kiste: v, stundenPflicht: false } : { kiste: v })} aria-label="Materialkiste mit Inhaltsliste" />
            </Form.Item>

            <Kicker leise>Prüfarten</Kicker>
            {feldFehler.pruefarten && <div className={s.textRot}>{feldFehler.pruefarten}</div>}
            <Checkbox.Group
              className={s.haken}
              value={e.pruefarten}
              onChange={(v) => setze({ pruefarten: katalog.map((p) => p.id).filter((id) => (v as string[]).includes(id)) })}
              options={katalog.map((p) => ({
                value: p.id,
                label: <span>{p.name} <span className={s.neben}>· {intervallText(p)} · {WER_TEXT[p.wer]}</span></span>,
              }))}
            />
            {katalog.length === 0 && <p className={s.neben}>Noch keine Prüfarten.</p>}
            <div style={{ height: 24 }} />

            {!e.kiste && (
              <>
                <Kicker leise>Checkliste der Prüfung am Gerät</Kicker>
                {feldFehler.checkliste && <div className={s.textRot}>{feldFehler.checkliste}</div>}
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {e.checkliste.map((p, i) => {
                    // Zur Wahl stehen die Prüfungen am Gerät dieser Art und was der Punkt schon hat.
                    const wahl = katalog.filter((x) => x.wer === "intern" && (e.pruefarten.includes(x.id) || (p.pruefarten ?? []).includes(x.id)));
                    const setzePunkt = (teil: Partial<typeof p>) => setze({ checkliste: e.checkliste.map((x, j) => (j === i ? { ...x, ...teil } : x)) });
                    return (
                      <li key={p.id ?? `neu-${i}`} className={s.punkt}>
                        <span className={s.nummer}>{i + 1}</span>
                        <div className={s.felder}>
                          <Input value={p.text} maxLength={PUNKT_MAX} onChange={(x) => setzePunkt({ text: x.target.value })} aria-label={`Punkt ${i + 1}`} status={feldFehler[`checkliste.${i}.text`] ? "error" : undefined} />
                          <Input.TextArea value={p.hinweis} maxLength={NOTIZ_MAX} autoSize={{ minRows: 1, maxRows: 4 }} placeholder="So geht’s" onChange={(x) => setzePunkt({ hinweis: x.target.value })} aria-label={`So geht Punkt ${i + 1}`} />
                          {(wahl.length > 1 || (p.pruefarten ?? []).length > 0) && (
                            <Select
                              mode="multiple"
                              value={p.pruefarten ?? []}
                              placeholder="Bei jeder Prüfung"
                              aria-label={`Punkt ${i + 1} gilt für`}
                              options={wahl.map((x) => ({ value: x.id, label: x.name }))}
                              onChange={(v: string[]) => setzePunkt({ pruefarten: katalog.map((x) => x.id).filter((id) => v.includes(id)) })}
                            />
                          )}
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
                  onClick={() => setze({ checkliste: [...e.checkliste, { id: null, text: "", hinweis: "", pruefarten: [] }] })}
                >
                  Punkt hinzufügen
                </Button>
              </>
            )}
          </Form>
        )}
      </Modal>
    </>
  );
}
