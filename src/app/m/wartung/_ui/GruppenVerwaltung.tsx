"use client";

import { useState } from "react";
import { Button, Form, Input, Modal, Popconfirm, Space } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachText } from "@/core/tabelle";
import { gruppeLoeschenAction, gruppeSpeichernAction } from "../_actions/verwaltung";
import type { GruppeDTO } from "../_lib/typen";
import { useAktion } from "./useAktion";
import s from "./wartung.module.css";

type Entwurf = { id: string | null; name: string; pocketGruppe: string };

/** Gruppen und ihre Pocket-ID-Gruppe der Verwalter — nur Admins. */
export function GruppenVerwaltung({ gruppen }: { gruppen: GruppeDTO[] }) {
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [e, setE] = useState<Entwurf | null>(null);
  const oeffne = (x: Entwurf) => { setFeldFehler({}); setE(x); };
  const speichern = () => {
    if (!e) return;
    fuehreAus(() => gruppeSpeichernAction(e.id, { name: e.name, pocketGruppe: e.pocketGruppe }), "Gespeichert.", () => setE(null));
  };
  const fehler = (feld: string) => (feldFehler[feld] ? { validateStatus: "error" as const, help: feldFehler[feld] } : {});

  return (
    <>
      <Seitenkopf
        titel="Gruppen"
        aktionen={<Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => oeffne({ id: null, name: "", pocketGruppe: "wartung-" })}>Gruppe anlegen</Button>}
      />
      <Kartentabelle<GruppeDTO>
        rowKey="id"
        aria-label="Gruppen"
        dataSource={gruppen}
        leer={{ nichts: "Noch keine Gruppen." }}
        karte={{ titel: "name", aktionen: "aktion" }}
        columns={[
          { title: "Name", key: "name", sorter: nachText<GruppeDTO>((g) => g.name), render: (_: unknown, g: GruppeDTO) => <strong>{g.name}</strong> },
          { title: "Pocket-ID-Gruppe", key: "pocket", render: (_: unknown, g: GruppeDTO) => <span className={s.mono}>{g.pocketGruppe}</span> },
          { title: "Geräte", key: "geraete", align: "right", render: (_: unknown, g: GruppeDTO) => g.geraete },
          {
            title: "Aktionen", key: "aktion",
            render: (_: unknown, g: GruppeDTO) => (
              <Space wrap>
                <Button icon={<Icons8Ikone name="pencil" groesse={16} />} onClick={() => oeffne({ id: g.id, name: g.name, pocketGruppe: g.pocketGruppe })}>Bearbeiten</Button>
                {g.geraete === 0 && (
                  <Popconfirm title={`${g.name} löschen?`} okText="Löschen" okButtonProps={{ danger: true }} cancelText="Abbrechen"
                    onConfirm={() => fuehreAus(() => gruppeLoeschenAction(g.id), "Gelöscht.")}>
                    <Button type="text" disabled={laeuft}>Löschen</Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={e !== null}
        title={e?.id ? "Gruppe bearbeiten" : "Gruppe anlegen"}
        okText="Speichern"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        okButtonProps={{ disabled: !e?.name.trim() || !e?.pocketGruppe.trim() }}
        onCancel={() => setE(null)}
        onOk={speichern}
        destroyOnHidden
      >
        {e && (
          <Form layout="vertical" component="div">
            <Form.Item label="Name" htmlFor="gw-gruppe-name" {...fehler("name")}>
              <Input id="gw-gruppe-name" autoFocus value={e.name} maxLength={40} onChange={(x) => setE({ ...e, name: x.target.value })} onPressEnter={speichern} />
            </Form.Item>
            <Form.Item label="Pocket-ID-Gruppe der Verwalter" htmlFor="gw-gruppe-pocket" {...fehler("pocketGruppe")}>
              <Input id="gw-gruppe-pocket" className={s.mono} value={e.pocketGruppe} maxLength={63} onChange={(x) => setE({ ...e, pocketGruppe: x.target.value })} onPressEnter={speichern} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
}
