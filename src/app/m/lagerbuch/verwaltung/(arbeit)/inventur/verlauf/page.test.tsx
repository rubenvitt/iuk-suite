import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artikel, inventuren, inventurPositionen } from "../../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../../_db/testdb";
import { INVENTUR_VERLAUF_GRENZE } from "../../../../_lib/grenzen";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import InventurVerlaufSeite, { dynamic, verlaufSeitenInhalt } from "./page";
import { VerlaufTabelle } from "./VerlaufTabelle";

/** Muster „Inventurseite als RSC" (`inventur/InventurForm.test.tsx`). */
function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  return [
    ...(wert.type === typ ? [wert] : []),
    ...Object.values(wert.props as Record<string, ReactNode>)
      .flatMap((prop) => elementeVomTyp(prop, typ)),
  ];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (wert === null || typeof wert === "string" || typeof wert === "boolean") return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (
    typeof wert !== "object"
    || wert instanceof Date
    || isValidElement(wert)
    || Object.getPrototypeOf(wert) !== Object.prototype
  ) return false;
  return Object.values(wert).every(istRekursivJsonSicher);
}

const QUELLE = readFileSync("src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/verlauf/page.tsx", "utf8");

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-inventur-verlauf-seite-");
  t.db.insert(artikel).values({
    id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", mindestbestand: 0,
    aktiv: true, createdAt: new Date("2026-07-01T00:00:00Z"),
  }).run();
});

afterEach(() => t.schliessen());

function lauf(args: {
  id: string; ts: string; quelleTyp: "system" | "oidc"; quelleId: string;
  kommentar: string; umfang: string | null; positionen: [erwartet: number, gezaehlt: number][];
}): void {
  t.db.insert(inventuren).values({
    id: args.id, ts: new Date(args.ts), quelleTyp: args.quelleTyp, quelleId: args.quelleId,
    kommentar: args.kommentar, umfang: args.umfang,
  }).run();
  args.positionen.forEach(([erwartet, gezaehlt], i) => {
    t.db.insert(inventurPositionen).values({
      id: `${args.id}-p${i}`, inventurId: args.id, artikelId: "a1", chargeId: null, erwartet, gezaehlt,
    }).run();
  });
}

describe("Inventur-Verlauf als RSC", () => {
  it("ist eine dynamische Seite", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(InventurVerlaufSeite).toBeTypeOf("function");
  });

  it("reicht nur primitive Zeilen an die Client-Tabelle, neueste zuerst", () => {
    lauf({
      id: "lauf-alt", ts: "2026-07-15T10:00:00Z", quelleTyp: "system", quelleId: "x",
      kommentar: "Monatsinventur", umfang: JSON.stringify({ kategorien: ["Hygiene"], faecher: ["A1"] }),
      positionen: [[5, 5]],
    });
    lauf({
      id: "lauf-neu", ts: "2026-07-16T08:30:00Z", quelleTyp: "oidc", quelleId: "u-unbekannt",
      kommentar: "Nachzählung", umfang: null, positionen: [[5, 4], [2, 2]],
    });

    const inhalt = verlaufSeitenInhalt(t.db);
    const [tabelle] = elementeVomTyp(inhalt, VerlaufTabelle);
    expect(tabelle!.props).toEqual({ zeilen: [
      {
        id: "lauf-neu", zeitText: "16.07.2026, 10:30", person: "u-unbekannt", kommentar: "Nachzählung",
        umfangText: "vollständig", positionen: 2, abweichungen: 1,
        detailHref: "/verwaltung/inventur/verlauf/lauf-neu",
      },
      {
        id: "lauf-alt", zeitText: "15.07.2026, 12:00", person: "System", kommentar: "Monatsinventur",
        umfangText: "Hygiene, Fach A1", positionen: 1, abweichungen: 0,
        detailHref: "/verwaltung/inventur/verlauf/lauf-alt",
      },
    ] });
    expect(istRekursivJsonSicher(tabelle!.props)).toBe(true);

    const [kopf] = elementeVomTyp(inhalt, SeitenKopf);
    expect(kopf!.props).toMatchObject({
      titel: "Inventur-Verlauf",
      zurueck: { titel: "Inventur", href: "/verwaltung/inventur" },
      beschreibung: "Abgeschlossene Inventuren mit allen gezählten Positionen. Inventuren vor dieser Änderung stehen nur im Journal.",
    });
  });

  it("nennt die Grenze nur, wenn sie tatsächlich griff", () => {
    for (let i = 0; i <= INVENTUR_VERLAUF_GRENZE; i += 1) {
      lauf({
        id: `lauf-${String(i).padStart(3, "0")}`, ts: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
        quelleTyp: "system", quelleId: "x", kommentar: `Lauf ${i}`, umfang: null, positionen: [],
      });
    }
    const inhalt = verlaufSeitenInhalt(t.db);
    const [tabelle] = elementeVomTyp(inhalt, VerlaufTabelle);
    expect((tabelle!.props as { zeilen: unknown[] }).zeilen).toHaveLength(INVENTUR_VERLAUF_GRENZE);
    const [kopf] = elementeVomTyp(inhalt, SeitenKopf);
    expect(String((kopf!.props as { beschreibung: string }).beschreibung))
      .toContain(`Gezeigt werden die neuesten ${INVENTUR_VERLAUF_GRENZE}.`);
  });

  it("ist eine directive-freie Server Component ohne Icon-Paket und prüft den Admin vor der Datenbank", () => {
    expect(QUELLE).not.toMatch(/["']use client["']/);
    expect(QUELLE).not.toMatch(/@ant-design\/icons/);
    expect(QUELLE).not.toMatch(/from "antd"/);
    const adminIndex = QUELLE.indexOf("await requireLagerbuchAdmin()");
    const dbIndex = QUELLE.indexOf("getDb())");
    expect(adminIndex).toBeGreaterThan(-1);
    expect(dbIndex).toBeGreaterThan(-1);
    expect(adminIndex).toBeLessThan(dbIndex);
  });
});
