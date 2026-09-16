// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { CheckDurchfuehrenKnopf } from "./CheckDurchfuehrenKnopf";

afterEach(() => unmount());

/**
 * DRK-305 — der Einstieg in den Fahrzeug-Check aus der Verwaltung.
 *
 * ⚠️ DIESELBE STRUKTURPRÜFUNG WIE AN `ChecklisteKnopf`, UND AUS DEMSELBEN
 * ANLASS: dort schrieb die erste Fassung `<Link><Button/></Link>` — ein
 * `<button>` in einem `<a>`, also verbotener Inhalt. Der Knopf schluckt den
 * Klick, der Anker navigiert nie, und `typecheck`, `lint`, `build` und Vitest
 * blieben alle vier grün. Aufgefallen ist es erst im e2e-Lauf, an der Adresse,
 * die nach dem Klick stehenblieb.
 *
 * Was ein DOM-Test NICHT sagen kann, ist, ob ein Klick wirklich navigiert. Er
 * kommt dem e2e-Lauf nur zuvor.
 */
describe("CheckDurchfuehrenKnopf — ein Anker, kein Knopf im Anker", () => {
  it("rendert einen `<a>` und KEIN `<button>`", async () => {
    await mount(<CheckDurchfuehrenKnopf beschriftung="Check durchführen" />);
    const anker = query("a");
    expect(anker.textContent).toContain("Check durchführen");
    expect(queryAll("button")).toHaveLength(0);
    expect(anker.querySelectorAll("a")).toHaveLength(0);
  });

  it("führt OHNE `fahrzeugId` auf die volle Fahrzeugwahl", async () => {
    /*
     * DER KERN DES TICKETS. Ein Ziel mit fester Fahrzeug-Id wäre ein Lesezeichen
     * auf ein einzelnes Fahrzeug — genau die Beschränkung, gegen die die User
     * Story geschrieben ist („damit ich nicht auf ein einzelnes gescanntes
     * Fahrzeug beschränkt bin").
     */
    await mount(<CheckDurchfuehrenKnopf beschriftung="Check durchführen" />);
    expect(query("a").getAttribute("href")).toBe("/helfer/check");
  });

  it("führt in den HELFER-Ast, nicht in eine zweite Check-Fläche", async () => {
    // Es gibt genau EINE Check-Oberfläche. Ein Ziel unter `/verwaltung/…` hieße,
    // dass daneben eine zweite gebaut wurde — und die erste Änderung, die nur
    // eine von beiden mitnimmt, fällt niemandem auf.
    await mount(<CheckDurchfuehrenKnopf fahrzeugId="fz-1" beschriftung="Check" />);
    expect(query("a").getAttribute("href")).toMatch(/^\/helfer\/check/);
  });

  it("hängt eine `fahrzeugId` als `?fz=` an", async () => {
    await mount(<CheckDurchfuehrenKnopf fahrzeugId="fz-1" beschriftung="Check durchführen" />);
    expect(query("a").getAttribute("href")).toBe("/helfer/check?fz=fz-1");
  });

  it("kodiert eine ID mit Sonderzeichen, statt die Abfrage zu zerlegen", async () => {
    await mount(<CheckDurchfuehrenKnopf fahrzeugId="a&b=c" beschriftung="Check" />);
    expect(query("a").getAttribute("href")).toBe("/helfer/check?fz=a%26b%3Dc");
  });
});
