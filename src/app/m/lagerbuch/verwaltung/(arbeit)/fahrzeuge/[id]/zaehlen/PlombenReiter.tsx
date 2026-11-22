"use client";

/**
 * DER REITER „Plomben" (Spec 6.5, 6.12.3) — die aktiven Plomben der Einheit,
 * je eine Eingabe für die neue Nummer; „Plombe anlegen" wirkt sofort.
 *
 * ⚠️ DIE NEUE NUMMER IST GESPERRT, SOLANGE DAS FACH DER PLOMBE NICHT GANZ
 * GEZÄHLT IST: wer neu verplombt, bestätigt damit den Inhalt (`plombeDecktAb`).
 * Der Server weist dasselbe ab; die Leiste nennt es als Sperrgrund, falls eine
 * Nummer schon steht und danach eine Zählung zurückgenommen wurde. Eine Plombe
 * ohne Fach deckt nichts ab und ist frei.
 */

import { useState } from "react";
import { Alert, Button, Form, Input, Modal, Select } from "antd";
import { plombeAnlegen } from "../../../../../_actions/plomben";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import type { ZaehlZustand } from "../../../../../_lib/verwaltungscheck";
import { Chip } from "../../../../../_ui/Chip";
import { Ikone } from "../../../../../_ui/ikonen";
import type { ReiterProps } from "./reiter";
import { useSofort } from "./useSofort";
import k from "./zaehlen.module.css";

/** Ein Fach mit mindestens einer ungezählten Position — dort darf keine neue Nummer hin. */
function fachOffen(daten: VerwaltungscheckDaten, z: ZaehlZustand, fachLabel: string | null): boolean {
  return fachLabel !== null
    && daten.positionen.some((p) => p.fachLabel === fachLabel && typeof z.ist[p.id] !== "number");
}

function mitNummer(z: ZaehlZustand, plombeId: string, nummer: string): ZaehlZustand {
  const plomben = { ...z.plomben };
  // Leer heißt unverändert (Spec 6.5) — dann gehört der Schlüssel nicht in den Entwurf.
  if (nummer === "") delete plomben[plombeId];
  else plomben[plombeId] = nummer;
  return { ...z, plomben };
}

export function PlombenReiter({ daten, zustand, aendere, gesperrt }: ReiterProps) {
  return (
    <div className={k.liste}>
      <div className={k.kopfzeile}>
        <PlombeAnlegen daten={daten} gesperrt={gesperrt} />
      </div>
      {daten.plomben.length === 0 ? (
        <p className={k.hinweis} data-rolle="plomben-leer">Noch keine Plombe angelegt.</p>
      ) : daten.plomben.map((pl) => {
        const offen = fachOffen(daten, zustand, pl.fachLabel);
        return (
          <div key={pl.id} className={k.karte} data-rolle="plombe" data-plombe={pl.id}>
            <div className={k.name}>{pl.bezeichnung}</div>
            <p className={k.merkmale}>
              <span>{pl.fachLabel === null ? "deckt kein Fach ab" : `Fach ${pl.fachLabel}`}</span>
              {pl.gesetzt ? <Chip ton="ok">{pl.gesetzt}</Chip> : <Chip ton="gelb">steht nicht</Chip>}
            </p>
            <Input
              aria-label={`Neue Nummer ${pl.bezeichnung}`}
              placeholder={offen ? "erst das Fach zählen" : "Neue Nummer"}
              maxLength={64}
              autoComplete="off"
              disabled={gesperrt || offen}
              value={zustand.plomben[pl.id] ?? ""}
              onChange={(e) => {
                const nummer = e.target.value;
                aendere((z) => mitNummer(z, pl.id, nummer));
              }}
            />
            {offen ? (
              <p className={k.hinweis} data-rolle="plombe-gesperrt">Erst Fach {pl.fachLabel} ganz zählen.</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type AnlegenWerte = { bezeichnung?: string; fachLabel?: string };

/**
 * „Plombe anlegen" — sofort über `plombeAnlegen` (Stammdaten, Spec 6.5).
 * Das Fach kommt aus den Fächern des Solls: nur dort kann eine Plombe etwas
 * abdecken (wie im `PlombenEditor` des Fahrzeugblatts).
 */
function PlombeAnlegen({ daten, gesperrt }: { daten: VerwaltungscheckDaten; gesperrt: boolean }) {
  const [form] = Form.useForm<AnlegenWerte>();
  const [offen, setOffen] = useState(false);
  const sofort = useSofort("Plombe konnte nicht angelegt werden.");
  const faecher = [...new Set(daten.positionen.flatMap((p) => (p.fachLabel === null ? [] : [p.fachLabel])))];

  function schliessen() {
    if (sofort.laeuft) return;
    form.resetFields();
    sofort.setFehler(null);
    setOffen(false);
  }

  function anlegen(w: AnlegenWerte) {
    void sofort.ausfuehren(
      () => plombeAnlegen({
        lagerortId: daten.fahrzeug.id, bezeichnung: w.bezeichnung?.trim() ?? "", fachLabel: w.fachLabel ?? null,
      }),
      () => { form.resetFields(); setOffen(false); },
    );
  }

  return (
    <>
      <Button icon={<Ikone name="plus" groesse={16} />} disabled={gesperrt} onClick={() => setOffen(true)}>
        Plombe anlegen
      </Button>
      <Modal
        open={offen}
        title="Plombe anlegen"
        okText="Anlegen"
        cancelText="Abbrechen"
        confirmLoading={sofort.laeuft}
        onOk={() => form.submit()}
        onCancel={schliessen}
        destroyOnHidden
      >
        <Form<AnlegenWerte> form={form} layout="vertical" onFinish={anlegen} disabled={sofort.laeuft}>
          <Form.Item
            name="bezeichnung"
            label="Bezeichnung"
            rules={[{ required: true, whitespace: true, message: "Bezeichnung fehlt." }]}
          >
            <Input aria-label="Bezeichnung" placeholder="Behälter, z. B. Medizinkoffer" maxLength={120} />
          </Form.Item>
          <Form.Item name="fachLabel" label="Fach, das sie abdeckt">
            <Select
              aria-label="Fach"
              allowClear
              placeholder="Kein Fach"
              options={faecher.map((f) => ({ value: f, label: `Fach ${f}` }))}
            />
          </Form.Item>
        </Form>
        {sofort.fehler ? <Alert type="warning" showIcon={false} title={sofort.fehler} /> : null}
      </Modal>
    </>
  );
}
