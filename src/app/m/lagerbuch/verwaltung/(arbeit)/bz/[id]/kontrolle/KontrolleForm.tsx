"use client";

import { useState } from "react";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Radio } from "antd";
import type { Dayjs } from "dayjs";
import { enterUebernimmtNurDasFeld } from "@/core/formular/enter";
import { SPACE } from "@/core/theme/tokens";
import { kontrolleErfassen } from "../../../../../_actions/bz";
import { monatAusPicker } from "../../../../../_ui/monat";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";
import { useFormEntwurf } from "@/core/entwurf/useFormEntwurf";
import { EntwurfZeile } from "../../../../../_ui/EntwurfZeile";

export type KontrolleLevelDto = {
  label: string | null;
  min: number | null;
  max: number | null;
} | null;

type KontrolleWerte = {
  level1Wert?: number;
  level2Wert?: number;
  kompresseVerfall?: Dayjs;
  sticks: number;
  lanzetten: number;
  batterieGewechselt: boolean;
  kommentar?: string;
  /**
   * DRK-311. ⚠️ EIGENES FELD NEBEN `kommentar`, nicht aus ihm abgeleitet:
   * „Nicht jede Bemerkung automatisch als Warnung interpretieren"
   * (Gespraechsnotiz). „Streifen nachbestellt" ist eine Auskunft, kein
   * Missstand — und eine Liste, in der jeder Kommentar gelb leuchtet, sagt
   * nichts mehr.
   */
  beachtung: boolean;
};

const FORM_FELDER = new Set<keyof KontrolleWerte>([
  "level1Wert",
  "level2Wert",
  "kompresseVerfall",
  "sticks",
  "lanzetten",
  "batterieGewechselt",
  "kommentar",
  "beachtung",
]);

function istFormFeld(name: string): name is keyof KontrolleWerte {
  return FORM_FELDER.has(name as keyof KontrolleWerte);
}

function bereich(level: KontrolleLevelDto): string {
  if (!level || (level.min === null && level.max === null)) return "";
  return ` (${level.min ?? "?"}–${level.max ?? "?"})`;
}

function levelLabel(level: KontrolleLevelDto, fallback: string): string {
  return `${level?.label?.trim() || fallback}${bereich(level)}`;
}

export function KontrolleForm({
  geraetId,
  level1,
  level2,
  beachtungAktiv,
}: {
  geraetId: string;
  level1: KontrolleLevelDto;
  level2: KontrolleLevelDto;
  /** Ob am Geraet schon ein Hinweis steht — entscheidet allein den ERKLAERTEXT
   *  unter der Wahl, nie den Vorbelegungswert. */
  beachtungAktiv: boolean;
}) {
  const [form] = Form.useForm<KontrolleWerte>();
  const [bestanden, setBestanden] = useState<boolean | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  /*
   * IDA-358 — DIE KONTROLLE IST EINE MESSUNG MIT DEM GERAET IN DER HAND, also
   * Modus „senden" (wie der Check), nicht nur Wiederherstellen: die Werte liegen
   * auf dem Geraet, ein Wurf (Netz, Rollout) wird wiederholt, und die
   * Sendungs-ID wird die ID der Kontrolle — keine zweite Zeile in der
   * append-only Tabelle (`_actions/bz.ts`). Solange eine Sendung liegt, ist das
   * Formular gesperrt: ein zweites Speichern schickte unter derselben ID andere
   * Werte.
   */
  const entwurf = useFormEntwurf<
    KontrolleWerte,
    Parameters<typeof kontrolleErfassen>[0] & object,
    Awaited<ReturnType<typeof kontrolleErfassen>>
  >(form, `lagerbuch:bz-kontrolle:${geraetId}`, {
    senden: (nutzlast, sendungId) => kontrolleErfassen({ ...nutzlast, sendungId }),
    antwort: (ergebnis) => {
      if (!ergebnis.ok) {
        if (ergebnis.feldFehler) {
          form.setFields(Object.entries(ergebnis.feldFehler)
            .filter((eintrag): eintrag is [keyof KontrolleWerte, string] => (
              istFormFeld(eintrag[0])
            ))
            .map(([name, text]) => ({ name, errors: [text] })));
        }
        setFehler(ergebnis.fehler);
        return false;
      }
      setBestanden(ergebnis.wert.bestanden);
      entwurf.verwerfen();
      return true;
    },
  });
  const laeuft = entwurf.zustand !== "ruhe";
  const level1Text = levelLabel(level1, "Level 1");
  const level2Text = levelLabel(level2, "Level 2");

  function speichern(werte: KontrolleWerte): void {
    setBestanden(null);
    setFehler(null);
    form.setFields(Array.from(FORM_FELDER, (name) => ({ name, errors: [] })));
    // Ein Wurf (Netz, Rollout) faengt `useFormEntwurf`; `EntwurfHinweis` sagt
    // „Nicht gesendet". Der feste Satz fuer den Wurf ist damit ersetzt.
    entwurf.sende({
      geraetId,
      ...werte,
      kompresseVerfall: monatAusPicker(werte.kompresseVerfall),
    });
  }

  return (
    <Form<KontrolleWerte>
      form={form}
      layout="vertical"
      disabled={laeuft}
      onValuesChange={entwurf.onValuesChange}
      initialValues={{
        sticks: 0,
        lanzetten: 0,
        batterieGewechselt: false,
        /*
         * ⚠️ IMMER `false`, AUCH WENN AM GERAET SCHON EIN HINWEIS STEHT. Eine
         * Vorbelegung mit dem aktuellen Stand saehe hilfreich aus und waere
         * eine Falle: „nein" hebt hier nichts auf (s. u.), „ja" ueberschriebe
         * den fremden Hinweis mit dem eigenen Kommentar. Diese Wahl sagt
         * ausschliesslich etwas ueber DIESE Kontrolle.
         */
        beachtung: false,
      }}
      onFinish={speichern}
      aria-label="BZ-Kontrolle erfassen"
    >
      <EntwurfZeile entwurf={entwurf} />
      {level1 ? (
        <Form.Item name="level1Wert" label={level1Text}>
          <InputNumber
            data-rolle="level-wert"
            aria-label={level1Text}
            min={0}
            max={9999}
            precision={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
      ) : null}
      {level2 ? (
        <Form.Item name="level2Wert" label={level2Text}>
          <InputNumber
            data-rolle="level-wert"
            aria-label={level2Text}
            min={0}
            max={9999}
            precision={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
      ) : null}
      <Form.Item name="kompresseVerfall" label="Kompressen-Verfall">
        <DatePicker
          data-rolle="kompresse"
          picker="month"
          popupAlign={WAEHLER_IM_BILD}
          format="YYYY-MM"
          aria-label="Kompressen-Verfall"
          onKeyDown={enterUebernimmtNurDasFeld}
          style={{ width: "100%" }}
        />
      </Form.Item>
      {/* 9999 bleibt absichtlich erlaubt: echter Überbestand muss beim Abgleich
          zählbar sein und darf nicht still auf einen kleineren Wert fallen. */}
      <Form.Item name="sticks" label="Teststreifen">
        <InputNumber
          data-rolle="sticks"
          aria-label="Teststreifen"
          min={0}
          max={9999}
          precision={0}
          style={{ width: "100%" }}
        />
      </Form.Item>
      <Form.Item name="lanzetten" label="Lanzetten">
        <InputNumber
          data-rolle="lanzetten"
          aria-label="Lanzetten"
          min={0}
          max={9999}
          precision={0}
          style={{ width: "100%" }}
        />
      </Form.Item>
      <Form.Item name="batterieGewechselt" label="Akku gewechselt">
        {/* Eine echte Radio-Gruppe: ein Tabstop, Auswahl per Pfeiltasten. */}
        <Radio.Group
          aria-label="Akku gewechselt"
          options={[
            { value: false, label: "nein" },
            { value: true, label: "ja" },
          ]}
        />
      </Form.Item>
      <Form.Item name="kommentar" label="Kommentar">
        <Input aria-label="Kommentar" autoComplete="off" />
      </Form.Item>
      <Form.Item
        name="beachtung"
        label="Beachtung erforderlich"
        /*
         * ⚠️ DER ERKLAERTEXT SAGT, WAS „nein" NICHT TUT. Ohne ihn liest sich die
         * Wahl als Schalter fuer den Gesamtzustand des Geraets, und wer „nein"
         * waehlt, erwartet, dass ein bestehender Hinweis verschwindet. Er
         * bleibt — aufgehoben wird ausdruecklich am Geraet, damit eine
         * turnusmaessige Kontrolle nicht still den Vermerk eines anderen
         * loescht.
         */
        extra={beachtungAktiv
          ? "Für dieses Gerät steht bereits ein Hinweis. „Ja“ ersetzt ihn durch deinen Kommentar; „nein“ lässt ihn stehen — aufheben kannst du ihn auf der Geräteseite."
          : "Bei „ja“ wird dein Kommentar als gelber Hinweis am Gerät angezeigt, bis ihn jemand auf der Geräteseite aufhebt."}
      >
        {/* Eine echte Radio-Gruppe: ein Tabstop, Auswahl per Pfeiltasten. */}
        <Radio.Group
          aria-label="Beachtung erforderlich"
          options={[
            { value: false, label: "nein" },
            { value: true, label: "ja" },
          ]}
        />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={entwurf.zustand === "sendet"}>
        Kontrolle speichern
      </Button>
      {bestanden !== null ? (
        <Alert
          type={bestanden ? "success" : "warning"}
          showIcon={false}
          title={bestanden
            ? "Kontrolle gespeichert — bestanden."
            : "Kontrolle gespeichert — NICHT bestanden."}
          role="status"
          style={{ marginBlockStart: SPACE.md }}
        />
      ) : null}
      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          role="alert"
          style={{ marginBlockStart: SPACE.md }}
        />
      ) : null}
    </Form>
  );
}
