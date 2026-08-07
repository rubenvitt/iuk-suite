"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
} from "react";
import { Alert, Button, DatePicker, Form, Input, Radio, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { geraetSpeichern } from "../../../../_actions/geraete";
import type { ActionErgebnis } from "../../../../_lib/actionErgebnis";

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

const SPEICHER_FEHLER = "Gerät konnte nicht gespeichert werden.";

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
  lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
}) {
  const [form] = Form.useForm<Werte>();
  const router = useRouter();
  const absendenLaeuft = useRef(false);
  const [zustand, absenden, laeuft] = useActionState<
    ActionErgebnis<{ id: string }> | null,
    Werte
  >(async (_vorher, werte) => {
    try {
      const ergebnis = await geraetSpeichern({
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
      if (ergebnis.ok) router.refresh();
      return ergebnis;
    } catch {
      return { ok: false, fehler: SPEICHER_FEHLER };
    } finally {
      absendenLaeuft.current = false;
    }
  }, null);

  useEffect(() => {
    const feldFehler = zustand && !zustand.ok ? zustand.feldFehler ?? {} : {};
    form.setFields(FORM_FELDER.map((name) => ({
      name,
      errors: feldFehler[name] ? [feldFehler[name]] : [],
    })));
  }, [form, zustand]);

  const typ = Form.useWatch("typ", form) ?? initial.typ;
  const standorte: LagerortSelectOption[] = lagerorte.map((lagerort) => ({
    value: lagerort.id,
    label: lagerort.name,
  }));

  function speichern(werte: Werte): void {
    if (absendenLaeuft.current) return;
    absendenLaeuft.current = true;
    startTransition(() => absenden(werte));
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
      style={{ maxWidth: 760, marginBlockStart: 20 }}
    >
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
            aria-label="Nächste MTK"
            allowClear
            format="YYYY-MM-DD"
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
              aria-label="Ablaufdatum"
              allowClear
              format="YYYY-MM-DD"
            />
          </Form.Item>
        </>
      )}

      <Form.Item name="anmerkung" label="Anmerkung (optional)">
        <Input aria-label="Anmerkung" placeholder="Freitext" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={laeuft}>
        Speichern
      </Button>
      {zustand?.ok ? (
        <Alert
          type="success"
          showIcon={false}
          title="Gespeichert."
          style={{ marginBlockStart: 12 }}
        />
      ) : null}
      {zustand && !zustand.ok ? (
        <Alert
          type="warning"
          showIcon={false}
          title={zustand.fehler}
          style={{ marginBlockStart: 12 }}
        />
      ) : null}
    </Form>
  );
}
