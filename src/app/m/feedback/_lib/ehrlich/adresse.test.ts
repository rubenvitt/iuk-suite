import { describe, it, expect } from "vitest";
import { abholenPfad, einwurfUrlAus, istEhrlichEinstieg } from "./adresse";

const kopf = (host: string) => new Headers({ host, "x-forwarded-proto": "https" });
const ENV = { SUITE_EINSTIEG_HOST_EHRLICH: "ehrlich-gesagt.example.org" };

describe("Adresse des Einwurfs (IDA-340)", () => {
  it("zeigt mit Einstiegshost auf dessen Wurzel, ohne Secret, egal über welchen Host", () => {
    expect(einwurfUrlAus(kopf("da.example.org"), "geheim", ENV)).toBe("https://ehrlich-gesagt.example.org/");
  });
  it("ohne Einstiegshost auf den Secret-Link des aufgerufenen Hosts", () => {
    expect(einwurfUrlAus(kopf("da.example.org"), "geheim", {})).toBe("https://da.example.org/k/geheim");
  });
  it("erkennt den Einstiegshost und führt dort ohne /k zum Abholen", () => {
    expect(istEhrlichEinstieg(kopf("ehrlich-gesagt.example.org"), ENV)).toBe(true);
    expect(istEhrlichEinstieg(kopf("da.example.org"), ENV)).toBe(false);
    expect(abholenPfad(kopf("ehrlich-gesagt.example.org"), ENV)).toBe("/abholen");
    expect(abholenPfad(kopf("da.example.org"), ENV)).toBe("/k/abholen");
  });
});
