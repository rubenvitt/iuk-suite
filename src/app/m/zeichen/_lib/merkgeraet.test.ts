// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { ZEICHEN_SW_QUELLE, ZEICHEN_SW_ABRAEUM_QUELLE } from "./sw-quelle";

/**
 * ⚠️ JSDOM KENNT KEIN IndexedDB, und `fake-indexeddb` ist NICHT installiert —
 * eine Abhaengigkeit dafuer aufzunehmen waere eine eigene Entscheidung. Deshalb
 * eine handgeschriebene Minimal-Attrappe: EIN Speicher, EIN Schluessel, mehr
 * benutzt `merkgeraet.ts` nicht. Was sie NICHT beweist, steht hier statt
 * verschwiegen zu werden: dass ein echter Browser dieselbe Reihenfolge von
 * `onupgradeneeded`/`onsuccess` faehrt. Das zeigt allein der Handlauf
 * `pnpm e2e:pwa` (Aufgabe 10).
 */
function baueIndexedDbAttrappe() {
  const daten = new Map<string, unknown>();
  const geloescht: string[] = [];
  const api = {
    open(_name: string, _version?: number) {
      const anfrage: Record<string, unknown> = {
        result: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        anfrage.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          close: () => {},
          transaction: () => ({
            objectStore: () => ({
              put(wert: unknown, schluessel: string) {
                daten.set(schluessel, wert);
                const r: Record<string, unknown> = { onsuccess: null, onerror: null };
                queueMicrotask(() => (r.onsuccess as (() => void) | null)?.());
                return r;
              },
              get(schluessel: string) {
                const r: Record<string, unknown> = {
                  result: daten.get(schluessel),
                  onsuccess: null,
                  onerror: null,
                };
                queueMicrotask(() => (r.onsuccess as (() => void) | null)?.());
                return r;
              },
            }),
          }),
        };
        (anfrage.onupgradeneeded as (() => void) | null)?.();
        (anfrage.onsuccess as (() => void) | null)?.();
      });
      return anfrage;
    },
    deleteDatabase(name: string) {
      daten.clear();
      geloescht.push(name);
      const r: Record<string, unknown> = { onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => (r.onsuccess as (() => void) | null)?.());
      return r;
    },
  };
  return { daten, geloescht, api };
}

describe("Merkliste im Geraet", () => {
  let attrappe: ReturnType<typeof baueIndexedDbAttrappe>;

  beforeEach(() => {
    attrappe = baueIndexedDbAttrappe();
    (globalThis as Record<string, unknown>).indexedDB = attrappe.api;
  });

  it("schreibt und liest dieselben Eintraege", async () => {
    const { schreibeMerkliste, liesMerkliste } = await import("./merkgeraet");
    await schreibeMerkliste([
      { id: "rezept:C.1.1", titel: "Löschstaffel" },
      { id: "grund:base.formation", titel: "Einheit" },
    ]);
    expect(await liesMerkliste()).toEqual([
      { id: "rezept:C.1.1", titel: "Löschstaffel" },
      { id: "grund:base.formation", titel: "Einheit" },
    ]);
  });

  it("liefert eine leere Liste, solange nichts geschrieben wurde", async () => {
    // Der haeufigste Fall auf einem frischen Geraet — und er darf keinen Fehler
    // zeigen, sondern die Aussage „hier steht nichts".
    const { liesMerkliste } = await import("./merkgeraet");
    expect(await liesMerkliste()).toEqual([]);
  });

  it("wirft nicht, wenn es gar kein IndexedDB gibt", async () => {
    // Ein Browser im privaten Modus kann IndexedDB verweigern. Die Merkliste
    // ist Zugabe — sie darf die Katalogflaeche nicht mitreissen.
    delete (globalThis as Record<string, unknown>).indexedDB;
    const { liesMerkliste, schreibeMerkliste } = await import("./merkgeraet");
    await expect(schreibeMerkliste([{ id: "x", titel: "y" }])).resolves.toBeUndefined();
    expect(await liesMerkliste()).toEqual([]);
  });

  it("der Loeschknopf raeumt die Geraetedatenbank ab", async () => {
    const { schreibeMerkliste, loescheGeraetedaten } = await import("./merkgeraet");
    await schreibeMerkliste([{ id: "rezept:C.1.1", titel: "Löschstaffel" }]);
    await loescheGeraetedaten();
    expect(attrappe.geloescht).toContain("zeichen-merkliste");
  });

  it("Worker und Insel meinen dieselbe Datenbank", async () => {
    /*
     * DAS DRITTE DREIECK DIESER AUFGABE. Der Logout-Haken im Worker loescht
     * einen Datenbanknamen, den er als Literal traegt; die Insel schreibt unter
     * einem Namen, den SIE als Literal traegt. Laufen die zwei auseinander,
     * loescht der Logout eine Datenbank, die es nicht gibt — und die echte
     * bleibt mit den Titeln der vorigen Person auf dem geteilten Geraet liegen.
     * Kein anderes Tor sieht das.
     */
    const { MERKLISTE_DB } = await import("./merkgeraet");
    expect(MERKLISTE_DB).toBe("zeichen-merkliste");
    expect(ZEICHEN_SW_QUELLE).toContain(`const MERK_DB = "${MERKLISTE_DB}";`);
    expect(ZEICHEN_SW_ABRAEUM_QUELLE).toContain(`deleteDatabase("${MERKLISTE_DB}")`);
  });
});
