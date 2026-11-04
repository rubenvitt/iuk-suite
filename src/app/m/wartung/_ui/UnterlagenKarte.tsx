"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, Dropdown, Form, Input, Modal, Upload } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { unterlageLoeschenAction, unterlageVerschiebenAction } from "../_actions/verwaltung";
import { KURZ_MAX, UNTERLAGEN_MAX } from "../_lib/eingabe";
import type { SendeAntwort } from "../_lib/koerper";
import type { UnterlageDTO } from "../_lib/typen";
import { groesseText } from "./teile";
import { useAktion } from "./useAktion";
import s from "./wartung.module.css";

/** Unterlagen in der Akte (IDA-300): hochladen, ordnen, entfernen. Hochgeladen wird über die Route, nicht per Action. */
export function UnterlagenKarte({ geraetId, unterlagen, aktiv }: { geraetId: string; unterlagen: UnterlageDTO[]; aktiv: boolean }) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const { laeuft, fuehreAus } = useAktion();
  const [offen, setOffen] = useState(false);
  const [titel, setTitel] = useState("");
  const [datei, setDatei] = useState<File | null>(null);
  const [fehler, setFehler] = useState<{ feld?: string; text: string } | null>(null);
  const [sendet, setSendet] = useState(false);

  const oeffne = () => { setTitel(""); setDatei(null); setFehler(null); setOffen(true); };

  async function hochladen() {
    if (sendet || !titel.trim() || !datei) return;
    setSendet(true);
    setFehler(null);
    try {
      const daten = new FormData();
      daten.set("titel", titel);
      daten.set("datei", datei, datei.name);
      const r = await fetch(`/geraete/${geraetId}/unterlagen`, { method: "POST", body: daten });
      const a = (await r.json().catch(() => null)) as SendeAntwort | null;
      if (a?.ok) {
        message.success("Unterlage hinzugefügt.");
        setOffen(false);
        router.refresh();
      } else {
        setFehler({ feld: a && !a.ok ? a.feld : undefined, text: a && !a.ok ? a.fehler : "Das Hochladen ging nicht durch. Bitte noch einmal versuchen." });
      }
    } catch {
      setFehler({ text: "Keine Verbindung. Bitte gleich noch einmal versuchen." });
    } finally {
      setSendet(false);
    }
  }

  const feldFehler = (feld: string) => (fehler && (fehler.feld === feld || (!fehler.feld && feld === "datei"))
    ? { validateStatus: "error" as const, help: fehler.text } : {});

  return (
    <Card
      title="Unterlagen"
      extra={aktiv && unterlagen.length < UNTERLAGEN_MAX
        ? <Button icon={<Icons8Ikone name="upload" groesse={16} />} onClick={oeffne}>Hinzufügen</Button>
        : undefined}
    >
      {unterlagen.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Keine Unterlagen.</p> : (
        <ul className={s.zeilen} aria-label="Unterlagen">
          {unterlagen.map((u, i) => (
            <li key={u.id} className={s.unterlage}>
              <Icons8Ikone name={u.typ === "pdf" ? "document" : "image"} groesse={20} />
              <a href={`/g/${geraetId}/unterlagen/${u.id}`} target="_blank" rel="noopener" className={s.unterlageTitel}>
                {u.titel}
                <div className={`${s.neben} ${s.klein}`}>{u.typ === "pdf" ? "PDF" : "Bild"} · {groesseText(u.bytes)}</div>
              </a>
              <Dropdown
                trigger={["click"]}
                disabled={laeuft}
                menu={{
                  items: [
                    { key: "hoch", label: "Nach oben", disabled: i === 0 },
                    { key: "runter", label: "Nach unten", disabled: i === unterlagen.length - 1 },
                    { type: "divider" },
                    { key: "weg", label: "Entfernen", danger: true },
                  ],
                  onClick: ({ key }) => {
                    if (key === "hoch" || key === "runter") {
                      fuehreAus(() => unterlageVerschiebenAction(u.id, key === "hoch" ? -1 : 1), "Verschoben.");
                    } else {
                      modal.confirm({
                        title: `${u.titel} entfernen?`,
                        okText: "Entfernen",
                        cancelText: "Abbrechen",
                        onOk: () => fuehreAus(() => unterlageLoeschenAction(u.id), "Entfernt."),
                      });
                    }
                  },
                }}
              >
                <Button type="text" aria-label={`${u.titel}: Aktionen`} icon={<Icons8Ikone name="more" groesse={16} />} />
              </Dropdown>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={offen}
        title="Unterlage hinzufügen"
        okText="Hochladen"
        cancelText="Abbrechen"
        confirmLoading={sendet}
        okButtonProps={{ disabled: !titel.trim() || !datei }}
        onCancel={() => setOffen(false)}
        onOk={hochladen}
        destroyOnHidden
      >
        <Form layout="vertical" component="div">
          <Form.Item label="Titel" htmlFor="gw-unterlage-titel" {...feldFehler("titel")}>
            <Input id="gw-unterlage-titel" autoFocus maxLength={KURZ_MAX} value={titel}
              onChange={(e) => setTitel(e.target.value)} />
          </Form.Item>
          <Form.Item label="Datei (PDF oder Bild)" {...feldFehler("datei")}>
            <Upload
              accept="application/pdf,image/*"
              maxCount={1}
              fileList={datei ? [{ uid: "datei", name: datei.name, status: "done" }] : []}
              beforeUpload={(f) => {
                setDatei(f);
                if (!titel.trim()) setTitel(f.name.replace(/\.[^.]+$/, "").slice(0, KURZ_MAX));
                return false;
              }}
              onRemove={() => { setDatei(null); }}
            >
              <Button icon={<Icons8Ikone name="upload" groesse={16} />}>Datei wählen</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
