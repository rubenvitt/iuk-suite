"use client";

import { useEffect, useRef, useState } from "react";
import { AutoComplete, Button, Form, Input, Modal, Popconfirm, Space, Tag } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachText } from "@/core/tabelle";
import {
  gruppeLoeschenAction, gruppeSpeichernAction, suchePersonenAction, verwalterEntfernenAction, verwalterHinzufuegenAction,
} from "../_actions/verwaltung";
import type { GruppeDTO, PersonVorschlag } from "../_lib/typen";
import { useAktion } from "./useAktion";

type Entwurf = { id: string | null; name: string };

/** Wie `_lib/personen.ts` (`SUCHE_MIN_ZEICHEN`); hier noch einmal, weil die Datei die Datenbank liest. */
const MIN_ZEICHEN = 2;

/** Gruppen und wer sie verwaltet (IDA-337: Zuordnung im Modul, nicht über Pocket ID) — nur Admins. */
export function GruppenVerwaltung({ gruppen }: { gruppen: GruppeDTO[] }) {
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [e, setE] = useState<Entwurf | null>(null);
  const oeffne = (x: Entwurf) => { setFeldFehler({}); setE(x); };
  const speichern = () => {
    if (!e) return;
    // Eine neue Gruppe bleibt offen, damit gleich Verwalter dazukommen.
    fuehreAus(() => gruppeSpeichernAction(e.id, { name: e.name }), "Gespeichert.", (r) => setE(e.id || !r.id ? null : { id: r.id, name: e.name }));
  };
  const fehler = (feld: string) => (feldFehler[feld] ? { validateStatus: "error" as const, help: feldFehler[feld] } : {});
  const offen = e?.id ? gruppen.find((g) => g.id === e.id) ?? null : null;

  return (
    <>
      <Seitenkopf
        titel="Gruppen"
        aktionen={<Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => oeffne({ id: null, name: "" })}>Gruppe anlegen</Button>}
      />
      <Kartentabelle<GruppeDTO>
        rowKey="id"
        aria-label="Gruppen"
        dataSource={gruppen}
        leer={{ nichts: "Noch keine Gruppen." }}
        karte={{ titel: "name", aktionen: "aktion" }}
        columns={[
          { title: "Name", key: "name", sorter: nachText<GruppeDTO>((g) => g.name), render: (_: unknown, g: GruppeDTO) => <strong>{g.name}</strong> },
          {
            title: "Verwalter", key: "verwalter",
            render: (_: unknown, g: GruppeDTO) => g.verwalter.length === 0 ? "–" : (
              <Space size={[4, 4]} wrap>{g.verwalter.map((v) => <Tag key={v.nutzer}>{v.name}</Tag>)}</Space>
            ),
          },
          { title: "Geräte", key: "geraete", align: "right", render: (_: unknown, g: GruppeDTO) => g.geraete },
          {
            title: "Aktionen", key: "aktion",
            render: (_: unknown, g: GruppeDTO) => (
              <Space wrap>
                <Button icon={<Icons8Ikone name="pencil" groesse={16} />} onClick={() => oeffne({ id: g.id, name: g.name })}>Bearbeiten</Button>
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
        cancelText="Schließen"
        confirmLoading={laeuft}
        okButtonProps={{ disabled: !e?.name.trim() }}
        onCancel={() => setE(null)}
        onOk={speichern}
        destroyOnHidden
      >
        {e && (
          <Form layout="vertical" component="div">
            <Form.Item label="Name" htmlFor="gw-gruppe-name" {...fehler("name")}>
              <Input id="gw-gruppe-name" autoFocus value={e.name} maxLength={40} onChange={(x) => setE({ ...e, name: x.target.value })} onPressEnter={speichern} />
            </Form.Item>
            {offen && <Verwalter gruppe={offen} />}
          </Form>
        )}
      </Modal>
    </>
  );
}

/** Die Verwalter einer Gruppe: Liste mit „Entfernen“ und die Personensuche zum Hinzufügen. Sofort gespeichert. */
function Verwalter({ gruppe }: { gruppe: GruppeDTO }) {
  const { laeuft, fuehreAus } = useAktion();
  const [begriff, setBegriff] = useState("");
  const [vorschlaege, setVorschlaege] = useState<PersonVorschlag[]>([]);
  /** Nur die Antwort auf die NEUESTE Suche zählt — eine langsame ältere überschriebe sonst die Treffer. */
  const suche = useRef(0);
  useEffect(() => {
    const nr = ++suche.current;
    if (begriff.trim().length < MIN_ZEICHEN) return;
    const t = setTimeout(() => {
      void suchePersonenAction(gruppe.id, begriff).then((v) => { if (nr === suche.current) setVorschlaege(v); }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [begriff, gruppe.id]);

  const hinzufuegen = (v: PersonVorschlag) =>
    fuehreAus(() => verwalterHinzufuegenAction({ gruppeId: gruppe.id, nutzer: v.nutzer }), `${v.name} verwaltet jetzt ${gruppe.name}.`, () => {
      setBegriff(""); setVorschlaege([]);
    });
  const optionen = begriff.trim().length < MIN_ZEICHEN ? [] : vorschlaege.map((v) => ({
    value: v.nutzer, label: <span data-vorschlag={v.nutzer}>{v.name}{v.email ? ` · ${v.email}` : ""}</span>,
  }));

  return (
    <Form.Item label="Verwalter" htmlFor="gw-verwalter-suche">
      <AutoComplete id="gw-verwalter-suche" value={begriff} options={optionen} placeholder="Name eintippen" disabled={laeuft}
        onSearch={(q) => { setBegriff(q); if (q.trim().length < MIN_ZEICHEN) setVorschlaege([]); }}
        onSelect={(nutzer: string) => { const v = vorschlaege.find((x) => x.nutzer === nutzer); if (v) hinzufuegen(v); }}
        notFoundContent={begriff.trim().length >= MIN_ZEICHEN ? "Niemand gefunden." : null} />
      {gruppe.verwalter.length > 0 && (
        <ul data-verwalter="" style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 8 }}>
          {gruppe.verwalter.map((v) => (
            <li key={v.nutzer} data-verwalter-person={v.nutzer} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>{v.name}</span>
              <Popconfirm title={`${v.name} entfernen?`} okText="Entfernen" cancelText="Abbrechen"
                onConfirm={() => fuehreAus(() => verwalterEntfernenAction({ gruppeId: gruppe.id, nutzer: v.nutzer }), "Entfernt.")}>
                <Button type="text" disabled={laeuft}>Entfernen</Button>
              </Popconfirm>
            </li>
          ))}
        </ul>
      )}
    </Form.Item>
  );
}
