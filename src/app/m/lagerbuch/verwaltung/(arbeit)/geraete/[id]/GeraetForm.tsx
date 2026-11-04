"use client";

import { useEffect, useState } from "react";
import { Alert, Button, DatePicker, Form, Input, Radio, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { enterUebernimmtNurDasFeld } from "@/core/formular/enter";
import { Felder } from "@/core/seite/Seite";
import { SPACE } from "@/core/theme/tokens";
import { geraetSpeichern } from "../../../../_actions/geraete";
import { standortMeta } from "../../../../_lib/konstanten";
import type { LagerortOption as Lagerort } from "../../../../_lib/lesepfade/bz";
import type { ActionErgebnis } from "../../../../_lib/actionErgebnis";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";
import { useFormEntwurf } from "@/core/entwurf/useFormEntwurf";
import { EntwurfZeile } from "../../../../_ui/EntwurfZeile";

export type GeraetInitial = {
  id: string;
  typ: "medizin" | "objekt";
  name: string;
  barcode: string | null;
  lagerortId: string;
  anmerkung: string | null;
  mtkFaellig: string | null;
  beschreibung: string | null;
  ablaufdatum: string | null;
};

type Werte = {
  typ: "medizin" | "objekt";
  name: string;
  barcode?: string;
  lagerortId: string;
  anmerkung?: string;
  mtkFaellig?: Dayjs | null;
  beschreibung?: string;
  ablaufdatum?: Dayjs | null;
};

type LagerortSelectOption = {
  value: string;
  label: string;
};

const FORM_FELDER = [
  "typ",
  "name",
  "barcode",
  "lagerortId",
  "anmerkung",
  "mtkFaellig",
  "beschreibung",
  "ablaufdatum",
] as const;

/** Tagesgenau: `_ui/monat.ts` liefert absichtlich nur YYYY-MM. */
function tag(datum: Dayjs | null | undefined): string | undefined {
  return datum?.format("YYYY-MM-DD");
}

function optionalerText(wert: string | undefined): string | undefined {
  return wert?.trim() || undefined;
}

export function lagerortFilter(
  eingabe: string,
  option?: LagerortSelectOption,
): boolean {
  return (option?.label ?? "")
    .toLocaleLowerCase("de")
    .includes(eingabe.trim().toLocaleLowerCase("de"));
}

export function GeraetForm({
  initial,
  lagerorte,
}: {
  initial: GeraetInitial;
  lagerorte: Lagerort[];
}) {
  const [form] = Form.useForm<Werte>();
  const router = useRouter();
  const [zustand, setZustand] = useState<ActionErgebnis<{ id: string }> | null>(null);
  /*
   * IDA-358 — DIE AENDERUNGEN LIEGEN AUF DEM GERAET, bis der Server sie
   * bestaetigt. Mit `senden` und nicht nur Wiederherstellen, weil der Erfolg
   * hier KEIN Zuruecksetzen ist: das Formular zeigt danach den gespeicherten
   * Stand, und `verwerfen()` setzte es auf die `initialValues` von VOR dem
   * Speichern zurueck. Ein Wurf (Netz, Rollout) wird wiederholt; das ist hier
   * gefahrlos, `geraetSpeichern` aendert einen Datensatz und legt keinen an.
   */
  const entwurf = useFormEntwurf<
    Werte,
    Parameters<typeof geraetSpeichern>[0] & object,
    Awaited<ReturnType<typeof geraetSpeichern>>
  >(form, `lagerbuch:geraet:${initial.id}`, {
    senden: (nutzlast) => geraetSpeichern(nutzlast),
    antwort: (ergebnis) => {
      setZustand(ergebnis);
      if (!ergebnis.ok) return false;
      router.refresh();
      return true;
    },
  });
  const laeuft = entwurf.zustand !== "ruhe";

  useEffect(() => {
    const feldFehler = zustand && !zustand.ok ? zustand.feldFehler ?? {} : {};
    form.setFields(FORM_FELDER.map((name) => ({
      name,
      errors: feldFehler[name] ? [feldFehler[name]] : [],
    })));
  }, [form, zustand]);

  const typ = Form.useWatch("typ", form) ?? initial.typ;
  /*
   * ⚠️ DIE ART STEHT IM LABEL, NICHT NUR IM NAMEN (DRK-309, Reviewrunde 5).
   * `lagerorte.name` trägt keinen Eindeutigkeitsschlüssel — ein Fahrzeug und
   * eine Tasche dürfen gleich heißen, und dann hängt das Gerät am falschen
   * Träger, ohne dass die Liste es je gezeigt hätte. Dieselbe Form wie in der
   * Artikelschublade und bei den Zugangs-Codes; das Handlager sagt „Lager"
   * und nicht „nicht zugeordnet" (Begründung an `standortMeta`).
   */
  const standorte: LagerortSelectOption[] = lagerorte.map((lagerort) => ({
    value: lagerort.id,
    label: `${lagerort.name} · ${standortMeta(lagerort)}`,
  }));

  function speichern(werte: Werte): void {
    if (laeuft) return;
    setZustand(null);
    // Ein Wurf (Netz, Rollout) faengt `useFormEntwurf`; `EntwurfZeile` sagt
    // „Nicht gesendet". Der feste Satz fuer den Wurf ist damit ersetzt.
    entwurf.sende({
      id: initial.id,
      typ: werte.typ,
      name: werte.name.trim(),
      barcode: optionalerText(werte.barcode),
      lagerortId: werte.lagerortId,
      anmerkung: optionalerText(werte.anmerkung),
      mtkFaellig: werte.typ === "medizin" ? tag(werte.mtkFaellig) : undefined,
      beschreibung: werte.typ === "objekt"
        ? optionalerText(werte.beschreibung)
        : undefined,
      ablaufdatum: werte.typ === "objekt" ? tag(werte.ablaufdatum) : undefined,
    });
  }

  return (
    <Form<Werte>
      form={form}
      layout="vertical"
      disabled={laeuft}
      initialValues={{
        typ: initial.typ,
        name: initial.name,
        barcode: initial.barcode ?? "",
        lagerortId: initial.lagerortId,
        anmerkung: initial.anmerkung ?? "",
        mtkFaellig: initial.mtkFaellig ? dayjs(initial.mtkFaellig) : null,
        beschreibung: initial.beschreibung ?? "",
        ablaufdatum: initial.ablaufdatum ? dayjs(initial.ablaufdatum) : null,
      }}
      onFinish={speichern}
      onValuesChange={entwurf.onValuesChange}
      // 20 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) und hat keine
      // Geschwisterzeile in dieser Datei; bleibt Literal. Die Breite trägt die Seite (`formular`).
      style={{ marginBlockStart: 20 }}
    >
      <EntwurfZeile entwurf={entwurf} />
      <Felder>
        <Form.Item name="typ" label="Klasse">
          <Radio.Group
            options={[
              { value: "medizin", label: "Medizinisches Gerät" },
              { value: "objekt", label: "Objekt" },
            ]}
          />
        </Form.Item>
        <Form.Item name="name" label="Bezeichnung">
          <Input aria-label="Bezeichnung" placeholder="z. B. Corpuls C3" />
        </Form.Item>
        <Form.Item name="barcode" label="Barcode (optional)">
          <Input aria-label="Barcode" placeholder="Barcode / Seriennummer" />
        </Form.Item>
        <Form.Item name="lagerortId" label="Standort">
          <Select<string, LagerortSelectOption>
            aria-label="Standort"
            showSearch
            placeholder="Standort wählen…"
            options={standorte}
            filterOption={lagerortFilter}
          />
        </Form.Item>

        {typ === "medizin" ? (
          <Form.Item name="mtkFaellig" label="Nächste MTK (optional)">
            <DatePicker
              popupAlign={WAEHLER_IM_BILD}
              aria-label="Nächste MTK"
              allowClear
              format="YYYY-MM-DD"
              onKeyDown={enterUebernimmtNurDasFeld}
            />
          </Form.Item>
        ) : (
          <>
            <Form.Item name="beschreibung" label="Beschreibung (optional)">
              <Input
                aria-label="Beschreibung"
                placeholder="z. B. Spineboard mit Gurtspinne"
              />
            </Form.Item>
            <Form.Item name="ablaufdatum" label="Ablaufdatum (optional)">
              <DatePicker
                popupAlign={WAEHLER_IM_BILD}
                aria-label="Ablaufdatum"
                allowClear
                format="YYYY-MM-DD"
                onKeyDown={enterUebernimmtNurDasFeld}
              />
            </Form.Item>
          </>
        )}

        <Form.Item name="anmerkung" label="Anmerkung (optional)">
          <Input aria-label="Anmerkung" placeholder="Freitext" />
        </Form.Item>
      </Felder>
      <Button type="primary" htmlType="submit" loading={entwurf.zustand === "sendet"}>
        Speichern
      </Button>
      {zustand?.ok ? (
        <Alert
          type="success"
          showIcon={false}
          title="Gespeichert."
          style={{ marginBlockStart: SPACE.md }}
        />
      ) : null}
      {zustand && !zustand.ok ? (
        <Alert
          type="warning"
          showIcon={false}
          title={zustand.fehler}
          style={{ marginBlockStart: SPACE.md }}
        />
      ) : null}
    </Form>
  );
}
