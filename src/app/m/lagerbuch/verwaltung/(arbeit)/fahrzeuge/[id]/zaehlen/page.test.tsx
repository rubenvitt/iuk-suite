import { isValidElement, type ReactElement, type ReactNode } from "react";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lagerorte } from "../../../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../../../_db/testdb";
import { SeitenKopf } from "../../../../../_ui/SeitenKopf";
import { VerwaltungsZaehlung } from "./VerwaltungsZaehlung";
import ZaehlenSeite, { dynamic, metadata, zaehlenInhalt } from "./page";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

let t: TestDb;

function elementeVomTyp(wert: unknown, typ: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(wert)) return wert.flatMap((k) => elementeVomTyp(k, typ));
  if (isValidElement(wert)) {
    const treffer = wert.type === typ ? [wert as ReactElement<Record<string, unknown>>] : [];
    return [...treffer, ...elementeVomTyp(wert.props, typ)];
  }
  if (wert !== null && typeof wert === "object" && Object.getPrototypeOf(wert) === Object.prototype) {
    return Object.values(wert).flatMap((k) => elementeVomTyp(k, typ));
  }
  return [];
}

function textVon(wert: ReactNode): string {
  if (wert === null || wert === undefined || typeof wert === "boolean") return "";
  if (typeof wert === "string" || typeof wert === "number") return String(wert);
  if (Array.isArray(wert)) return wert.map(textVon).join("");
  if (!isValidElement(wert)) return "";
  return textVon((wert.props as { children?: ReactNode }).children);
}

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-zaehlen-seite-");
  t.db.insert(lagerorte).values({
    id: "fz-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", einheitenart: "fahrzeug", aktiv: true,
  }).run();
});

afterEach(() => t.schliessen());

describe("Zählseite", () => {
  it("ist dynamisch und heisst Zählen", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata).toEqual({ title: "Zählen" });
    expect(ZaehlenSeite).toBeTypeOf("function");
  });

  it("zeigt an einer aktiven Einheit den Kopf und die Insel mit den Daten", () => {
    const seite = zaehlenInhalt(t.db, "fz-1");
    const [kopf] = elementeVomTyp(seite, SeitenKopf);
    expect(kopf.props.titel).toBe("Zählen und einrichten");
    expect(kopf.props.zurueck).toEqual({ titel: "RTW 1", href: "/verwaltung/fahrzeuge/fz-1" });
    expect(textVon(kopf.props.beschreibung as ReactNode)).toContain("RTW 1");
    const [insel] = elementeVomTyp(seite, VerwaltungsZaehlung);
    expect((insel.props.daten as { fahrzeug: { id: string } }).fahrzeug.id).toBe("fz-1");
  });

  it("zeigt an einer stillgelegten Einheit den Leerzustand mit Rückweg und kein notFound", () => {
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();
    const seite = zaehlenInhalt(t.db, "fz-1");
    expect(elementeVomTyp(seite, VerwaltungsZaehlung)).toHaveLength(0);
    expect(JSON.stringify(seite)).toContain("Diese Einheit ist stillgelegt.");
    expect(JSON.stringify(seite)).toContain("/verwaltung/fahrzeuge/fz-1");
  });
});
