// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { ChecklisteKnopf } from "./ChecklisteKnopf";

afterEach(() => unmount());

/**
 * DER RUECKFALLRIEGEL ZU EINEM BEHOBENEN FEHLER.
 *
 * ⚠️ DIE ERSTE FASSUNG SCHRIEB `<Link><Button/></Link>` — ein `<button>` in
 * einem `<a>`. Das ist verbotener Inhalt (ein `<a>` darf keinen interaktiven
 * Inhalt tragen): der Knopf schluckt den Klick, und der Anker navigiert NIE.
 * Am Bildschirm war nichts zu sehen — der Knopf sah aus wie ein Knopf,
 * `getByRole("link")` fand ihn, und `typecheck`, `lint`, `build` und Vitest
 * blieben alle vier gruen. Sichtbar wurde es allein im e2e-Lauf, an der
 * Adresse, die nach dem Klick stehenblieb.
 *
 * ⚠️ DIESE DATEI ERSETZT DIE BEIDEN e2e-FAELLE NICHT, sie kommt ihnen nur
 * zuvor. Was hier geprueft wird, ist die STRUKTUR (ein Anker, kein Knopf
 * darin, richtiges Ziel) — dass ein Klick darauf wirklich navigiert, kann nur
 * ein echter Browser sagen. Der Unterschied ist der ganze Grund, aus dem der
 * Fehler durch vier Tore kam; er steht hier, damit die naechste Fassung nicht
 * erst nach acht Minuten e2e auffaellt.
 *
 * Die Falle steht seit laengerem im Repo ausgeschrieben — `m/qr/page.tsx:34-42`
 * nennt sie woertlich.
 */
describe("ChecklisteKnopf — ein Anker, kein Knopf im Anker", () => {
  it("rendert einen `<a>` und KEIN `<button>`", async () => {
    await mount(<ChecklisteKnopf beschriftung="Checklisten drucken" />);
    const anker = query("a");
    expect(anker.textContent).toContain("Checklisten drucken");
    // DIE ZEILE, DIE DEN FEHLER GEFANGEN HAETTE.
    expect(queryAll("button")).toHaveLength(0);
    // Und kein Anker im Anker — der andere Weg, dieselbe Regel zu brechen.
    expect(anker.querySelectorAll("a")).toHaveLength(0);
  });

  it("zeigt ohne `fahrzeugId` auf alle aktiven Fahrzeuge", async () => {
    await mount(<ChecklisteKnopf beschriftung="Checklisten drucken" />);
    expect(query("a").getAttribute("href")).toBe("/verwaltung/checklisten");
  });

  it("haengt eine `fahrzeugId` als `?fz=` an", async () => {
    await mount(
      <ChecklisteKnopf fahrzeugId="fz-1" beschriftung="Checkliste drucken" />,
    );
    expect(query("a").getAttribute("href")).toBe("/verwaltung/checklisten?fz=fz-1");
  });

  it("kodiert eine ID mit Sonderzeichen, statt die Abfrage zu zerlegen", async () => {
    // IDs sind heute schlicht; `encodeURIComponent` ist trotzdem Pflicht — ein
    // `&` in einer ID hinge sonst einen zweiten Parameter an die Adresse.
    await mount(
      <ChecklisteKnopf fahrzeugId="a&b=c" beschriftung="Checkliste drucken" />,
    );
    expect(query("a").getAttribute("href")).toBe("/verwaltung/checklisten?fz=a%26b%3Dc");
  });
});
