import { describe, expect, it } from "vitest";
import { beamerUrlAus } from "./adresse";
import { teilnahmeUrlAus } from "@/app/m/feedback/_ui/Teilnahme";

describe("beamerUrlAus", () => {
  it("nimmt Protokoll und Host wie die Teilnahme-Adresse", () => {
    const h = new Headers({ "x-forwarded-host": "feedback.example", "x-forwarded-proto": "https", host: "intern:3000" });
    expect(beamerUrlAus(h, "abc_DEF-12")).toBe("https://feedback.example/beamer/abc_DEF-12");
    expect(new URL(beamerUrlAus(h, "s")).origin).toBe(new URL(teilnahmeUrlAus(h, "t")).origin);
  });
});
