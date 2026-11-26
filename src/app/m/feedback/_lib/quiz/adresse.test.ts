import { describe, expect, it } from "vitest";
import { beamerUrlAus, beitrittAdresseAus, handyUrlAus } from "./adresse";
import { teilnahmeUrlAus } from "@/app/m/feedback/_ui/Teilnahme";

describe("beamerUrlAus", () => {
  it("nimmt Protokoll und Host wie die Teilnahme-Adresse", () => {
    const h = new Headers({ "x-forwarded-host": "feedback.example", "x-forwarded-proto": "https", host: "intern:3000" });
    expect(beamerUrlAus(h, "abc_DEF-12")).toBe("https://feedback.example/beamer/abc_DEF-12");
    expect(new URL(beamerUrlAus(h, "s")).origin).toBe(new URL(teilnahmeUrlAus(h, "t")).origin);
  });
});

describe("handyUrlAus / beitrittAdresseAus", () => {
  const h = new Headers({ "x-forwarded-host": "feedback.example", "x-forwarded-proto": "https", host: "intern:3000" });
  it("zeigt auf `/q/<code>` am selben Host wie der Beamer", () => {
    expect(handyUrlAus(h, "K7Q2MX")).toBe("https://feedback.example/q/K7Q2MX");
    expect(new URL(handyUrlAus(h, "K7Q2MX")).origin).toBe(new URL(beamerUrlAus(h, "s")).origin);
  });
  it("die Adresse zum Abtippen steht ohne Protokoll da", () => {
    expect(beitrittAdresseAus(h)).toBe("feedback.example/q");
    expect(beitrittAdresseAus(new Headers({ host: "feedback.localtest.me:3000" }))).toBe("feedback.localtest.me:3000/q");
  });
});
