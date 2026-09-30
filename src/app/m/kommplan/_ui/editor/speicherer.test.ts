import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Planangaben } from "../../_lib/angaben";
import type { SpeicherErgebnis, Speicherstand } from "../../_lib/ergebnis";
import { fuegeWurzelEin, leererPlan } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { Speicherer, WARTEZEIT_MS, WIEDERHOLUNG_MS, type SpeicherZustand } from "./speicherer";

const ANGABEN: Planangaben = { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: null };
const a = leererPlan(), b = fuegeWurzelEin(a, "b"), c = fuegeWurzelEin(b, "c"), d = fuegeWurzelEin(c, "d");

/** Ein Server mit echter Versionsprüfung; `haenge` hält den nächsten Aufruf fest, bis `los()`. */
function server(start = 1) {
  let version = start;
  const log: string[] = [];
  let sperre: Promise<void> | null = null;
  let loese = () => {};
  const stand = (): Speicherstand => ({ version, inhalt: c, angaben: ANGABEN, aktualisiertAm: 99, aktualisiertVon: "Ole" });
  const antworte = async (art: string, v: number): Promise<SpeicherErgebnis> => {
    log.push(`${art}@${v}`);
    if (sperre) await sperre;
    if (v !== version) return { ok: false, grund: "konflikt", stand: stand() };
    version += 1;
    return { ok: true, version, aktualisiertAm: version * 10 };
  };
  return {
    log, get version() { return version; }, set version(v: number) { version = v; },
    haenge() { sperre = new Promise((r) => { loese = () => { sperre = null; r(); }; }); },
    los() { loese(); },
    senden: { inhalt: vi.fn((e: { version: number }) => antworte("inhalt", e.version)), angaben: vi.fn((e: { version: number }) => antworte("angaben", e.version)) },
  };
}
function baueSpeicherer(s: ReturnType<typeof server>, inhalt: PlanInhalt = a) {
  const meldungen: SpeicherZustand[] = [];
  const sp = new Speicherer({ planId: "p", version: s.version, inhalt, senden: s.senden, melde: (z) => meldungen.push(z) });
  return { sp, meldungen };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("Autosave (Spec §6.6)", () => {
  it("sendet etwa 1 s nach der LETZTEN Änderung genau einmal, mit dem dann aktuellen Stand", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS - 100);
    sp.aendere(c);
    expect(sp.zustand.status).toBe("ungespeichert");
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS - 1);
    expect(s.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.log).toEqual(["inhalt@1"]);
    expect(s.senden.inhalt).toHaveBeenLastCalledWith({ id: "p", version: 1, inhalt: c });
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 2, zuletztGespeichert: 20 });
  });
  it("zurück auf den gespeicherten Stand (Rückgängig): nichts zu senden", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    sp.aendere(b);
    sp.aendere(a);
    expect(sp.zustand.status).toBe("gespeichert");
    await vi.advanceTimersByTimeAsync(5 * WARTEZEIT_MS);
    expect(s.log).toEqual([]);
  });
  it("Änderungen während eines laufenden Aufrufs folgen danach mit der neuen Version — immer nur ein Aufruf", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.haenge();
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand.status).toBe("speichert");
    sp.aendere(c);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.log).toEqual(["inhalt@1"]);
    s.los();
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.log).toEqual(["inhalt@1", "inhalt@2"]);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 3 });
  });
  it("Planangaben, während Inhalt wartet oder läuft: kein falscher Konflikt, Version zählt zweimal (Review Focus 5)", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    sp.aendere(b);
    const angaben = sp.angaben(ANGABEN);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(await angaben).toMatchObject({ ok: true, version: 2 });
    expect(s.log).toEqual(["angaben@1", "inhalt@2"]);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 3 });
  });
  it("Konflikt: Hinweis mit Serverstand, danach kein automatisches Speichern mehr", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5; // jemand anderes hat gespeichert
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand).toMatchObject({ status: "konflikt", konflikt: { version: 5, aktualisiertVon: "Ole" } });
    sp.aendere(c);
    await vi.advanceTimersByTimeAsync(5 * WARTEZEIT_MS);
    expect(s.log).toEqual(["inhalt@1"]);
  });
  it("„Meine Fassung behalten“ sendet sofort mit der Serverversion und überschreibt", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5;
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    await sp.behalteMeine();
    expect(s.log).toEqual(["inhalt@1", "inhalt@5"]);
    expect(s.senden.inhalt).toHaveBeenLastCalledWith({ id: "p", version: 5, inhalt: b });
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 6, konflikt: null });
  });
  it("„Meine Fassung behalten“ sendet auch, wenn der Konflikt beim Speichern der Planangaben entstand", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5;
    expect(await sp.angaben(ANGABEN)).toMatchObject({ ok: false, grund: "konflikt" });
    await sp.behalteMeine();
    expect(s.log).toEqual(["angaben@1", "inhalt@5"]);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 6 });
  });
  it("„Neu laden“: Serverstand übernehmen, nichts senden", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5;
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    sp.uebernimm(sp.zustand.konflikt!);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 5, konflikt: null });
    sp.aendere(c); // c ist der Serverstand → nichts zu tun
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.log).toEqual(["inhalt@1"]);
  });
  it("Wurf (Netz weg, Recht entzogen): Status fehler; die nächste Änderung oder „erneut“ versucht es wieder", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.senden.inhalt.mockRejectedValueOnce(new Error("Forbidden"));
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand).toMatchObject({ status: "fehler", fehler: "Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist." });
    expect(sp.hatUngespeichertes()).toBe(true);
    await sp.erneut();
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 2, fehler: null });
    // … und die nächste Änderung: nach der üblichen Wartezeit, nicht erst nach dem Rückzug
    s.senden.inhalt.mockRejectedValueOnce(new Error("offline"));
    sp.aendere(c);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand.status).toBe("fehler");
    sp.aendere(d);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(4);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 3, fehler: null });
  });
  it("nach einem Fehler zurück auf den gespeicherten Stand: nichts mehr offen, „gespeichert“, Drucken geht (Review Phase 2)", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.senden.inhalt.mockRejectedValue(new Error("offline"));
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand.status).toBe("fehler");
    sp.aendere(a);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", fehler: null });
    expect(sp.hatUngespeichertes()).toBe(false);
    expect(await sp.jetzt()).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(1); // kein Wiederholen für nichts
  });
  it("ebenso nach „ungültig“ vom Server; nach „weg“ bleibt der Fehler stehen (der Plan ist fort)", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.senden.inhalt.mockResolvedValueOnce({ ok: false, grund: "ungueltig", fehler: "Der Plan ist ungültig." });
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand).toMatchObject({ status: "fehler", fehler: "Der Plan ist ungültig." });
    sp.aendere(a);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", fehler: null });

    const weg = baueSpeicherer(s).sp;
    s.senden.inhalt.mockResolvedValueOnce({ ok: false, grund: "weg" });
    weg.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(weg.zustand).toMatchObject({ status: "fehler", fehler: "Diesen Plan gibt es nicht mehr, oder er wurde archiviert." });
    weg.aendere(a);
    expect(weg.zustand.status).toBe("fehler");
    expect(await weg.jetzt()).toBe(false);
  });
  it("Antwort verloren, obwohl der Server gespeichert hat: die Wiederholung meldet keinen Konflikt mit der eigenen Fassung", async () => {
    let version = 1;
    let gespeichert: PlanInhalt = a;
    let verlieren = true;
    const inhalt = vi.fn(async (e: { version: number; inhalt: PlanInhalt }): Promise<SpeicherErgebnis> => {
      if (e.version !== version) return { ok: false, grund: "konflikt", stand: { version, inhalt: structuredClone(gespeichert), angaben: ANGABEN, aktualisiertAm: 77, aktualisiertVon: "ich" } };
      version += 1;
      gespeichert = e.inhalt;
      if (verlieren) { verlieren = false; throw new Error("Antwort verloren"); }
      return { ok: true, version, aktualisiertAm: version * 10 };
    });
    const sp = new Speicherer({ planId: "p", version: 1, inhalt: a, senden: { inhalt, angaben: vi.fn() }, melde: () => {} });
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand.status).toBe("fehler");
    await vi.advanceTimersByTimeAsync(WIEDERHOLUNG_MS[0]);
    expect(inhalt).toHaveBeenCalledTimes(2);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 2, konflikt: null, fehler: null });
    sp.aendere(c);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(inhalt).toHaveBeenLastCalledWith({ id: "p", version: 2, inhalt: c });
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 3 });
  });
  it("… hat danach noch jemand gespeichert (Version weiter als +1), bleibt es ein Konflikt", async () => {
    let version = 1;
    let verlieren = true;
    const inhalt = vi.fn(async (e: { version: number; inhalt: PlanInhalt }): Promise<SpeicherErgebnis> => {
      if (e.version !== version) return { ok: false, grund: "konflikt", stand: { version, inhalt: structuredClone(b), angaben: ANGABEN, aktualisiertAm: 77, aktualisiertVon: "Ole" } };
      version += 2; // eigenes Speichern plus eines von Ole
      if (verlieren) { verlieren = false; throw new Error("Antwort verloren"); }
      return { ok: true, version, aktualisiertAm: 1 };
    });
    const sp = new Speicherer({ planId: "p", version: 1, inhalt: a, senden: { inhalt, angaben: vi.fn() }, melde: () => {} });
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS + WIEDERHOLUNG_MS[0]);
    expect(sp.zustand).toMatchObject({ status: "konflikt", konflikt: { version: 3, aktualisiertVon: "Ole" } });
  });
  it("Planangaben „ungültig“: die Feldfehler gehören dem Formular, der Speicherstatus bleibt", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.senden.angaben.mockResolvedValueOnce({ ok: false, grund: "ungueltig", fehler: "Titel fehlt.", feldFehler: { titel: "Titel fehlt." } });
    expect(await sp.angaben({ ...ANGABEN, titel: "" })).toMatchObject({ ok: false, grund: "ungueltig" });
    expect(sp.zustand).toMatchObject({ status: "gespeichert", fehler: null });
  });
  it("nach einem Wurf versucht er es selbst wieder: 5 s, 15 s, 30 s, dann jede Minute (Entscheidung 11)", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.senden.inhalt.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"));
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(WIEDERHOLUNG_MS[0] - 1);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(WIEDERHOLUNG_MS[1]);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(WIEDERHOLUNG_MS[2]);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(4);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 2 });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(4); // nach Erfolg kein weiterer Versuch
  });
  it("bei Konflikt und „weg“ kein Wiederholen", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5;
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS + 10 * 60_000);
    expect(s.log).toEqual(["inhalt@1"]);
    const weg = server();
    const w = baueSpeicherer(weg).sp;
    weg.senden.inhalt.mockResolvedValue({ ok: false, grund: "weg" });
    w.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS + 10 * 60_000);
    expect(weg.senden.inhalt).toHaveBeenCalledTimes(1);
    expect(w.zustand).toMatchObject({ status: "fehler", fehler: "Diesen Plan gibt es nicht mehr, oder er wurde archiviert." });
  });
  it("Serverstand beim Montieren (Entscheidung 21): gleich → aktuell; neuer und lokal nichts geändert → still übernommen; sonst Konflikt", () => {
    const s = server();
    const stand = (version: number): Speicherstand => ({ version, inhalt: c, angaben: ANGABEN, aktualisiertAm: 99, aktualisiertVon: "Jana" });
    expect(baueSpeicherer(s).sp.pruefeStand(stand(1))).toBe("aktuell");
    const still = baueSpeicherer(s).sp;
    expect(still.pruefeStand(stand(4))).toBe("uebernommen");
    expect(still.zustand).toMatchObject({ status: "gespeichert", version: 4, konflikt: null });
    const geaendert = baueSpeicherer(s).sp;
    geaendert.aendere(b);
    expect(geaendert.pruefeStand(stand(4))).toBe("konflikt");
    expect(geaendert.zustand).toMatchObject({ status: "konflikt", konflikt: { version: 4 } });
  });
  it("vor dem Drucken: wartende Änderung sofort senden", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    sp.aendere(b);
    expect(await sp.jetzt()).toBe(true);
    expect(s.log).toEqual(["inhalt@1"]);
    s.version = 9;
    sp.aendere(c);
    expect(await sp.jetzt()).toBe(false);
  });
});
