import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { lagerorte, o2Flaschen, o2Messungen } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { Kachel } from "../../../_ui/Kachel";
import { sauerstoffSeitenInhalt } from "./page";

// elementeVomTyp: wortgleich aus Task 4 Step 1 uebernommen (bz/page.test.tsx).
function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

let t: ReturnType<typeof migrierteTestDb>;

function beschriftungen(seite: ReactNode): ReactNode[] {
  return elementeVomTyp(seite, Kachel)
    .map((e) => (e.props as { beschriftung: ReactNode }).beschriftung);
}

function lagerortAnlegen(): void {
  t.db.insert(lagerorte).values({
    id: "lager-1", name: "Lager", typ: "lager", kennung: null, aktiv: true,
  }).run();
}

function flascheAnlegen(id: string, aktiv = true): void {
  t.db.insert(o2Flaschen).values({
    id, name: `Flasche ${id}`, lagerortId: "lager-1",
    groesseLiter: 10, nennfuelldruckBar: 200, aktiv,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
}

function messungAnlegen(id: string, flascheId: string, druckBar: number): void {
  t.db.insert(o2Messungen).values({
    id, flascheId, ts: new Date("2026-08-01T12:00:00Z"),
    druckBar, quelleTyp: "oidc", quelleId: "sub-test", kommentar: null,
  }).run();
}

afterEach(() => {
  t?.schliessen();
});

describe("Sauerstoff-Übersicht", () => {
  it("zeigt zwei Kennzahlen", () => {
    t = migrierteTestDb("lagerbuch-o2-kpi-");
    expect(beschriftungen(sauerstoffSeitenInhalt(t.db)))
      .toEqual(["Aktive Flaschen", "Niedriger Druck"]);
  });

  /*
   * `status: null` heisst KEINE Messung, nicht 0 % (lesepfade/o2.ts). Eine
   * ungemessene Flasche als "niedriger Druck" zu zaehlen erfaende einen
   * Missstand. Das Original zaehlt sie nicht mit; der Test haelt die
   * Entscheidung fest, damit ein spaeteres `!f.status?.niedrig === false`
   * auffaellt.
   */
  it("zählt ungemessene Flaschen nicht als niedrigen Druck", () => {
    t = migrierteTestDb("lagerbuch-o2-ungemessen-");
    lagerortAnlegen();
    flascheAnlegen("f-1");   // aktiv, ohne jede Messung

    const kacheln = elementeVomTyp(sauerstoffSeitenInhalt(t.db), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[1]!.props as { ton?: string }).ton).toBe("ok");
  });

  it("zählt eine Flasche unter der roten Schwelle und färbt rot", () => {
    t = migrierteTestDb("lagerbuch-o2-niedrig-");
    lagerortAnlegen();
    flascheAnlegen("f-1");
    // 20 von 200 bar = 10 % — unter O2_AMPEL_ROT_PROZENT.
    messungAnlegen("m-1", "f-1", 20);

    const kacheln = elementeVomTyp(sauerstoffSeitenInhalt(t.db), Kachel);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[1]!.props as { ton?: string }).ton).toBe("rot");
  });

  it("zählt inaktive Flaschen in keiner Kachel mit", () => {
    t = migrierteTestDb("lagerbuch-o2-inaktiv-");
    lagerortAnlegen();
    flascheAnlegen("f-alt", false);
    messungAnlegen("m-alt", "f-alt", 20);

    const kacheln = elementeVomTyp(sauerstoffSeitenInhalt(t.db), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);
  });
});
