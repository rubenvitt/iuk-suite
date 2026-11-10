"use client";

import { useState } from "react";
import { App, Button, Form, Input, Modal, Popconfirm, Select } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle } from "@/core/tabelle";
import { linkAnlegenAction, linkSperrenAction } from "../_actions/verwaltung";
import { zeitText } from "../_lib/heute";
import type { LinkZeile } from "../_lib/typen";
import { Chip } from "./teile";
import { useAktion } from "./useAktion";
import s from "./verpflegung.module.css";

/** Ein Link pro Anlass: für einen Abend reicht ein halber Tag, für ein Wochenende drei Tage. */
const DAUERN = [
  { value: 4, label: "4 Stunden" },
  { value: 12, label: "12 Stunden" },
  { value: 24, label: "1 Tag" },
  { value: 72, label: "3 Tage" },
  { value: 168, label: "1 Woche" },
];

interface Werte { name: string; stunden: number }

const STAND: Record<LinkZeile["stand"], { farbe: "ok" | "grau" | "rot"; text: string }> = {
  aktiv: { farbe: "ok", text: "aktiv" },
  abgelaufen: { farbe: "grau", text: "abgelaufen" },
  gesperrt: { farbe: "rot", text: "gesperrt" },
};

/**
 * Helfer-Links: wer den Link oder QR hat, bucht am Telefon ohne Konto, bis der Link abläuft oder gesperrt wird.
 * Adresse und QR stehen nur an aktiven Links.
 */
export function LinksVerwaltung({ links }: { links: LinkZeile[] }) {
  const { message } = App.useApp();
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [anlegen, setAnlegen] = useState(false);
  const [zeige, setZeige] = useState<string | null>(null);
  const [form] = Form.useForm<Werte>();
  const gezeigt = links.find((l) => l.id === zeige && l.adresse) ?? null;

  const kopiere = async (adresse: string) => {
    try {
      await navigator.clipboard.writeText(adresse);
      message.success("Link kopiert.");
    } catch {
      message.error("Kopieren ging nicht. Bitte den Link markieren und kopieren.");
    }
  };

  return (
    <>
      <Seitenkopf
        titel="Zugangscodes"
        aktionen={
          <Button
            type="primary"
            icon={<Icons8Ikone name="plus" groesse={16} />}
            onClick={() => { setFeldFehler({}); form.setFieldsValue({ name: "", stunden: 12 }); setAnlegen(true); }}
          >
            Zugangscode anlegen
          </Button>
        }
      />
      <Kartentabelle<LinkZeile>
        rowKey="id"
        aria-label="Zugangscodes"
        dataSource={links}
        leer={{ nichts: "Noch keine Zugangscodes", figur: "verpflegung" }}
        karte={{ titel: "name", kennzeichen: ["stand"] }}
        columns={[
          { title: "Bezeichnung", key: "name", render: (_: unknown, l: LinkZeile) => <strong>{l.name}</strong> },
          { title: "Zustand", key: "stand", render: (_: unknown, l: LinkZeile) => <Chip farbe={STAND[l.stand].farbe}>{STAND[l.stand].text}</Chip> },
          { title: "Gültig bis", key: "gueltigBis", render: (_: unknown, l: LinkZeile) => <span className={s.ziffern}>{zeitText(l.gueltigBis)}</span> },
          { title: "Zuletzt benutzt", key: "zuletzt", render: (_: unknown, l: LinkZeile) => <span className={s.ziffern}>{l.zuletztAm ? zeitText(l.zuletztAm) : "—"}</span> },
          { title: "Angelegt", key: "angelegt", render: (_: unknown, l: LinkZeile) => <span className={s.neben}>{zeitText(l.angelegtAm)} · {l.angelegtVon}</span> },
          {
            title: "Aktionen", key: "aktion",
            render: (_: unknown, l: LinkZeile) => l.stand !== "aktiv" ? null : (
              <span className={s.reihe}>
                <Button onClick={() => setZeige(l.id)}>QR zeigen</Button>
                <Popconfirm title="Zugangscode sperren?" okText="Sperren" cancelText="Abbrechen" onConfirm={() => fuehreAus(() => linkSperrenAction(l.id), "Gesperrt.")}>
                  <Button disabled={laeuft}>Sperren</Button>
                </Popconfirm>
              </span>
            ),
          },
        ]}
      />
      <Modal
        open={anlegen}
        title="Zugangscode anlegen"
        okText="Anlegen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onOk={() => form.submit()}
        onCancel={() => setAnlegen(false)}
        forceRender
      >
        <Form<Werte>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(w) => fuehreAus(() => linkAnlegenAction(w), "Zugangscode angelegt.", (r) => { setAnlegen(false); if (r.id) setZeige(r.id); })}
        >
          <Form.Item
            name="name"
            label="Bezeichnung"
            rules={[{ required: true, message: "Bitte ausfüllen." }]}
            {...(feldFehler.name ? { validateStatus: "error" as const, help: feldFehler.name } : {})}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="stunden" label="Gültig für">
            <Select options={DAUERN} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={gezeigt !== null}
        title={gezeigt?.name}
        footer={gezeigt ? <Button type="primary" onClick={() => kopiere(gezeigt.adresse!)}>Link kopieren</Button> : null}
        onCancel={() => setZeige(null)}
      >
        {gezeigt && (
          <div className={s.stapel} style={{ justifyItems: "center", textAlign: "center" }}>
            <div className={s.qr} style={{ width: 220, height: 220 }} dangerouslySetInnerHTML={{ __html: gezeigt.qr ?? "" }} />
            <span className={`${s.mono} ${s.linkfeld}`} data-rolle="helfer-adresse">{gezeigt.adresse}</span>
            <span className={s.neben}>Gültig bis {zeitText(gezeigt.gueltigBis)}</span>
          </div>
        )}
      </Modal>
    </>
  );
}
