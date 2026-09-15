"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { aussondernVomLagerort } from "../../../../_actions/aussondernLagerort";
import type { ChargeZeile } from "../../../../_lib/lesepfade/artikel";
import { monatAusPicker } from "../../../../_ui/monat";
import { Ikone } from "../../../../_ui/ikonen";

const ALLGEMEIN = "Aussondern fehlgeschlagen.";

type Werte = {
  menge: number;
  chargeId?: string;
  verfall?: Dayjs | null;
  kommentar: string;
};

/**
 * Sondert eine GEZÄHLTE Menge aus einem Fahrzeug aus (DRK-303).
 *
 * ⚠️ DAS VERFALLSDATUM IST EINGABE, NICHT ABLEITUNG. `lagerort_verfall` trägt je
 * (Lagerort, Artikel) GENAU EINEN Wert — das früheste Datum, das im Fahrzeug auf
 * einer Packung steht — und KEINE Menge. Nach einer Teilaussonderung ist das
 * verbleibende früheste Datum deshalb nicht berechenbar; wer es errät, lässt eine
 * Angabe stehen, die nicht mehr zum Bestand passt, und kein Gate meldet das.
 *
 * ⚠️ WIRD DER GANZE BESTAND AUSGESONDERT, ENTFÄLLT DIE ANGABE. Das Feld wird dann
 * gesperrt und leer übergeben — die Aktion löscht die Zeile. Ohne diese Kopplung
 * bliebe ein Verfallsdatum an einem Artikel stehen, von dem nichts mehr da ist,
 * und die Verfallsliste des Fahrzeugs meldete ihn weiter als abgelaufen.
 */
export function AussondernDialog({
  lagerortId,
  artikelId,
  artikelName,
  einheit,
  bestand,
  chargen,
  verfall,
  onAusgesondert,
}: {
  lagerortId: string;
  artikelId: string;
  artikelName: string;
  einheit: string;
  bestand: number;
  chargen: ChargeZeile[];
  verfall: string | null;
  /**
   * Meldet den GESCHRIEBENEN Verfall an die Tabelle zurueck — `null`, wenn die
   * Angabe entfaellt.
   *
   * ⚠️ NICHT WEGLASSEN, AUCH WENN `revalidatePath` DIE SEITE AUFFRISCHT: die
   * Tabelle haelt ihren eigenen Monatsspiegel, den sie EINMAL beim Einhaengen
   * aus den Props fuellt. Eine Auffrischung haengt die Insel nicht neu ein, der
   * Waehler zeigte danach still den alten Monat.
   */
  onAusgesondert?: (verfall: string | null) => void;
}) {
  const [form] = Form.useForm<Werte>();
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const schreibtGerade = useRef(false);

  // Kontrolliert gelesen statt aus `initialValues`: die Sperre des
  // Verfallsfeldes hängt an der AKTUELLEN Menge, nicht an der anfänglichen.
  const menge = Form.useWatch("menge", form) ?? 1;
  const allesRaus = menge >= bestand;

  function oeffnen() {
    setFehler(null);
    setOffen(true);
  }

  /**
   * ⚠️ DER RESET IST PFLICHT, NICHT KOSMETIK. `destroyOnHidden` raeumt das
   * Markup auf, nicht den Feldspeicher: die Form-Instanz haengt an DIESER
   * Komponente, nicht am Modal, und antd bewahrt ihre Werte (`preserve` ist an).
   * Ohne ihn stuende beim naechsten Oeffnen die abgebrochene Menge wieder da —
   * bei einer Aktion, die Bestand ABBUCHT, ist das die gefaehrliche Richtung.
   *
   * ⚠️ VOR `setOffen(false)`, solange das Formular noch haengt: danach ist es
   * abgeraeumt, und `resetFields` liefe gegen eine Instanz ohne Element.
   *
   * Deckt alle drei Auswege ab — antds `onCancel` traegt Knopf, Escape und
   * Maskenklick gemeinsam.
   */
  function schliessen() {
    if (laeuft) return;
    form.resetFields();
    setOffen(false);
  }

  function speichern(werte: Werte) {
    if (schreibtGerade.current) return;
    schreibtGerade.current = true;
    setFehler(null);
    start(async () => {
      try {
        // Voll ausgesondert ⇒ keine Angabe mehr, die Zeile fällt weg.
        const geschrieben = allesRaus ? "" : (monatAusPicker(werte.verfall) ?? "");
        const ergebnis = await aussondernVomLagerort({
          lagerortId,
          artikelId,
          menge: werte.menge,
          chargeId: werte.chargeId ?? null,
          verfall: geschrieben,
          kommentar: werte.kommentar,
        });
        if (ergebnis.ok) {
          onAusgesondert?.(geschrieben || null);
          // Gleiche Reihenfolge wie in `schliessen`: erst leeren, dann zu.
          form.resetFields();
          setOffen(false);
          return;
        }
        // Der Satz aus der Action, nicht die Modulkonstante: nur er nennt die
        // tatsächlich vorhandene Menge.
        setFehler(ergebnis.fehler);
      } catch {
        setFehler(ALLGEMEIN);
      } finally {
        schreibtGerade.current = false;
      }
    });
  }

  return (
    <>
      {/* KEIN size="small": 44px ist die Arbeitsdichte, "small" unterbietet die
          Mindesttapfläche (Falle 4, WCAG 2.5.5). */}
      <Button
        disabled={bestand <= 0}
        icon={<Ikone name="kreuz" groesse={14} />}
        onClick={oeffnen}
        aria-label={`${artikelName} aussondern`}
      >
        aussondern
      </Button>
      <Modal
        open={offen}
        title={`${artikelName} aussondern`}
        okText="Aussondern"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        // Während des Schreibens kein Weg nach draußen: sonst liefe ein späterer
        // `setFehler` gegen einen geschlossenen Dialog (Modulform aus NeuArtikel).
        closable={!laeuft}
        keyboard={!laeuft}
        mask={{ closable: !laeuft }}
        onCancel={schliessen}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<Werte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          initialValues={{
            menge: 1,
            verfall: verfall ? dayjs(`${verfall}-01`) : null,
          }}
          onFinish={speichern}
          data-rolle="aussondern"
        >
          <Form.Item
            name="menge"
            label={`Menge (hier liegen ${bestand} ${einheit})`}
            rules={[{ required: true, message: "Menge angeben" }]}
          >
            <InputNumber
              aria-label="Menge"
              min={1}
              max={bestand}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="chargeId"
            label="Charge"
            extra="Ohne Angabe wird die am frühesten ablaufende Charge zuerst ausgebucht."
          >
            <Select
              aria-label="Charge"
              allowClear
              placeholder="alle Chargen (FEFO)"
              options={chargen.map((charge) => ({
                value: charge.id,
                label: `${charge.chargenNr} · ${charge.verfall} · ${charge.rest} ${einheit}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="verfall"
            label="Verfall der verbleibenden Packungen"
            extra={allesRaus
              ? "Der ganze Bestand geht raus — die Verfallsangabe entfällt."
              : "Das früheste Datum, das jetzt noch im Fahrzeug auf einer Packung steht."}
          >
            <DatePicker
              picker="month"
              format="YYYY-MM"
              allowClear
              disabled={allesRaus}
              style={{ width: "100%" }}
              aria-label="Verfall"
            />
          </Form.Item>
          <Form.Item
            name="kommentar"
            label="Grund"
            rules={[{ required: true, whitespace: true, message: "Grund angeben" }]}
          >
            <Input aria-label="Kommentar" autoComplete="off" />
          </Form.Item>
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
