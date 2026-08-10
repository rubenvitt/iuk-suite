// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { BzScanner } from "./BzScanner";
import BzScanSeite, { dynamic } from "./page";

type ScannerProps = {
  zuBarcode: (rohwert: string) => Promise<{ id: string } | null>;
  zielPfad: (id: string) => string;
};

const mocks = vi.hoisted(() => ({
  bzZuBarcode: vi.fn(),
  scannerProps: null as ScannerProps | null,
}));

vi.mock("../../../../_ui/BarcodeScanner", () => ({
  BarcodeScanner: (props: ScannerProps) => {
    mocks.scannerProps = props;
    return <div data-rolle="scanner" data-ziel={props.zielPfad("bz-probe")} />;
  },
}));

vi.mock("../../../../_actions/bz", () => ({
  geraetZuBarcode: (...args: unknown[]) => mocks.bzZuBarcode(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scannerProps = null;
  mocks.bzZuBarcode.mockResolvedValue({ ok: true, wert: null });
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
    "BzScanner.tsx",
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
    "BzScanner.tsx",
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

describe("BzScanner", () => {
  it("übergibt den äußeren BZ-Zielpfad und ist eine echte Client-Insel", async () => {
    await mount(<BzScanner />);

    expect(query("[data-rolle='scanner']").getAttribute("data-ziel"))
      .toBe("/verwaltung/bz/bz-probe");
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/scan/BzScanner.tsx",
      "utf8",
    );
    expect(ersteDirektive(quelle)).toBe("use client");
    expect(importPfade(quelle).filter((pfad) => pfad.includes("_actions/")))
      .toEqual(["../../../../_actions/bz"]);
  });

  it("ruft ausschließlich die BZ-Action auf und gibt deren Treffer weiter", async () => {
    mocks.bzZuBarcode.mockResolvedValueOnce({
      ok: true,
      wert: { id: "bz-77" },
    });
    await mount(<BzScanner />);

    await expect(scannerProps().zuBarcode("  BZ-ROH  "))
      .resolves.toEqual({ id: "bz-77" });
    expect(mocks.bzZuBarcode).toHaveBeenCalledOnce();
    expect(mocks.bzZuBarcode).toHaveBeenCalledWith("  BZ-ROH  ");
  });

  it("bildet ok mit wert null auf null ab", async () => {
    mocks.bzZuBarcode.mockResolvedValueOnce({ ok: true as const, wert: null });
    await mount(<BzScanner />);

    await expect(scannerProps().zuBarcode("BZ-LEER")).resolves.toBeNull();
  });

  /**
   * `null` heiszt im Scanner „Code ist unbekannt" und wird der Person auch so
   * gemeldet. Ein gescheiterter LESEVORGANG ist etwas anderes und muss in den
   * catch-Zweig von `BarcodeScanner` laufen („Suche fehlgeschlagen – bitte
   * erneut versuchen."). Sonst steht am Regal die sachlich falsche Auskunft,
   * das Geraet sei nicht erfasst.
   */
  it("wirft bei einem Actionfehler, statt Unbekanntheit zu behaupten", async () => {
    mocks.bzZuBarcode.mockResolvedValueOnce({
      ok: false as const,
      fehler: "BZ-Suche fehlgeschlagen",
    });
    await mount(<BzScanner />);

    await expect(scannerProps().zuBarcode("BZ-LEER"))
      .rejects.toThrow("BZ-Suche fehlgeschlagen");
  });
});

describe("BZ-Scan-Seite", () => {
  it("ist dynamisch und führt per Brotkrume zurück zur BZ-Liste", () => {
    const inhalt = BzScanSeite();
    const brotkrume = elementeVomTyp(inhalt, Brotkrume)[0];
    const kopf = elementeVomTyp(inhalt, SeitenKopf)[0];

    expect(dynamic).toBe("force-dynamic");
    expect((brotkrume.props as { href: string }).href).toBe("/verwaltung/bz");
    expect((brotkrume.props as { children: ReactNode }).children).toBe("BZ-Kontrolle");
    expect((kopf.props as { titel: string }).titel).toBe("Gerät scannen");
    expect(elementeVomTyp(inhalt, BzScanner)).toHaveLength(1);
  });

  it("importiert kein Icon-Paket und bleibt eine directive-freie Server Component", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/scan/page.tsx",
      "utf8",
    );
    const importe = importPfade(quelle);

    expect(importe).not.toContain("@ant-design/icons");
    expect(importe).not.toContain("lucide-react");
    expect(ersteDirektive(quelle)).not.toBe("use client");
  });
});
