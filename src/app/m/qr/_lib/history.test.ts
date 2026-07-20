// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { payloadToQrString } from "@/app/m/qr/_lib/payload";
import {
  loadHistory,
  addEntry,
  clearHistory,
  recordEntry,
  randomId,
  subscribeHistory,
  setHistoryOwner,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  HISTORY_KEY,
  HISTORY_LIMIT,
} from "@/app/m/qr/_lib/history";

/**
 * Der Schluessel `qr-generator:history:v1` ist 1:1 aus easy-qr zu erhalten —
 * ein anderer Name liesse den Verlauf jedes Nutzers beim Cutover verschwinden.
 */

// `owner: null` steht hier, weil die Tests unten teils direkt in den
// localStorage schreiben und damit an `addEntry` vorbei, das den Eigentuemer
// sonst stempelt. Ohne das Feld verbaerge der Filter den Eintrag.
const entry = (id: string) => ({
  id,
  label: `L${id}`,
  payload: { kind: "url" as const, value: "https://x" },
  createdAt: Number(id),
  owner: null,
});

beforeEach(() => {
  localStorage.clear();
  // localStorage.clear() allein laesst den zwischengespeicherten Schnappschuss
  // stehen; ohne dieses invalidate faerbte er auf den naechsten Test ab.
  clearHistory();
  // Modulzustand: ein in einem Test gesetzter Eigentuemer faerbte sonst ab.
  setHistoryOwner(null);
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

  /**
   * Ein Eintrag mit gueltigem `kind`, aber ohne brauchbares `value` kommt durch
   * die Renderpruefung und faellt erst beim Antippen um: `payloadToQrString`
   * greift auf `value.ssid` zu und wirft im Klick-Handler, also ohne Navigation
   * und ohne sichtbare Meldung. Der Eintrag bleibt liegen — ein toter Knopf.
   */
  it.each([
    ["wifi ohne value", { kind: "wifi" }],
    ["vcard ohne value", { kind: "vcard" }],
    [
      "wifi mit unbekannter Verschluesselung",
      { kind: "wifi", value: { ssid: "A", password: "", encryption: "ROT13" } },
    ],
    ["vcard ohne name", { kind: "vcard", value: { tel: "+49" } }],
    ["url mit einer Zahl als value", { kind: "url", value: 42 }],
  ])("verwirft %s", (_name, payload) => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ id: "x", label: "Kaputt", createdAt: 1, payload }]),
    );
    expect(loadHistory()).toEqual([]);
  });

  it("was die Filterung durchlaesst, kodiert payloadToQrString ohne zu werfen", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { id: "a", label: "WLAN Einsatz", createdAt: 1, payload: { kind: "wifi" } },
        entry("2"),
      ]),
    );
    const kept = loadHistory();
    expect(kept.map((e) => e.id)).toEqual(["2"]);
    for (const e of kept) expect(() => payloadToQrString(e.payload)).not.toThrow();
  });

  // Gegenprobe zur Filterung: sie darf nicht strenger sein als das, was die
  // Erzeuger schreiben — sonst verschwinden gueltige Eintraege still.
  it("behaelt ein offenes WLAN mit leerem Passwort und eine vCard nur mit Namen", () => {
    recordEntry("Offenes Netz", {
      kind: "wifi",
      value: { ssid: "Gast", password: "", encryption: "nopass" },
    });
    recordEntry("Nur Name", { kind: "vcard", value: { name: "Max Mustermann" } });
    expect(loadHistory().map((e) => e.label)).toEqual(["Nur Name", "Offenes Netz"]);
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
 * Das Modul ist anonym erreichbar, der localStorage ueberlebt aber jeden Logout.
 * Ohne Bindung an die Sitzung sah die naechste Person auf einem geteilten
 * Einsatz-Tablet die Schnellzugriffe der vorigen — und mit einem Tipp auf einen
 * WLAN-Eintrag dessen Passwort im Klartext in der Adresszeile.
 */
describe("Verlauf ist an die Sitzung gebunden", () => {
  it("verbirgt die Eintraege einer Sitzung nach dem Logout", () => {
    setHistoryOwner("u1");
    recordEntry("WLAN Wache 3", {
      kind: "wifi",
      value: { ssid: "Wache-3", password: "geheim", encryption: "WPA" },
    });
    expect(loadHistory().map((e) => e.label)).toEqual(["WLAN Wache 3"]);

    setHistoryOwner(null);
    expect(loadHistory()).toEqual([]);
  });

  it("zeigt einer anderen Sitzung nicht den Verlauf der vorherigen", () => {
    setHistoryOwner("u1");
    recordEntry("Von u1", { kind: "url", value: "https://a" });
    setHistoryOwner("u2");
    recordEntry("Von u2", { kind: "url", value: "https://b" });

    expect(loadHistory().map((e) => e.label)).toEqual(["Von u2"]);
  });

  // Verborgen heisst verborgen, nicht geloescht: liefe der Schreibpfad ueber das
  // gefilterte loadHistory, raeumte der erste Code eines Angemeldeten den
  // anonymen Verlauf dauerhaft ab.
  it("laesst fremde Eintraege im Speicher stehen", () => {
    recordEntry("Anonym", { kind: "url", value: "https://a" });
    setHistoryOwner("u1");
    recordEntry("Von u1", { kind: "url", value: "https://b" });

    setHistoryOwner(null);
    expect(loadHistory().map((e) => e.label)).toEqual(["Anonym"]);
  });

  // Strikt, bewusst ohne `?? null`: sonst zaehlten die Alt-Eintraege aus easy-qr
  // als anonym und waeren genau fuer den anonymen Betrachter wieder lesbar.
  it("verbirgt Eintraege ohne owner-Feld vor jedem", () => {
    const legacy = { id: "alt", label: "Aus easy-qr", createdAt: 1, payload: entry("1").payload };
    localStorage.setItem(HISTORY_KEY, JSON.stringify([legacy]));

    expect(loadHistory()).toEqual([]);
    setHistoryOwner("u1");
    expect(loadHistory()).toEqual([]);
  });

  it("meldet den Wechsel an die Abonnenten", () => {
    let calls = 0;
    const unsubscribe = subscribeHistory(() => {
      calls++;
    });
    setHistoryOwner("u1");
    expect(calls).toBe(1);
    // Derselbe Eigentuemer ist kein Wechsel — sonst renderte das Layout bei
    // jedem Effektlauf den Verlauf neu.
    setHistoryOwner("u1");
    expect(calls).toBe(1);
    unsubscribe();
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

/**
 * Im privaten Modus mancher Browser (Safari) wirft schon `setItem`. Ohne den
 * Speicher-Fallback verschwaende der Nutzer dort jeden erzeugten Code: der
 * Verlauf bliebe leer, ohne dass irgendetwas es erklaerte.
 *
 * `useFallback` ist Modulzustand — deshalb je Fall `vi.resetModules()` und ein
 * dynamischer Import, sonst faerbt der einmal gekippte Fallback auf die
 * uebrigen Tests ab.
 */
describe("gesperrter localStorage", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function historyWithLock(locked: ("getItem" | "setItem")[]) {
    for (const method of locked) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("Speicher gesperrt");
      });
    }
    return import("@/app/m/qr/_lib/history");
  }

  it("haelt Eintraege im Speicher, wenn das Schreiben wirft", async () => {
    const h = await historyWithLock(["setItem"]);
    expect(() => h.recordEntry("A", { kind: "url", value: "https://drk.de" })).not.toThrow();
    expect(h.loadHistory().map((e) => e.label)).toEqual(["A"]);
  });

  it("haelt Eintraege im Speicher, wenn das Lesen wirft", async () => {
    const h = await historyWithLock(["getItem"]);
    expect(() => h.recordEntry("A", { kind: "url", value: "https://drk.de" })).not.toThrow();
    expect(h.loadHistory().map((e) => e.label)).toEqual(["A"]);
  });

  it("clearHistory leert auch den Speicher-Fallback", async () => {
    const h = await historyWithLock(["setItem"]);
    h.recordEntry("A", { kind: "url", value: "https://drk.de" });
    h.clearHistory();
    expect(h.loadHistory()).toEqual([]);
  });
});

/**
 * Ein zweiter Tab schreibt in denselben Speicher. Ohne das `storage`-Ereignis
 * zeigte dieser Tab den Verlauf von vorhin weiter an.
 */
describe("Tab-Synchronisierung", () => {
  it("ein Ereignis unter dem eigenen Schluessel meldet und laedt neu", () => {
    let calls = 0;
    const unsubscribe = subscribeHistory(() => {
      calls++;
    });
    expect(getHistorySnapshot()).toEqual([]);

    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry("7")]));
    window.dispatchEvent(new StorageEvent("storage", { key: HISTORY_KEY }));

    expect(calls).toBe(1);
    expect(getHistorySnapshot().map((e) => e.id)).toEqual(["7"]);
    unsubscribe();
  });

  it("ein fremder Schluessel loest nichts aus", () => {
    let calls = 0;
    const unsubscribe = subscribeHistory(() => {
      calls++;
    });
    expect(getHistorySnapshot()).toEqual([]);

    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry("7")]));
    window.dispatchEvent(new StorageEvent("storage", { key: "fremdes-modul" }));

    expect(calls).toBe(0);
    expect(getHistorySnapshot()).toEqual([]);
    unsubscribe();
  });

  it("die Aufraeumfunktion meldet den Zuhoerer wieder ab", () => {
    let calls = 0;
    subscribeHistory(() => {
      calls++;
    })();
    window.dispatchEvent(new StorageEvent("storage", { key: HISTORY_KEY }));
    expect(calls).toBe(0);
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
