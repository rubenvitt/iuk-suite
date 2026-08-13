import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { bzGeraete, bzKontrollen, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { Kachel } from "../../../_ui/Kachel";
import { bzSeitenInhalt } from "./page";

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

/** Ein Lagerort ist Pflicht — bzGeraete.lagerortId ist ein Fremdschlüssel. */
function lagerortAnlegen(): void {
  t.db.insert(lagerorte).values({
    id: "lager-1", name: "Lager", typ: "lager", kennung: null, aktiv: true,
  }).run();
}

function bzGeraetAnlegen(id: string, aktiv = true): void {
  t.db.insert(bzGeraete).values({
    id, barcode: null, name: `Messgerät ${id}`, lagerortId: "lager-1",
    streifenLot: null,
    level1Label: null, level1Min: null, level1Max: null,
    level2Label: null, level2Min: null, level2Max: null,
    aktiv, createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
}

/** Eine Kontrolle mit Batteriewechsel — das Ereignis, aus dem die Ø-Rechnung lebt. */
function wechselAnlegen(id: string, geraetId: string, ts: Date): void {
  t.db.insert(bzKontrollen).values({
    id, geraetId, ts, quelleTyp: "oidc", quelleId: "sub-test",
    level1Wert: null, level1ImBereich: null,
    level2Wert: null, level2ImBereich: null,
    kompresseVerfall: null, sticks: 0, lanzetten: 0,
    batterieGewechselt: true, kommentar: null,
    bestanden: true, refSnapshot: null,
  }).run();
}

afterEach(() => {
  t?.schliessen();
});

describe("BZ-Übersicht", () => {
  it("zeigt vier Kennzahlen in der Reihenfolge des Originals", () => {
    t = migrierteTestDb("lagerbuch-bz-uebersicht-");
    expect(beschriftungen(bzSeitenInhalt(t.db, NOW))).toEqual([
      "Aktive Geräte",
      "Kontrolle fällig/bald",
      "Überfällig / nie geprüft",
      "Ø Akku-Lebensdauer",
    ]);
  });

  it("zeigt „–\" als Ø Akku, solange weniger als zwei Wechsel erfasst sind", () => {
    t = migrierteTestDb("lagerbuch-bz-akku-leer-");
    lagerortAnlegen();
    bzGeraetAnlegen("bz-1");
    wechselAnlegen("k-1", "bz-1", new Date("2026-06-01T12:00:00Z"));

    const akku = elementeVomTyp(bzSeitenInhalt(t.db, NOW), Kachel)[3]!;
    // EIN Wechsel ergibt NULL Intervalle — nichts messbar.
    expect((akku.props as { zahl: ReactNode }).zahl).toBe("–");
    // KEIN Warnton: „noch nicht messbar" ist kein Missstand.
    expect((akku.props as { ton?: string }).ton).toBeUndefined();
  });

  it("mittelt zwei Wechsel zu ihrem Abstand in Tagen", () => {
    t = migrierteTestDb("lagerbuch-bz-akku-");
    lagerortAnlegen();
    bzGeraetAnlegen("bz-1");
    wechselAnlegen("k-1", "bz-1", new Date("2026-06-01T12:00:00Z"));
    wechselAnlegen("k-2", "bz-1", new Date("2026-07-01T12:00:00Z"));

    const akku = elementeVomTyp(bzSeitenInhalt(t.db, NOW), Kachel)[3]!;
    expect((akku.props as { zahl: ReactNode }).zahl).toBe("30 T");
  });

  /*
   * DIE FALLE DIESER SEITE (domain/bz.ts): `nieGeprueft: true` liefert
   * `ampel: "rot"` bei `ueberfaellig: FALSE`. Wer nur `ueberfaellig` zaehlt,
   * meldet das schlechteste Geraet im Bestand als unauffaellig.
   */
  it("zählt nie geprüfte Geräte als überfällig mit", () => {
    t = migrierteTestDb("lagerbuch-bz-nie-");
    lagerortAnlegen();
    bzGeraetAnlegen("bz-neu");   // aktiv, ohne jede Kontrolle

    const kacheln = elementeVomTyp(bzSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[2]!.props as { ton?: string }).ton).toBe("rot");
  });

  it("zählt inaktive Geräte in keiner Kachel mit", () => {
    t = migrierteTestDb("lagerbuch-bz-inaktiv-");
    lagerortAnlegen();
    bzGeraetAnlegen("bz-alt", false);

    const kacheln = elementeVomTyp(bzSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(0);
  });
});
