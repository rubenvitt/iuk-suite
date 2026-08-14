// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { GeraetScanner } from "./GeraetScanner";
import GeraetScanSeite, { dynamic } from "./page";

type ScannerProps = {
  zuBarcode: (rohwert: string) => Promise<{ id: string } | null>;
  zielPfad: (id: string) => string;
};

const mocks = vi.hoisted(() => ({
  geraeteZuBarcode: vi.fn(),
  scannerProps: null as ScannerProps | null,
}));

vi.mock("../../../../_ui/BarcodeScanner", () => ({
  BarcodeScanner: (props: ScannerProps) => {
    mocks.scannerProps = props;
    return <div data-rolle="scanner" data-ziel={props.zielPfad("geraet-probe")} />;
  },
}));

vi.mock("../../../../_actions/geraete", () => ({
  geraetZuBarcode: (...args: unknown[]) => mocks.geraeteZuBarcode(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scannerProps = null;
  mocks.geraeteZuBarcode.mockResolvedValue({ ok: true, wert: null });
});

afterEach(async () => {
  await unmount();
});

function scannerProps(): ScannerProps {
  if (!mocks.scannerProps) throw new Error("BarcodeScanner-Props fehlen");
  return mocks.scannerProps;
}

function ersteDirektive(quelle: string): string | null {
  const source = ts.createSourceFile(
    "GeraetScanner.tsx",
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

function importPfade(quelle: string): string[] {
  const source = ts.createSourceFile(
    "GeraetScanner.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return source.statements
    .filter(ts.isImportDeclaration)
    .map((anweisung) => anweisung.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((modul) => modul.text);
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

describe("GeraetScanner", () => {
  it("übergibt den äußeren Geräte-Zielpfad und ist eine echte Client-Insel", async () => {
    await mount(<GeraetScanner />);

    expect(query("[data-rolle='scanner']").getAttribute("data-ziel"))
      .toBe("/verwaltung/geraete/geraet-probe");
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/scan/GeraetScanner.tsx",
      "utf8",
    );
    expect(ersteDirektive(quelle)).toBe("use client");
    expect(importPfade(quelle).filter((pfad) => pfad.includes("_actions/")))
      .toEqual(["../../../../_actions/geraete"]);
  });

  it("ruft ausschließlich die Geräte-Action auf und gibt deren Treffer weiter", async () => {
    mocks.geraeteZuBarcode.mockResolvedValueOnce({
      ok: true,
      wert: { id: "geraet-88" },
    });
    await mount(<GeraetScanner />);

    await expect(scannerProps().zuBarcode("  GERÄT-ROH  "))
      .resolves.toEqual({ id: "geraet-88" });
    expect(mocks.geraeteZuBarcode).toHaveBeenCalledOnce();
    expect(mocks.geraeteZuBarcode).toHaveBeenCalledWith("  GERÄT-ROH  ");
  });

  it("bildet ok mit wert null auf null ab", async () => {
    mocks.geraeteZuBarcode.mockResolvedValueOnce({ ok: true as const, wert: null });
    await mount(<GeraetScanner />);

    await expect(scannerProps().zuBarcode("GERÄT-LEER")).resolves.toBeNull();
  });

  /**
   * `null` heiszt im Scanner „Code ist unbekannt" und wird der Person auch so
   * gemeldet. Ein gescheiterter LESEVORGANG ist etwas anderes und muss in den
   * catch-Zweig von `BarcodeScanner` laufen („Suche fehlgeschlagen – bitte
   * erneut versuchen."). Sonst steht am Regal die sachlich falsche Auskunft,
   * das Geraet sei nicht erfasst.
   */
  it("wirft bei einem Actionfehler, statt Unbekanntheit zu behaupten", async () => {
    mocks.geraeteZuBarcode.mockResolvedValueOnce({
      ok: false as const,
      fehler: "Gerätesuche fehlgeschlagen",
    });
    await mount(<GeraetScanner />);

    await expect(scannerProps().zuBarcode("GERÄT-LEER"))
      .rejects.toThrow("Gerätesuche fehlgeschlagen");
  });
});

describe("Geräte-Scan-Seite", () => {
  it("ist dynamisch und führt per Seitenkopf-Rueckweg zurück zur Geräte-Liste", () => {
    const inhalt = GeraetScanSeite();
    const kopf = elementeVomTyp(inhalt, SeitenKopf)[0];

    expect(dynamic).toBe("force-dynamic");
    expect((kopf.props as { titel: string }).titel).toBe("Gerät scannen");
    expect((kopf.props as {
      zurueck?: { titel: string; href: string };
    }).zurueck).toEqual({ titel: "Geräte", href: "/verwaltung/geraete" });
    expect(elementeVomTyp(inhalt, GeraetScanner)).toHaveLength(1);
  });

  it("importiert kein Icon-Paket und bleibt eine directive-freie Server Component", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/scan/page.tsx",
      "utf8",
    );
    const importe = importPfade(quelle);

    expect(importe).not.toContain("@ant-design/icons");
    expect(importe).not.toContain("lucide-react");
    expect(ersteDirektive(quelle)).not.toBe("use client");
  });
});
