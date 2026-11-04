"use client";

import { useState } from "react";
import { AutoComplete, Form, Input, InputNumber, Modal, Radio, Select } from "antd";
import { KURZ_MAX, NAME_MAX, NOTIZ_MAX, type GeraetEingabe } from "../_lib/eingabe";

export type GeraetWerte = GeraetEingabe;

/**
 * Anlegen und Ändern eines Geräts. Die Gruppe wählt nur, wer mehr als eine verwaltet; die Action prüft sie
 * trotzdem gegen die Datenbank. Der Aufrufer rendert es nur, solange es offen ist: so beginnt jedes Öffnen
 * mit `start`.
 */
export function GeraetFormular({
  offen, titel, start, gruppen, arten, orte, laeuft, feldFehler, onAbbrechen, onSpeichern,
}: {
  offen: boolean;
  titel: string;
  start: GeraetWerte;
  gruppen: { id: string; name: string }[];
  arten: { id: string; einzahl: string }[];
  orte: string[];
  laeuft: boolean;
  feldFehler: Record<string, string>;
  onAbbrechen: () => void;
  onSpeichern: (w: GeraetWerte) => void;
}) {
  const [w, setW] = useState<GeraetWerte>(start);
  const setze = (teil: Partial<GeraetWerte>) => setW((alt) => ({ ...alt, ...teil }));
  const fehler = (feld: string) => (feldFehler[feld] ? { validateStatus: "error" as const, help: feldFehler[feld] } : {});

  return (
    <Modal
      open={offen}
      title={titel}
      okText="Speichern"
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      okButtonProps={{ disabled: !w.name.trim() || !w.ort.trim() || !w.artId || !w.gruppeId }}
      onCancel={onAbbrechen}
      onOk={() => onSpeichern(w)}
      destroyOnHidden
    >
      <Form layout="vertical" component="div">
        {gruppen.length > 1 && (
          <Form.Item label="Gruppe" {...fehler("gruppeId")}>
            <Radio.Group value={w.gruppeId} onChange={(e) => setze({ gruppeId: e.target.value })} options={gruppen.map((g) => ({ value: g.id, label: g.name }))} />
          </Form.Item>
        )}
        <Form.Item label="Geräteart" htmlFor="gw-art" {...fehler("artId")}>
          <Select id="gw-art" value={w.artId || undefined} onChange={(v) => setze({ artId: v })} options={arten.map((a) => ({ value: a.id, label: a.einzahl }))} />
        </Form.Item>
        <Form.Item label="Bezeichnung" htmlFor="gw-name" {...fehler("name")}>
          <Input id="gw-name" autoFocus value={w.name} maxLength={NAME_MAX} onChange={(e) => setze({ name: e.target.value })} />
        </Form.Item>
        <Form.Item label="Hersteller" htmlFor="gw-hersteller" {...fehler("hersteller")}>
          <Input id="gw-hersteller" value={w.hersteller} maxLength={KURZ_MAX} onChange={(e) => setze({ hersteller: e.target.value })} />
        </Form.Item>
        <Form.Item label="Typ" htmlFor="gw-typ" {...fehler("typ")}>
          <Input id="gw-typ" value={w.typ} maxLength={KURZ_MAX} onChange={(e) => setze({ typ: e.target.value })} />
        </Form.Item>
        <Form.Item label="Seriennummer" htmlFor="gw-seriennr" {...fehler("seriennr")}>
          <Input id="gw-seriennr" value={w.seriennr} maxLength={KURZ_MAX} onChange={(e) => setze({ seriennr: e.target.value })} />
        </Form.Item>
        <Form.Item label="Steht auf">
          <Radio.Group
            value={w.ortArt}
            onChange={(e) => setze({ ortArt: e.target.value })}
            options={[{ value: "lager", label: "Lager" }, { value: "fahrzeug", label: "Fahrzeug" }]}
          />
        </Form.Item>
        <Form.Item label={w.ortArt === "fahrzeug" ? "Fahrzeug" : "Standort"} htmlFor="gw-ort" {...fehler("ort")}>
          <AutoComplete
            id="gw-ort"
            value={w.ort}
            onChange={(v) => setze({ ort: v })}
            options={orte.filter((o) => o.toLowerCase().includes(w.ort.toLowerCase())).map((o) => ({ value: o }))}
            maxLength={NAME_MAX}
          />
        </Form.Item>
        <Form.Item label="Betriebsstunden" htmlFor="gw-stunden" {...fehler("stunden")}>
          <InputNumber id="gw-stunden" value={w.stunden ?? undefined} min={0} precision={0} suffix="h" style={{ width: "100%" }} onChange={(v) => setze({ stunden: v ?? null })} />
        </Form.Item>
        <Form.Item label="Hinweise am Gerät" htmlFor="gw-hinweise" {...fehler("hinweise")}>
          <Input.TextArea id="gw-hinweise" rows={3} maxLength={NOTIZ_MAX} showCount value={w.hinweise} onChange={(e) => setze({ hinweise: e.target.value })} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
