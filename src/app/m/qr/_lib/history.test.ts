// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadHistory,
  addEntry,
  clearHistory,
  recordEntry,
  randomId,
  subscribeHistory,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  HISTORY_KEY,
  HISTORY_LIMIT,
} from "@/app/m/qr/_lib/history";

/**
 * Der Schluessel `qr-generator:history:v1` ist 1:1 aus easy-qr zu erhalten —
 * ein anderer Name liesse den Verlauf jedes Nutzers beim Cutover verschwinden.
 */

const entry = (id: string) => ({
  id,
  label: `L${id}`,
  payload: { kind: "url" as const, value: "https://x" },
  createdAt: Number(id),
});

beforeEach(() => {
  localStorage.clear();
});

describe("history", () => {
  it("schreibt unter den uebernommenen Schluessel", () => {
    addEntry(entry("1"));
    expect(localStorage.getItem(HISTORY_KEY)).not.toBeNull();
    expect(HISTORY_KEY).toBe("qr-generator:history:v1");
  });

  it("startet leer", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("neueste zuerst", () => {
    addEntry(entry("1"));
    addEntry(entry("2"));
    expect(loadHistory().map((e) => e.id)).toEqual(["2", "1"]);
  });

  it("deckelt bei HISTORY_LIMIT", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) addEntry(entry(String(i)));
    expect(loadHistory()).toHaveLength(HISTORY_LIMIT);
  });

  it("wirft beim Deckeln die aeltesten Eintraege weg", () => {
    for (let i = 0; i < HISTORY_LIMIT + 2; i++) addEntry(entry(String(i)));
    const ids = loadHistory().map((e) => e.id);
    expect(ids[0]).toBe(String(HISTORY_LIMIT + 1));
    expect(ids).not.toContain("0");
  });

  it("kaputtes JSON liefert eine leere Liste statt zu werfen", () => {
    localStorage.setItem(HISTORY_KEY, "{kein json");
    expect(loadHistory()).toEqual([]);
  });

  it("Eintraege mit falschem Schema werden verworfen", () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ id: 1 }]));
    expect(loadHistory()).toEqual([]);
  });

  it("verwirft nur die kaputten Eintraege, nicht die ganze Liste", () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry("1"), { id: 2 }]));
    expect(loadHistory().map((e) => e.id)).toEqual(["1"]);
  });

  it("clearHistory leert", () => {
    addEntry(entry("1"));
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it("recordEntry legt einen vollstaendigen, gueltigen Eintrag an", () => {
    recordEntry("Mein Link", { kind: "url", value: "https://drk.de" });
    const [e] = loadHistory();
    expect(e.label).toBe("Mein Link");
    expect(e.payload).toEqual({ kind: "url", value: "https://drk.de" });
    expect(typeof e.id).toBe("string");
    expect(e.id.length).toBeGreaterThan(0);
    expect(e.createdAt).toBeGreaterThan(0);
  });

  it("recordEntry vergibt je Aufruf eine eigene id", () => {
    recordEntry("A", { kind: "url", value: "a" });
    recordEntry("B", { kind: "url", value: "b" });
    const [a, b] = loadHistory();
    expect(a.id).not.toBe(b.id);
  });
});

/**
 * `crypto.randomUUID` gibt es nur im Secure Context. Im Einsatz laeuft die App
 * auch mal ueber http auf einer LAN-IP — dort ist die Funktion schlicht nicht
 * da, und ein direkter Aufruf risse die Seite mit einem TypeError ab, statt
 * einen Verlaufseintrag anzulegen.
 */
/**
 * Der Verlauf ist ein externer Speicher: der Server kennt ihn nicht, der
 * Browser schon. `useSyncExternalStore` verlangt dafür einen Schnappschuss, der
 * bei unveränderten Daten IDENTISCH bleibt — gäbe getSnapshot jedes Mal ein
 * frisches Array zurück, drehte React sich in einer Endlosschleife.
 */
describe("History-Store", () => {
  it("liefert bei unveraenderten Daten dieselbe Referenz", () => {
    recordEntry("A", { kind: "url", value: "a" });
    expect(getHistorySnapshot()).toBe(getHistorySnapshot());
  });

  it("liefert nach einer Aenderung eine neue Referenz mit neuem Inhalt", () => {
    recordEntry("A", { kind: "url", value: "a" });
    const before = getHistorySnapshot();
    recordEntry("B", { kind: "url", value: "b" });
    const after = getHistorySnapshot();
    expect(after).not.toBe(before);
    expect(after.map((e) => e.label)).toEqual(["B", "A"]);
  });

  it("meldet Aenderungen an die Abonnenten", () => {
    let calls = 0;
    const unsubscribe = subscribeHistory(() => {
      calls++;
    });
    recordEntry("A", { kind: "url", value: "a" });
    expect(calls).toBe(1);
    clearHistory();
    expect(calls).toBe(2);
    unsubscribe();
    recordEntry("B", { kind: "url", value: "b" });
    expect(calls).toBe(2);
  });

  it("nach clearHistory ist der Schnappschuss leer", () => {
    recordEntry("A", { kind: "url", value: "a" });
    clearHistory();
    expect(getHistorySnapshot()).toEqual([]);
  });

  // Auf dem Server gibt es keinen localStorage. Der Schnappschuss muss dort
  // konstant dieselbe leere Liste sein, sonst wirft React beim Hydrieren.
  it("der Server-Schnappschuss ist leer und stabil", () => {
    recordEntry("A", { kind: "url", value: "a" });
    expect(getHistoryServerSnapshot()).toEqual([]);
    expect(getHistoryServerSnapshot()).toBe(getHistoryServerSnapshot());
  });
});

describe("randomId", () => {
  it("liefert eindeutige Werte", () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomId()));
    expect(ids.size).toBe(100);
  });

  it("funktioniert ohne crypto.randomUUID", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      expect(randomId()).toMatch(/^\d+-[a-z0-9]+$/);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
