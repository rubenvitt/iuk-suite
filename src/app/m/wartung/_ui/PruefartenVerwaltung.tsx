"use client";

import { useState } from "react";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Tag } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle } from "@/core/tabelle";
import { pruefartLoeschenAction, pruefartSpeichernAction, pruefartVerschiebenAction } from "../_actions/verwaltung";
import { KURZ_MAX, type PruefartEingabe } from "../_lib/eingabe";
import { intervallText, WER_TEXT, type Wer } from "../_lib/fristen";
import type { PruefartDTO } from "../_lib/typen";
import { useAktion } from "./useAktion";
import s from "./wartung.module.css";

type Entwurf = PruefartEingabe & { id: string | null };

const WER_WAHL = (Object.keys(WER_TEXT) as Wer[]).map((w) => ({ value: w, label: WER_TEXT[w] }));

/**
 * Der Katalog der Prüfarten (IDA-368): jede steht einmal da, mit Wer und Intervall. Die Gerätearten schalten sie
 * zu, ein Gerät weicht davon ab. Eine Änderung hier gilt an jedem Gerät, das kein eigenes Intervall hat.
 */
export function PruefartenVerwaltung({ pruefarten, artNamen }: { pruefarten: PruefartDTO[]; artNamen: Record<string, string> }) {
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [e, setE] = useState<Entwurf | null>(null);
  const oeffne = (x: Entwurf) => { setFeldFehler({}); setE(x); };
  const setze = (teil: Partial<Entwurf>) => setE((alt) => (alt ? { ...alt, ...teil } : alt));
  const fehler = (feld: string) => (feldFehler[feld] ? { validateStatus: "error" as const, help: feldFehler[feld] } : {});

  return (
    <>
      <Seitenkopf
        titel="Prüfarten"
        aktionen={
          <Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />}
            onClick={() => oeffne({ id: null, name: "", wer: "fachfirma", monate: 12, stunden: null })}>
            Prüfart anlegen
          </Button>
        }
      />
      <Kartentabelle<PruefartDTO>
        rowKey="id"
        aria-label="Prüfarten"
        dataSource={pruefarten}
        leer={{ nichts: "Noch keine Prüfarten", figur: "wartung" }}
        karte={{ titel: "name", aktionen: "aktion" }}
        columns={[
          {
            title: "Prüfart", key: "name",
            render: (_: unknown, p: PruefartDTO) => <><strong>{p.name}</strong><div className={s.neben}>{WER_TEXT[p.wer]}</div></>,
          },
          { title: "Intervall", key: "intervall", width: 200, render: (_: unknown, p: PruefartDTO) => intervallText(p) },
          {
            title: "Gerätearten", key: "arten", width: 260,
            render: (_: unknown, p: PruefartDTO) => p.arten.length === 0 ? "–" : (
              <Space size={[4, 4]} wrap>{p.arten.map((a) => <Tag key={a}>{artNamen[a] ?? "?"}</Tag>)}</Space>
            ),
          },
          { title: "Geräte", key: "geraete", align: "right", render: (_: unknown, p: PruefartDTO) => p.geraete },
          {
            title: "Aktionen", key: "aktion",
            render: (_: unknown, p: PruefartDTO) => {
              const i = pruefarten.findIndex((x) => x.id === p.id);
              return (
                <div className={s.pfeile}>
                  <Button aria-label={`${p.name} bearbeiten`} icon={<Icons8Ikone name="pencil" groesse={16} />}
                    onClick={() => oeffne({ id: p.id, name: p.name, wer: p.wer, monate: p.monate, stunden: p.stunden })} />
                  <Button type="text" aria-label={`${p.name} nach oben`} disabled={laeuft || i === 0}
                    onClick={() => fuehreAus(() => pruefartVerschiebenAction(p.id, -1), "Verschoben.")} icon={<Icons8Ikone name="arrow-up" groesse={16} />} />
                  <Button type="text" aria-label={`${p.name} nach unten`} disabled={laeuft || i === pruefarten.length - 1}
                    onClick={() => fuehreAus(() => pruefartVerschiebenAction(p.id, 1), "Verschoben.")} icon={<Icons8Ikone name="arrow-down" groesse={16} />} />
                </div>
              );
            },
          },
        ]}
      />

      <Modal
        open={e !== null}
        title={e?.id ? "Prüfart bearbeiten" : "Prüfart anlegen"}
        okText="Speichern"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onCancel={() => setE(null)}
        onOk={() => {
          if (!e) return;
          const { id, ...eingabe } = e;
          fuehreAus(() => pruefartSpeichernAction(id, eingabe), "Gespeichert.", () => setE(null));
        }}
        destroyOnHidden
        footer={(_, { OkBtn, CancelBtn }) => {
          const p = e?.id ? pruefarten.find((x) => x.id === e.id) : undefined;
          return (
            <div className={s.dialogFuss}>
              {p ? (
                <Popconfirm
                  title={`${p.name} löschen?`}
                  description={p.geraete > 0 ? `Gilt an ${p.geraete} ${p.geraete === 1 ? "Gerät" : "Geräten"}. Der Verlauf bleibt.` : undefined}
                  okText="Löschen" okButtonProps={{ danger: true }} cancelText="Abbrechen"
                  onConfirm={() => fuehreAus(() => pruefartLoeschenAction(p.id), "Gelöscht.", () => setE(null))}>
                  <Button type="text" danger disabled={laeuft}>Löschen</Button>
                </Popconfirm>
              ) : <span />}
              <Space><CancelBtn /><OkBtn /></Space>
            </div>
          );
        }}
      >
        {e && (
          <Form layout="vertical" component="div">
            <Form.Item label="Name" htmlFor="gw-pa-name" {...fehler("name")}>
              <Input id="gw-pa-name" autoFocus value={e.name} maxLength={KURZ_MAX} onChange={(x) => setze({ name: x.target.value })} />
            </Form.Item>
            <Form.Item label="Wer" htmlFor="gw-pa-wer" {...fehler("wer")}>
              <Select id="gw-pa-wer" value={e.wer} options={WER_WAHL} onChange={(v) => setze({ wer: v })} />
            </Form.Item>
            <Form.Item label="Alle … Monate" htmlFor="gw-pa-monate" {...fehler("monate")}>
              <InputNumber id="gw-pa-monate" value={e.monate ?? undefined} min={1} max={120} precision={0} suffix="Monate"
                onChange={(v) => setze({ monate: v ?? null })} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="Oder alle … Betriebsstunden" htmlFor="gw-pa-stunden" {...fehler("stunden")}>
              <InputNumber id="gw-pa-stunden" value={e.stunden ?? undefined} min={1} precision={0} suffix="h"
                onChange={(v) => setze({ stunden: v ?? null })} style={{ width: "100%" }} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
}
