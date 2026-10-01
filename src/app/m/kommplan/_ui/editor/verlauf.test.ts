import { describe, expect, it } from "vitest";
import { fuegeWurzelEin, leererPlan } from "../../_lib/plan/operationen";
import { BUENDEL_MS, kannRueckgaengig, kannWiederholen, neuerVerlauf, rueckgaengig, tue, VERLAUF_TIEFE, verwirf, wiederholen } from "./verlauf";

const a = leererPlan(), b = fuegeWurzelEin(a, "b"), c = fuegeWurzelEin(b, "c"), d = fuegeWurzelEin(c, "d");

describe("Rückgängig/Wiederholen (Spec §6.6: Client-Stapel von Dokumenten)", () => {
  it("rückgängig und wiederholen wandern über dieselben Objekte", () => {
    let v = tue(tue(neuerVerlauf(a), b, 0), c, 5000);
    v = rueckgaengig(v);
    expect(v.jetzt).toBe(b);
    v = rueckgaengig(v);
    expect(v.jetzt).toBe(a);
    expect(kannRueckgaengig(v)).toBe(false);
    expect(rueckgaengig(v)).toBe(v);
    v = wiederholen(v);
    expect(v.jetzt).toBe(b);
    expect(kannWiederholen(v)).toBe(true);
  });
  it("eine neue Änderung verwirft das Wiederholen", () => {
    const v = tue(rueckgaengig(tue(tue(neuerVerlauf(a), b, 0), c, 5000)), d, 9000);
    expect(v.jetzt).toBe(d);
    expect(kannWiederholen(v)).toBe(false);
    expect(rueckgaengig(v).jetzt).toBe(b);
  });
  it("gleicher Schlüssel innerhalb der Bündelzeit ist EIN Schritt (Tippen im Titel)", () => {
    let v = tue(neuerVerlauf(a), b, 0, "titel:s1");
    v = tue(v, c, BUENDEL_MS - 1, "titel:s1");
    v = tue(v, d, 2 * BUENDEL_MS - 2, "titel:s1"); // gleitend: jede Eingabe verlängert
    expect(rueckgaengig(v).jetzt).toBe(a);
    const getrennt = tue(tue(neuerVerlauf(a), b, 0, "titel:s1"), c, 10, "leiter:s1");
    expect(rueckgaengig(getrennt).jetzt).toBe(b);
    const spaeter = tue(tue(neuerVerlauf(a), b, 0, "titel:s1"), c, BUENDEL_MS + 1, "titel:s1");
    expect(rueckgaengig(spaeter).jetzt).toBe(b);
    const genauAmEnde = tue(tue(neuerVerlauf(a), b, 0, "titel:s1"), c, BUENDEL_MS, "titel:s1"); // die Grenze gehört noch dazu
    expect(rueckgaengig(genauAmEnde).jetzt).toBe(a);
  });
  it("verwerfen nimmt den letzten Schritt zurück, ohne ihn zum Wiederholen anzubieten", () => {
    const v = verwirf(tue(tue(neuerVerlauf(a), b, 0), c, 5000));
    expect(v.jetzt).toBe(b);
    expect(kannWiederholen(v)).toBe(false);
    expect(rueckgaengig(v).jetzt).toBe(a);
    const leer = neuerVerlauf(a);
    expect(verwirf(leer)).toBe(leer);
  });
  it("dasselbe Objekt ist keine Änderung; die Tiefe ist begrenzt", () => {
    const v = tue(neuerVerlauf(a), b, 0);
    expect(tue(v, b, 1)).toBe(v);
    let lang = neuerVerlauf(a);
    for (let i = 0; i < VERLAUF_TIEFE + 10; i++) lang = tue(lang, fuegeWurzelEin(a, `w${i}`), i * 10_000);
    expect(lang.vergangen).toHaveLength(VERLAUF_TIEFE);
  });
});
