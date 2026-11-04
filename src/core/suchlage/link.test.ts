import { describe, expect, it } from "vitest";
import { suchlageLinkAus } from "./link";
import { suchlageLinkAus as ausLagemonitor } from "@/app/m/lagemonitor/_lib/konfiguration";

const TOKEN = "a".repeat(64);

describe("suchlageLinkAus", () => {
  it("trennt Adresse und Token, auch unter einem Pfad", () => {
    expect(suchlageLinkAus(`https://suchlage.example.org/kiosk#${TOKEN}`)).toEqual({ adresse: "https://suchlage.example.org", token: TOKEN });
    expect(suchlageLinkAus(`https://iuk.example.org/suchlage/kiosk/#${TOKEN}`)).toEqual({ adresse: "https://iuk.example.org/suchlage", token: TOKEN });
  });
  it("ist dieselbe Funktion, die der Lagemonitor nutzt", () => {
    expect(ausLagemonitor).toBe(suchlageLinkAus);
  });
});
