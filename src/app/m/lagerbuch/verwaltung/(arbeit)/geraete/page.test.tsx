import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { geraete, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { Kachel } from "../../../_ui/Kachel";
import { geraeteSeitenInhalt } from "./page";

// elementeVomTyp: wortgleich aus Task 4 Step 1 uebernommen (bz/page.test.tsx).
function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

const NOW = new Date("2026-08-12T12:00:00Z");
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

/**
 * `mtkFaellig` und `ablaufdatum` sind "YYYY-MM-DD"-TEXTE, nicht Date.
 * `null` heißt „kein Datum gepflegt" — genau der Fall, den `keinDatum` deckt.
 */
function geraetAnlegen(werte: {
  id: string;
  typ: "medizin" | "objekt";
  mtkFaellig?: string | null;
  ablaufdatum?: string | null;
  aktiv?: boolean;
}): void {
  t.db.insert(geraete).values({
    id: werte.id, typ: werte.typ, barcode: null, name: `Gerät ${werte.id}`,
    lagerortId: "lager-1", anmerkung: null,
    mtkFaellig: werte.mtkFaellig ?? null,
    beschreibung: null,
    ablaufdatum: werte.ablaufdatum ?? null,
    aktiv: werte.aktiv ?? true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
}

afterEach(() => {
  t?.schliessen();
});

describe("Geräte-Übersicht", () => {
  it("zeigt vier Kennzahlen", () => {
    t = migrierteTestDb("lagerbuch-geraete-kpi-");
    expect(beschriftungen(geraeteSeitenInhalt(t.db, NOW)))
      .toEqual(["Aktive Geräte", "MTK fällig/bald", "MTK überfällig", "Objekte ablaufend"]);
  });

  /*
   * `DatumFaelligkeit.ampel` ist laut domain/geraet.ts NUR aussagekraeftig,
   * wenn `keinDatum === false`. Ein Geraet ohne gepflegtes Datum darf keine
   * Faelligkeit melden — sonst zaehlt die Kachel Pflegeluecken als Missstand,
   * und die Zahl waechst mit jedem neu angelegten Geraet.
   */
  it("zählt Geräte ohne gepflegtes Datum nicht als fällig", () => {
    t = migrierteTestDb("lagerbuch-geraete-kein-datum-");
    lagerortAnlegen();
    geraetAnlegen({ id: "g-1", typ: "medizin", mtkFaellig: null });
    geraetAnlegen({ id: "g-2", typ: "objekt", ablaufdatum: null });

    const kacheln = elementeVomTyp(geraeteSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(2);   // aktiv
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);   // MTK fällig
    expect((kacheln[3]!.props as { zahl: ReactNode }).zahl).toBe(0);   // Objekt ablaufend
  });

  it("zählt ein überfälliges MTK in beiden MTK-Kacheln", () => {
    t = migrierteTestDb("lagerbuch-geraete-mtk-");
    lagerortAnlegen();
    geraetAnlegen({ id: "g-alt", typ: "medizin", mtkFaellig: "2026-01-01" });

    const kacheln = elementeVomTyp(geraeteSeitenInhalt(t.db, NOW), Kachel);
    // „fällig/bald" ist ampel !== gruen und schliesst ueberfaellig ein.
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[2]!.props as { ton?: string }).ton).toBe("rot");
  });

  it("trennt die Klassen: ein Objekt zählt nie in einer MTK-Kachel", () => {
    t = migrierteTestDb("lagerbuch-geraete-klassen-");
    lagerortAnlegen();
    geraetAnlegen({ id: "o-alt", typ: "objekt", ablaufdatum: "2026-01-01" });

    const kacheln = elementeVomTyp(geraeteSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[3]!.props as { zahl: ReactNode }).zahl).toBe(1);
  });

  /*
   * Formgleich zu bz/page.test.tsx:108 und sauerstoff/page.test.tsx:86 — hier
   * mit ZWEI inaktiven Geraeten, je eines pro Klasse und beide mit einem
   * Zustand, der ohne den `aktiv`-Filter eine der vier Kacheln haette
   * anspringen lassen (ueberfaelliges MTK, abgelaufenes Objekt). Ein einzelnes
   * inaktives Geraet haette nur `aktive.length` bewegt und den Filter in den
   * drei uebrigen Kacheln ungeprueft gelassen.
   */
  it("zählt inaktive Geräte in keiner Kachel mit", () => {
    t = migrierteTestDb("lagerbuch-geraete-inaktiv-");
    lagerortAnlegen();
    geraetAnlegen({ id: "g-alt", typ: "medizin", mtkFaellig: "2026-01-01", aktiv: false });
    geraetAnlegen({ id: "o-alt", typ: "objekt", ablaufdatum: "2026-01-01", aktiv: false });

    const kacheln = elementeVomTyp(geraeteSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[3]!.props as { zahl: ReactNode }).zahl).toBe(0);
  });
});
