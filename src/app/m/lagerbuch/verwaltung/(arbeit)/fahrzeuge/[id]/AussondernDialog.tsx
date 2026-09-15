"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
 * ⚠️ WIRD DER GANZE BESTAND AUSGESONDERT, ENTFÄLLT DIE ANGABE — das Feld wird
 * dann gesperrt und leer übergeben. Das hier ist aber nur der HINWEIS für die
 * Bedienung: `bestand` ist der Stand beim Rendern, und bis zum Absenden kann
 * jemand anders gebucht haben. DURCHGESETZT wird die Kopplung in der Aktion, die
 * den verbleibenden Bestand in ihrer eigenen Transaktion nachrechnet.
 */
export function AussondernDialog({
  lagerortId,
  artikelId,
  artikelName,
  einheit,
  bestand,
  chargen,
  verfall,
  gesperrt = false,
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
   * Sperrt den Zugang, solange die Tabelle daneben selbst schreibt.
   *
   * ⚠️ EIN WETTLAUF, KEIN SCHOENHEITSFEHLER: läuft `verfallSetzen` noch und wird
   * hier zugleich der ganze Bestand ausgesondert, kann dessen Antwort NACH dem
   * Löschen eintreffen — es prüft nur die Soll-Zugehörigkeit und schreibt den
   * Monat dann bedingungslos zurück. Übrig bliebe eine Verfallszeile für einen
   * Artikel ohne Bestand. Der Monatswähler daneben ist aus demselben Grund
   * bereits gesperrt; die beiden Schreibwege schließen einander damit aus.
   */
  gesperrt?: boolean;
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

  /**
   * ⚠️ DIE FELDER WERDEN BEIM OEFFNEN GESETZT, NICHT NUR UEBER `initialValues`.
   * antd gleicht `initialValues` nach der ERSTinitialisierung nicht mehr ab, und
   * die Form-Instanz gehoert dieser Komponente — sie ueberlebt `destroyOnHidden`
   * samt Feldspeicher. Nach einmal Oeffnen stuende beim naechsten Mal wieder der
   * Monat von damals im Feld, auch wenn der Waehler daneben laengst einen
   * anderen traegt; ein Absenden schriebe den neueren zurueck.
   *
   * Im Effekt und nicht in `oeffnen`, weil das Formular dort noch gar nicht
   * haengt: `destroyOnHidden` baut es erst mit dem Oeffnen auf.
   */
  useEffect(() => {
    if (!offen) return;
    form.setFieldsValue({
      menge: 1,
      chargeId: undefined,
      verfall: verfall ? dayjs(`${verfall}-01`) : null,
      kommentar: "",
    });
  }, [offen, verfall, form]);

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
        /*
         * ⚠️ IMMER DER FELDWERT — `allesRaus` ENTSCHEIDET HIER NICHTS. Es ist
         * eine Vermutung über einen Bestand, der beim RENDERN galt. Hat eine
         * Nachfüllung oder ein Check zwischendurch ERHÖHT, ist die gesendete
         * Menge gar nicht der ganze Bestand; ein leeres Datum löschte dann eine
         * Angabe, während im Fahrzeug noch Packungen liegen.
         *
         * Ob die Angabe entfällt, entscheidet die Transaktion am VERBLEIBENDEN
         * Bestand — sie ist die einzige Stelle, die ihn kennt. Ein leeres Feld
         * heißt hier deshalb genau eine Sache: die Person hat es bewusst
         * geleert.
         */
        const geschrieben = monatAusPicker(werte.verfall) ?? "";
        const ergebnis = await aussondernVomLagerort({
          lagerortId,
          artikelId,
          menge: werte.menge,
          chargeId: werte.chargeId ?? null,
          verfall: geschrieben,
          // Was beim Öffnen im Feld stand — daran erkennt die Aktion, ob der
          // Monat überhaupt gemeint war.
          verfallVorher: verfall ?? "",
          kommentar: werte.kommentar,
        });
        if (ergebnis.ok) {
          // ⚠️ DER WERT AUS DER ANTWORT, NICHT `geschrieben`: die Transaktion
          // entscheidet über „alles raus" und kann `null` geschrieben haben,
          // obwohl hier ein Datum eingegeben wurde.
          onAusgesondert?.(ergebnis.wert.verfall);
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
        disabled={gesperrt || bestand <= 0}
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
          // Nur der erste Anstrich; massgeblich ist der Effekt oben, der bei
          // JEDEM Oeffnen setzt.
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
