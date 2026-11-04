import { describe, expect, it } from "vitest";

import type { SpeicherZustand } from "./speicherer";
import { konfliktSperre } from "./verlassenSperre";

const zustand = (z: Partial<SpeicherZustand>): SpeicherZustand => ({ status: "gespeichert", version: 1, konflikt: null, zuletztGespeichert: null, fehler: null, ...z });

describe("konfliktSperre (IDA-357)", () => {
  it("sperrt nur bei offenem Konflikt", () => {
    expect(konfliktSperre(zustand({}))).toBeNull();
    expect(konfliktSperre(zustand({ status: "ungespeichert" }))).toBeNull();
    expect(konfliktSperre(zustand({ status: "fehler", fehler: "weg" }))).toBeNull();
    const k = konfliktSperre(zustand({ status: "konflikt", konflikt: { version: 2, inhalt: null, angaben: { titel: "x", typ: "kommunikationsplan", anlass: null, datum: null }, aktualisiertAm: 0, aktualisiertVon: "" } }));
    expect(k?.titel).toBe("Speicherkonflikt offen");
  });
});
