// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import {
  act,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  exists,
  fill,
  mount,
  query,
  queryAll,
  submitForm,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { bzGeraete, lagerorte } from "../../../../../_db/schema";
import { migrierteTestDb } from "../../../../../_db/testdb";
import { Brotkrume } from "../../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../../_ui/SeitenKopf";
import { KontrolleForm } from "./KontrolleForm";
import { dynamic, kontrolleSeiteInhalt } from "./page";

const mocks = vi.hoisted(() => ({
  kontrolleErfassen: vi.fn(),
}));

vi.mock("../../../../../_actions/bz", () => ({
  kontrolleErfassen: (...args: unknown[]) => mocks.kontrolleErfassen(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const LEVEL_1 = { label: "Kontrolllösung niedrig", min: 40, max: 60 };
const LEVEL_2_TEILWEISE = { label: null, min: null, max: 350 };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
  vi.clearAllMocks();
  mocks.kontrolleErfassen.mockResolvedValue({
    ok: true,
    wert: { id: "kontrolle-1", bestanden: true },
  });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function waehleMonat(monat: string): Promise<void> {
  await clickElement(query("[aria-label='Kompressen-Verfall']"));
  await warte();
  const zelle = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-picker-cell"))
    .find((element) => element.getAttribute("title") === monat);
  if (!zelle) throw new Error(`Monat nicht gefunden: ${monat}`);
  await clickElement(zelle);
  await warte();
}

async function waehleAkku(labelText: "ja" | "nein"): Promise<void> {
  const label = queryAll<HTMLElement>(".ant-radio-wrapper")
    .find((element) => element.textContent?.trim() === labelText);
  if (!label) throw new Error(`Akku-Auswahl nicht gefunden: ${labelText}`);
  await clickElement(label);
}

async function warteAufAction(): Promise<void> {
  for (let versuch = 0; versuch < 20; versuch += 1) {
    if (mocks.kontrolleErfassen.mock.calls.length > 0) return;
    await warte();
  }
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 20; versuch += 1) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  return [
    ...treffer,
    ...elementeVomTyp((wert.props as { children?: ReactNode }).children, typ),
  ];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (wert === null || typeof wert === "string" || typeof wert === "boolean") return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (typeof wert !== "object" || isValidElement(wert) || wert instanceof Date) return false;
  if (Object.getPrototypeOf(wert) !== Object.prototype) return false;
  return Object.values(wert).every(istRekursivJsonSicher);
}

function ersteDirektive(quelle: string): string | null {
  const source = ts.createSourceFile(
    "kontrolle.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const [ersteAnweisung] = source.statements;
  return ersteAnweisung
    && ts.isExpressionStatement(ersteAnweisung)
    && ts.isStringLiteral(ersteAnweisung.expression)
    ? ersteAnweisung.expression.text
    : null;
}

describe("KontrolleForm: gebundene und zugängliche Felder", () => {
  it("trägt use client kommentarrobust als echte erste Direktive, die Seite dagegen nicht", () => {
    const insel = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/kontrolle/KontrolleForm.tsx",
      "utf8",
    );
    const seite = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/kontrolle/page.tsx",
      "utf8",
    );
    expect(ersteDirektive(insel)).toBe("use client");
    expect(ersteDirektive('const wert = 1;\n"use client";')).toBeNull();
    expect(ersteDirektive(seite)).not.toBe("use client");
  });

  it("nennt beide Level mit den serverseitigen Labels und auch teilweise unbekannten Grenzen", async () => {
    await mount(
      <KontrolleForm
        geraetId="bz-1"
        level1={LEVEL_1}
        level2={LEVEL_2_TEILWEISE}
      />,
    );

    expect(document.body.textContent).toContain("Kontrolllösung niedrig (40–60)");
    expect(document.body.textContent).toContain("Level 2 (?–350)");
    expect(queryAll("input[data-rolle='level-wert']")).toHaveLength(2);
  });

  it("lässt bis 9999 Teststreifen und Lanzetten zu", async () => {
    await mount(<KontrolleForm geraetId="bz-1" level1={LEVEL_1} level2={null} />);

    expect(query("input[data-rolle='sticks']").getAttribute("aria-valuemax"))
      .toBe("9999");
    expect(query("input[data-rolle='lanzetten']").getAttribute("aria-valuemax"))
      .toBe("9999");
  });

  it("stellt Akku gewechselt als genau eine echte Radio.Group bereit", async () => {
    await mount(<KontrolleForm geraetId="bz-1" level1={LEVEL_1} level2={null} />);

    expect(queryAll(".ant-radio-group")).toHaveLength(1);
    expect(query(".ant-radio-group").getAttribute("aria-label")).toBe("Akku gewechselt");
    expect(exists("button[aria-pressed]")).toBe(false);
  });

  it("bindet den Kompressen-Verfall an einen DatePicker picker=month", async () => {
    await mount(<KontrolleForm geraetId="bz-1" level1={LEVEL_1} level2={null} />);

    expect(exists("input[type='month']")).toBe(false);
    expect(query("input[data-rolle='kompresse']").getAttribute("aria-label"))
      .toBe("Kompressen-Verfall");
  });

  it("hält Form.Item in der Client-Insel und die Controls direkt in ihren Form.Items", async () => {
    const seite = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/kontrolle/page.tsx",
      "utf8",
    );
    expect(seite).not.toMatch(/Form\.Item/);

    await mount(<KontrolleForm geraetId="bz-1" level1={LEVEL_1} level2={null} />);
    for (const ariaLabel of [
      "Kompressen-Verfall",
      "Teststreifen",
      "Lanzetten",
      "Akku gewechselt",
      "Kommentar",
    ]) {
      expect(query(`[aria-label='${ariaLabel}']`).closest(".ant-form-item")).not.toBeNull();
    }
  });
});

describe("KontrolleForm: Action-Payload", () => {
  it("sendet Monat, Maximalbestände, Messwerte, Kommentar und Akku ja exakt", async () => {
    await mount(
      <KontrolleForm
        geraetId="bz-1"
        level1={LEVEL_1}
        level2={{ label: "Kontrolllösung hoch", min: 250, max: 350 }}
      />,
    );

    await fill("input[aria-label='Kontrolllösung niedrig (40–60)']", "55");
    await fill("input[aria-label='Kontrolllösung hoch (250–350)']", "300");
    await waehleMonat("2026-09");
    await fill("input[aria-label='Teststreifen']", "9999");
    await fill("input[aria-label='Lanzetten']", "9999");
    await waehleAkku("ja");
    await fill("input[aria-label='Kommentar']", "Alles geprüft");
    await submitForm("form[aria-label='BZ-Kontrolle erfassen']");
    await warteAufAction();

    expect(mocks.kontrolleErfassen).toHaveBeenCalledOnce();
    expect(mocks.kontrolleErfassen).toHaveBeenCalledWith({
      geraetId: "bz-1",
      level1Wert: 55,
      level2Wert: 300,
      kompresseVerfall: "2026-09",
      sticks: 9999,
      lanzetten: 9999,
      batterieGewechselt: true,
      kommentar: "Alles geprüft",
    });
  });

  it("sendet die sichtbaren Nullzustände und den Radio-Default nein", async () => {
    await mount(<KontrolleForm geraetId="bz-2" level1={LEVEL_1} level2={null} />);

    expect(query<HTMLInputElement>("input[value='false']").checked).toBe(true);
    await submitForm("form[aria-label='BZ-Kontrolle erfassen']");
    await warteAufAction();

    expect(mocks.kontrolleErfassen).toHaveBeenCalledWith({
      geraetId: "bz-2",
      kompresseVerfall: undefined,
      sticks: 0,
      lanzetten: 0,
      batterieGewechselt: false,
    });
  });
});

describe("KontrolleForm: Erfolg und Reset", () => {
  it("meldet bestanden und setzt alle Eingaben auf ihre sichtbaren Defaults zurück", async () => {
    await mount(
      <KontrolleForm
        geraetId="bz-1"
        level1={LEVEL_1}
        level2={{ label: "Kontrolllösung hoch", min: 250, max: 350 }}
      />,
    );
    await fill("input[aria-label='Kontrolllösung niedrig (40–60)']", "55");
    await fill("input[aria-label='Kontrolllösung hoch (250–350)']", "300");
    await waehleMonat("2026-09");
    await fill("input[aria-label='Teststreifen']", "12");
    await fill("input[aria-label='Lanzetten']", "8");
    await waehleAkku("ja");
    await fill("input[aria-label='Kommentar']", "Kontrolle vollständig");

    await submitForm("form[aria-label='BZ-Kontrolle erfassen']");
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Kontrolle gespeichert — bestanden."),
      "Erfolgsmeldung",
    );

    expect(exists(".ant-alert-success")).toBe(true);
    expect(query<HTMLInputElement>("input[aria-label='Kontrolllösung niedrig (40–60)']").value)
      .toBe("");
    expect(query<HTMLInputElement>("input[aria-label='Kontrolllösung hoch (250–350)']").value)
      .toBe("");
    expect(query<HTMLInputElement>("input[aria-label='Kompressen-Verfall']").value).toBe("");
    expect(query<HTMLInputElement>("input[aria-label='Teststreifen']").value).toBe("0");
    expect(query<HTMLInputElement>("input[aria-label='Lanzetten']").value).toBe("0");
    expect(query<HTMLInputElement>("input[value='false']").checked).toBe(true);
    expect(query<HTMLInputElement>("input[aria-label='Kommentar']").value).toBe("");
  });

  it("kennzeichnet ein nicht bestandenes Action-Ergebnis ausdrücklich als Warnung", async () => {
    mocks.kontrolleErfassen.mockResolvedValueOnce({
      ok: true,
      wert: { id: "kontrolle-2", bestanden: false },
    });
    await mount(<KontrolleForm geraetId="bz-1" level1={LEVEL_1} level2={null} />);

    await submitForm("form[aria-label='BZ-Kontrolle erfassen']");
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Kontrolle gespeichert — NICHT bestanden."),
      "Nicht-bestanden-Warnung",
    );

    expect(exists(".ant-alert-warning")).toBe(true);
  });
});

describe("KontrolleForm: erwartete Action-Fehler", () => {
  it("bindet Feldfehler an die Controls, zeigt den allgemeinen Text und behält Eingaben", async () => {
    mocks.kontrolleErfassen.mockResolvedValueOnce({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: {
        kompresseVerfall: "Verfall muss YYYY-MM sein",
        sticks: "Teststreifen dürfen höchstens 9999 sein",
      },
    });
    await mount(<KontrolleForm geraetId="bz-1" level1={LEVEL_1} level2={null} />);
    await fill("input[aria-label='Teststreifen']", "42");

    await submitForm("form[aria-label='BZ-Kontrolle erfassen']");
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Bitte die markierten Felder prüfen."),
      "allgemeiner Action-Fehler",
    );
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Verfall muss YYYY-MM sein")
        && (document.body.textContent ?? "")
          .includes("Teststreifen dürfen höchstens 9999 sein"),
      "gebundene Feldfehler",
    );

    expect(document.body.textContent).toContain("Verfall muss YYYY-MM sein");
    expect(document.body.textContent).toContain("Teststreifen dürfen höchstens 9999 sein");
    expect(query<HTMLInputElement>("input[aria-label='Teststreifen']").value).toBe("42");
    expect(exists(".ant-alert-warning")).toBe(true);
  });

  it("zeigt einen allgemeinen Action-Fehler ohne erfundene Feldzuordnung", async () => {
    mocks.kontrolleErfassen.mockResolvedValueOnce({
      ok: false,
      fehler: "Gerät nicht gefunden.",
    });
    await mount(<KontrolleForm geraetId="bz-verschwunden" level1={LEVEL_1} level2={null} />);

    await submitForm("form[aria-label='BZ-Kontrolle erfassen']");
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Gerät nicht gefunden."),
      "allgemeiner Fehler ohne Feldfehler",
    );

    expect(queryAll(".ant-form-item-explain-error")).toHaveLength(0);
    expect(exists(".ant-alert-warning")).toBe(true);
  });
});

describe("KontrolleForm: Laufzeitfehler", () => {
  it("zeigt bei verworfenem Promise nur den festen Clienttext und behält die Eingabe", async () => {
    mocks.kontrolleErfassen.mockRejectedValueOnce(
      new Error("interne Datenbankverbindung mit Geheimnis"),
    );
    await mount(<KontrolleForm geraetId="bz-1" level1={LEVEL_1} level2={null} />);
    await fill("input[aria-label='Kommentar']", "Bitte erneut versuchen");

    await submitForm("form[aria-label='BZ-Kontrolle erfassen']");
    await warteAuf(
      () => (document.body.textContent ?? "")
        .includes("Kontrolle konnte nicht gespeichert werden."),
      "fester Laufzeitfehler",
    );

    expect(document.body.textContent).not.toContain("Datenbankverbindung");
    expect(query<HTMLInputElement>("input[aria-label='Kommentar']").value)
      .toBe("Bitte erneut versuchen");
    expect(exists(".ant-alert-warning")).toBe(true);
  });
});

describe("Kontrollseite als Server Component", () => {
  it("lädt das Gerät serverseitig, reicht nur ein serialisierbares DTO und navigiert zurück zum Geräteblatt", () => {
    const testDb = migrierteTestDb("lagerbuch-bz-kontrollseite-");
    try {
      testDb.db.insert(lagerorte).values({
        id: "fahrzeug-1",
        name: "RTW 1",
        typ: "fahrzeug",
        kennung: "UE-RK 1234",
        aktiv: true,
      }).run();
      testDb.db.insert(bzGeraete).values({
        id: "bz-1",
        name: "Accu-Chek A",
        barcode: "1234567890128",
        lagerortId: "fahrzeug-1",
        streifenLot: "LOT-42",
        level1Label: "Niedrig",
        level1Min: 40,
        level1Max: 60,
        level2Label: null,
        level2Min: null,
        level2Max: 350,
        aktiv: true,
        createdAt: new Date("2026-08-07T12:00:00Z"),
      }).run();

      const inhalt = kontrolleSeiteInhalt(testDb.db, "bz-1");
      const form = elementeVomTyp(inhalt, KontrolleForm)[0];
      const formProps = form.props as {
        geraetId: string;
        level1: unknown;
        level2: unknown;
      };
      expect(formProps).toEqual({
        geraetId: "bz-1",
        level1: { label: "Niedrig", min: 40, max: 60 },
        level2: { label: null, min: null, max: 350 },
      });
      expect(istRekursivJsonSicher(formProps)).toBe(true);

      const brotkrume = elementeVomTyp(inhalt, Brotkrume)[0];
      expect((brotkrume.props as { href: string }).href).toBe("/verwaltung/bz/bz-1");
      expect((brotkrume.props as { children: ReactNode }).children).toBe("Accu-Chek A");
      const kopf = elementeVomTyp(inhalt, SeitenKopf)[0];
      expect((kopf.props as { titel: string }).titel).toBe("Kontrolle erfassen");
      expect(dynamic).toBe("force-dynamic");
    } finally {
      testDb.schliessen();
    }
  });

  it("liefert für eine unbekannte Geräte-ID den Next-404-Weg", () => {
    const testDb = migrierteTestDb("lagerbuch-bz-kontrollseite-404-");
    try {
      expect(() => kontrolleSeiteInhalt(testDb.db, "fehlt")).toThrow("NEXT_NOT_FOUND");
    } finally {
      testDb.schliessen();
    }
  });
});
