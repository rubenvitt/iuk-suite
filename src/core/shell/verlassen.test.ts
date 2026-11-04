import { describe, expect, it } from "vitest";

import { bestaetigeVerlassen, offeneSperre, sperreVerlassen, verlassenBestaetigt } from "@/core/shell/verlassen";

const A = { titel: "A", text: "a" };
const B = { titel: "B", text: "b" };

describe("Verlassen-Sperre (IDA-357)", () => {
  it("ist ohne Anmeldung offen", () => {
    expect(offeneSperre()).toBeNull();
  });

  it("meldet die jüngste Sperre und hebt genau die aufgehobene auf", () => {
    const weg1 = sperreVerlassen(A);
    const weg2 = sperreVerlassen(B);
    expect(offeneSperre()).toEqual(B);
    weg2();
    expect(offeneSperre()).toEqual(A);
    weg2();
    expect(offeneSperre()).toEqual(A);
    weg1();
    expect(offeneSperre()).toBeNull();
  });

  it("zählt dasselbe Objekt zweimal angemeldet zweimal", () => {
    const weg1 = sperreVerlassen(A);
    const weg2 = sperreVerlassen(A);
    weg1();
    expect(offeneSperre()).toEqual(A);
    weg2();
    expect(offeneSperre()).toBeNull();
  });

  it("lässt nach der Bestätigung durch, bis sich die Sperren ändern", () => {
    const weg = sperreVerlassen(A);
    bestaetigeVerlassen();
    expect(verlassenBestaetigt()).toBe(true);
    expect(offeneSperre()).toBeNull();
    const weg2 = sperreVerlassen(B);
    expect(verlassenBestaetigt()).toBe(false);
    expect(offeneSperre()).toEqual(B);
    bestaetigeVerlassen();
    weg2();
    expect(verlassenBestaetigt()).toBe(false);
    expect(offeneSperre()).toEqual(A);
    weg();
  });
});
