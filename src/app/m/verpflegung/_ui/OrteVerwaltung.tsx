"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Form, Input, Modal, Switch } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle } from "@/core/tabelle";
import { ortAendernAction, ortAktivAction, ortAnlegenAction } from "../_actions/verwaltung";
import type { OrtDTO } from "../_lib/typen";
import { Chip } from "./teile";
import { useAktion } from "./useAktion";
import s from "./verpflegung.module.css";

interface Werte { name: string; kurz: string; gekuehlt: boolean }

/** Lagerorte: Name, Kürzel fürs Etikett, gekühlt ja/nein. Ein Ort mit Ware lässt sich nicht deaktivieren. */
export function OrteVerwaltung({ orte }: { orte: OrtDTO[] }) {
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [offen, setOffen] = useState<OrtDTO | "neu" | null>(null);
  const [form] = Form.useForm<Werte>();
  const oeffne = (o: OrtDTO | "neu") => {
    setFeldFehler({});
    form.setFieldsValue(o === "neu" ? { name: "", kurz: "", gekuehlt: false } : { name: o.name, kurz: o.kurz, gekuehlt: o.gekuehlt });
    setOffen(o);
  };
  const speichern = (w: Werte) => {
    const ziel = offen;
    fuehreAus(
      () => (ziel === "neu" || ziel === null ? ortAnlegenAction(w) : ortAendernAction(ziel.id, w)),
      ziel === "neu" ? "Lagerort angelegt." : "Gespeichert.",
      () => setOffen(null),
    );
  };
  const fehler = (feld: keyof Werte) => (feldFehler[feld] ? { validateStatus: "error" as const, help: feldFehler[feld] } : {});
  return (
    <>
      <Seitenkopf
        titel="Lagerorte"
        aktionen={
          <span className={s.reihe}>
            <Link href="/etiketten"><Button icon={<Icons8Ikone name="print" groesse={16} />}>Etiketten</Button></Link>
            <Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => oeffne("neu")}>Lagerort anlegen</Button>
          </span>
        }
      />
      <Kartentabelle<OrtDTO>
        rowKey="id"
        aria-label="Lagerorte"
        dataSource={orte}
        leer={{ nichts: "Noch keine Lagerorte", figur: "verpflegung" }}
        karte={{ titel: "name", kennzeichen: ["stand"] }}
        columns={[
          { title: "Lagerort", key: "name", render: (_: unknown, o: OrtDTO) => <strong>{o.name}</strong> },
          { title: "Kürzel", key: "kurz", render: (_: unknown, o: OrtDTO) => <span className={s.mono}>{o.kurz}</span> },
          { title: "Gekühlt", key: "gekuehlt", render: (_: unknown, o: OrtDTO) => (o.gekuehlt ? "ja" : "nein") },
          { title: "Stand", key: "stand", render: (_: unknown, o: OrtDTO) => (o.aktiv ? <Chip farbe="ok">aktiv</Chip> : <Chip farbe="grau">inaktiv</Chip>) },
          {
            title: "Aktion", key: "aktion",
            render: (_: unknown, o: OrtDTO) => (
              <span className={s.reihe}>
                <Button onClick={() => oeffne(o)}>Bearbeiten</Button>
                {o.aktiv && <Link href={`/etiketten?ort=${o.id}`}><Button>Etikett</Button></Link>}
                <Button disabled={laeuft} onClick={() => fuehreAus(() => ortAktivAction(o.id, !o.aktiv), o.aktiv ? "Deaktiviert." : "Wieder aktiv.")}>
                  {o.aktiv ? "Deaktivieren" : "Aktivieren"}
                </Button>
              </span>
            ),
          },
        ]}
      />
      <Modal
        open={offen !== null}
        title={offen === "neu" ? "Lagerort anlegen" : "Lagerort bearbeiten"}
        okText="Speichern"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onOk={() => form.submit()}
        onCancel={() => setOffen(null)}
        forceRender
      >
        <Form<Werte> form={form} layout="vertical" onFinish={speichern} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Bitte ausfüllen." }]} {...fehler("name")}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="kurz" label="Kürzel" rules={[{ required: true, message: "Bitte ausfüllen." }]} {...fehler("kurz")}>
            <Input maxLength={30} />
          </Form.Item>
          <Form.Item name="gekuehlt" label="Gekühlt" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
