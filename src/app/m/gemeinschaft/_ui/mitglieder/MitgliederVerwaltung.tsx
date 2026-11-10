"use client";

import { useRef, useState, useTransition } from "react";
import { App, Button, Form, Input, Modal } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, Kurzkennung, Zeilenaktionen, nachText, nachZahl } from "@/core/tabelle";
import {
  mitgliedAnlegenAction, mitgliedEntfernenAction, mitgliedNeuerLinkAction, mitgliedSpeichernAction,
} from "../../_actions/mitglieder";
import {
  MITGLIED_NAME_MAX, MITGLIED_TELEFON_MAX, persoenlicherLink, type MitgliedZeile, type MitgliederErgebnis,
} from "../../_lib/mitgliederAnzeige";
import s from "./mitglieder.module.css";

type Formular = { id: string | null; name: string; telefon: string };

const vorname = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * Mitglieder ohne Konto (IDA-320, POC `Mitglieder`): Tabelle, auf dem Telefon Karten (`Kartentabelle`). Die
 * Actions prüfen alles selbst; nach Erfolg lädt die Seite über `revalidatePath` neu.
 */
export function MitgliederVerwaltung({ zeilen, basis }: { zeilen: MitgliedZeile[]; basis: string }) {
  const { message } = App.useApp();
  const [formular, setFormular] = useState<Formular | null>(null);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, starte] = useTransition();
  // Synchrone Sperre: zwei schnelle Enter landen sonst vor dem ersten `laeuft` in zwei Aktionen.
  const sperre = useRef(false);

  const fuehreAus = (aktion: () => Promise<MitgliederErgebnis>, erfolg: string, danach?: () => void) => {
    if (sperre.current) return;
    sperre.current = true;
    starte(async () => {
      try {
        const r = await aktion();
        if (r.ok) {
          message.success(erfolg);
          danach?.();
        } else {
          setFeldFehler(r.feldFehler ?? {});
          if (!r.feldFehler) message.error(r.fehler);
        }
      } finally {
        sperre.current = false;
      }
    });
  };

  const oeffne = (f: Formular) => { setFeldFehler({}); setFormular(f); };
  const speichern = () => {
    if (!formular) return;
    const eingabe = { name: formular.name, telefon: formular.telefon };
    if (formular.id === null) {
      fuehreAus(() => mitgliedAnlegenAction(eingabe), "Mitglied angelegt. Kopier jetzt den persönlichen Link und schick ihn weiter.", () => setFormular(null));
    } else {
      const id = formular.id;
      fuehreAus(() => mitgliedSpeichernAction(id, eingabe), "Gespeichert.", () => setFormular(null));
    }
  };

  return (
    <div>
      <Seitenkopf
        titel="Mitglieder"
        aktionen={
          <Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => oeffne({ id: null, name: "", telefon: "" })}>
            Mitglied anlegen
          </Button>
        }
      />
      <Kartentabelle<MitgliedZeile>
        rowKey="id"
        aria-label="Mitglieder"
        dataSource={zeilen}
        leer={{ nichts: "Noch keine Mitglieder", figur: "gemeinschaft" }}
        karte={{ titel: "name", aktionen: "aktion" }}
        columns={[
          {
            // Telefon steht als zweite, leisere Zeile unter dem Namen (IDA-393: eigene Spalte trieb die Tabelle bei 1280px aus dem Rahmen).
            title: "Name", key: "name", sorter: nachText<MitgliedZeile>((m) => m.name),
            render: (_: unknown, m: MitgliedZeile) => (
              <span className={s.namenszelle}>
                <span>
                  <strong>{m.name}</strong>
                  {m.verantwortlich.length > 0 ? <span className={s.kennzeichen}>verantwortlich</span> : null}
                </span>
                {m.telefon ? <a className={s.neben} href={`tel:${m.telefon.replace(/[^0-9+]/g, "")}`}>{m.telefon}</a> : null}
              </span>
            ),
          },
          {
            title: "Verantwortlich für", key: "verantwortlich",
            render: (_: unknown, m: MitgliedZeile) => (m.verantwortlich.length
              ? <span className={s.links}>{m.verantwortlich.map((v) => <a key={v.id} href={`/v/${v.id}`}>{v.titel}</a>)}</span>
              : <span className={s.neben}>—</span>),
          },
          {
            title: "Offene Aufgaben", key: "offen", align: "right", sorter: nachZahl<MitgliedZeile>((m) => m.offeneAufgaben),
            render: (_: unknown, m: MitgliedZeile) => m.offeneAufgaben,
          },
          {
            title: "Persönlicher Link", key: "link",
            render: (_: unknown, m: MitgliedZeile) => (
              <Kurzkennung
                wert={persoenlicherLink(basis, m.link)}
                anzeige={`…/mein/${m.link}`}
                zeichen={13}
                href={persoenlicherLink(basis, m.link)}
                was="Link"
                kopiert={`Link kopiert. Schick ihn nur an ${vorname(m.name)}.`}
              />
            ),
          },
          {
            title: "Aktionen", key: "aktion",
            render: (_: unknown, m: MitgliedZeile) => (
              <Zeilenaktionen
                name={m.name}
                aktionen={[
                  {
                    key: "neuerLink", label: "Neuer Link", disabled: laeuft,
                    bestaetigen: { titel: "Neuen Link erzeugen?", text: "Der bisherige Link geht dann sofort nicht mehr.", ok: "Neu erzeugen" },
                    onClick: () => fuehreAus(() => mitgliedNeuerLinkAction(m.id), "Neuer Link erzeugt. Der alte geht ab sofort nicht mehr."),
                  },
                  {
                    key: "bearbeiten", label: "Bearbeiten", ikone: "pencil",
                    onClick: () => oeffne({ id: m.id, name: m.name, telefon: m.telefon }),
                  },
                  {
                    key: "entfernen", label: "Entfernen", danger: true, disabled: laeuft,
                    bestaetigen: {
                      titel: `${m.name} entfernen?`,
                      text: m.verantwortlich.length
                        ? "Die Zuständigkeiten fallen weg, die Aufgaben bleiben. Bei den Vorhaben, für die die Person verantwortlich ist, steht danach niemand."
                        : "Die Zuständigkeiten fallen weg, die Aufgaben bleiben.",
                      ok: "Entfernen",
                    },
                    onClick: () => fuehreAus(() => mitgliedEntfernenAction(m.id), `${m.name} entfernt.`),
                  },
                ]}
              />
            ),
          },
        ]}
      />
      <Modal
        open={formular !== null}
        title={formular?.id ? "Mitglied bearbeiten" : "Mitglied anlegen"}
        okText={formular?.id ? "Speichern" : "Anlegen"}
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        okButtonProps={{ disabled: (formular?.name.trim().length ?? 0) < 2 }}
        onCancel={() => setFormular(null)}
        onOk={speichern}
        destroyOnHidden
      >
        {formular ? (
          <Form layout="vertical" onFinish={speichern} component="div">
            <Form.Item label="Name" htmlFor="gm-mitglied-name" validateStatus={feldFehler.name ? "error" : undefined} help={feldFehler.name}>
              <Input
                id="gm-mitglied-name"
                autoFocus
                value={formular.name}
                maxLength={MITGLIED_NAME_MAX}
                onChange={(e) => setFormular({ ...formular, name: e.target.value })}
                onPressEnter={speichern}
              />
            </Form.Item>
            <Form.Item
              label="Telefon"
              htmlFor="gm-mitglied-telefon"
              validateStatus={feldFehler.telefon ? "error" : undefined}
              help={feldFehler.telefon}
            >
              <Input
                id="gm-mitglied-telefon"
                value={formular.telefon}
                inputMode="tel"
                maxLength={MITGLIED_TELEFON_MAX}
                onChange={(e) => setFormular({ ...formular, telefon: e.target.value })}
                onPressEnter={speichern}
              />
            </Form.Item>
          </Form>
        ) : null}
      </Modal>
    </div>
  );
}
