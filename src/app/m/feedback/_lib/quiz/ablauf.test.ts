import { describe, expect, it } from "vitest";
import type { QuizFrage } from "./fragen";
import { phaseFuer, phaseMitSperre, schrittAnzahl } from "./ablauf";

const f = (zeit_s?: number): QuizFrage => ({
  text: "?", typ: "einfach", optionen: ["A", "B"], richtig: [0], zeit_s,
});
const drei = [f(), f(), f()];

describe("schrittAnzahl", () => {
  it("zählt Lobby, Fragen und Schluss", () => {
    expect(schrittAnzahl(3, "lagebild")).toBe(8);
    expect(schrittAnzahl(3, "wettbewerb")).toBe(10);
  });
});

describe("phaseFuer", () => {
  it("läuft im Wettbewerb durch alle Schritte", () => {
    const arten = Array.from({ length: 10 }, (_, s) => {
      const p = phaseFuer(s, drei, "wettbewerb", 0, 0);
      return "index" in p ? `${p.art}${p.index}` : "nachIndex" in p ? `${p.art}${p.nachIndex}` : p.art;
    });
    expect(arten).toEqual([
      "lobby", "frage0", "aufloesung0", "rangliste0", "frage1", "aufloesung1",
      "rangliste1", "frage2", "aufloesung2", "schluss",
    ]);
  });
  it("läuft im Lagebild ohne Rangliste", () => {
    const arten = Array.from({ length: 8 }, (_, s) => phaseFuer(s, drei, "lagebild", 0, 0).art);
    expect(arten).toEqual(["lobby", "frage", "aufloesung", "frage", "aufloesung", "frage", "aufloesung", "schluss"]);
  });
  it("begrenzt zu große und negative Schritte", () => {
    expect(phaseFuer(42, drei, "wettbewerb", 0, 0)).toEqual({ art: "schluss" });
    expect(phaseFuer(-3, drei, "lagebild", 0, 0)).toEqual({ art: "lobby" });
  });
  it("schließt die Frage mit zeit_s nach Ablauf", () => {
    const fr = [f(20)];
    expect(phaseFuer(1, fr, "lagebild", 0, 19_999)).toEqual({ art: "frage", index: 0, offen: true, endetUm: 20_000 });
    expect(phaseFuer(1, fr, "lagebild", 0, 20_000)).toEqual({ art: "frage", index: 0, offen: false, endetUm: 20_000 });
  });
  it("ohne zeit_s bleibt die Frage offen", () => {
    expect(phaseFuer(1, [f()], "lagebild", 0, 9e9)).toEqual({ art: "frage", index: 0, offen: true, endetUm: null });
  });
});

describe("phaseMitSperre", () => {
  const stand = (schritt: number, hoechsterSchritt: number, schrittSeit = 0, hoechsterSeit = 0) =>
    ({ schritt, hoechsterSchritt, schrittSeit, hoechsterSeit });
  it("schließt eine schon passierte Frage, auch ohne zeit_s", () => {
    expect(phaseMitSperre(stand(1, 2), drei, "lagebild", 0)).toMatchObject({ art: "frage", index: 0, offen: false });
    expect(phaseMitSperre(stand(1, 1), drei, "lagebild", 0)).toMatchObject({ art: "frage", index: 0, offen: true });
    expect(phaseMitSperre(stand(2, 5), drei, "lagebild", 0)).toEqual(phaseFuer(2, drei, "lagebild", 0, 0));
  });
  it("misst die Zeit auf dem weitesten Schritt ab dem ersten Erreichen", () => {
    const mitZeit = [f(20)];
    // Erst bei 0 erreicht, nach Zurück und Vor bei 30 000 erneut gezeigt: Zeit ist um.
    expect(phaseMitSperre(stand(1, 1, 30_000, 0), mitZeit, "lagebild", 30_500))
      .toEqual({ art: "frage", index: 0, offen: false, endetUm: 20_000 });
    expect(phaseMitSperre(stand(1, 1, 10_000, 0), mitZeit, "lagebild", 15_000))
      .toEqual({ art: "frage", index: 0, offen: true, endetUm: 20_000 });
  });
});
