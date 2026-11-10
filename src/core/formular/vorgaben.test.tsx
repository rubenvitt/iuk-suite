// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigProvider, Form, Input, type FormInstance } from "antd";
import deDE from "antd/locale/de_DE";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { mount, unmount } from "@/app/m/qr/_lib/test-dom";
import { FORMULAR_VORGABEN } from "./vorgaben";

afterEach(async () => {
  await unmount();
});

async function meldungen(regeln: Parameters<typeof Form.Item>[0]["rules"], wert?: string): Promise<string[]> {
  let formular: FormInstance | null = null;
  function Pruefling() {
    const [f] = Form.useForm();
    formular = f;
    return (
      <ConfigProvider locale={deDE} form={FORMULAR_VORGABEN}>
        <Form form={f} initialValues={{ typ: wert }}>
          <Form.Item name="typ" label="Typ" rules={regeln}>
            <Input />
          </Form.Item>
        </Form>
      </ConfigProvider>
    );
  }
  await mount(<Pruefling />);
  let fehler: string[] = [];
  await act(async () => {
    await formular!.validateFields().catch((e: { errorFields: { errors: string[] }[] }) => {
      fehler = e.errorFields.flatMap((f) => f.errors);
    });
  });
  return fehler;
}

describe("Prüfmeldungen der Suite", () => {
  it("sagt, was fehlt, statt zu siezen", async () => {
    expect(await meldungen([{ required: true }])).toEqual(["Typ fehlt."]);
  });

  it("nennt eine falsche Adresse ohne Fachwort", async () => {
    expect(await meldungen([{ type: "email" }], "kein-at")).toEqual(["Typ ist keine gültige E-Mail-Adresse."]);
  });

  it("lässt eine eigene Meldung an der Regel vorgehen", async () => {
    expect(await meldungen([{ required: true, message: "Bitte den Typ wählen." }])).toEqual(["Bitte den Typ wählen."]);
  });

  it("enthält keine Sie-Form", () => {
    expect(JSON.stringify(FORMULAR_VORGABEN.validateMessages)).not.toMatch(/\b(Sie|Ihr|Ihre)\b/);
  });

  it("hängt am ConfigProvider der Suite", () => {
    const quelle = readFileSync(join(__dirname, "..", "theme", "AntdProvider.tsx"), "utf8");
    expect(quelle).toMatch(/<ConfigProvider[^>]*\bform=\{FORMULAR_VORGABEN\}/);
  });
});
