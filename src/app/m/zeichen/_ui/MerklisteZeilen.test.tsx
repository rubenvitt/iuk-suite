// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, query, queryAll, exists, click } from "@/app/m/qr/_lib/test-dom";
import { findeZeichen } from "../_lib/katalog";
import { merkAnzeige, VERWAIST_TEXT } from "../_lib/merkliste";
import { AKTION_FEHLGESCHLAGEN } from "../_lib/aktionsfehler";

const entferneMock = vi.fn<(id: string) => Promise<void>>(async () => {});
vi.mock("../actions", () => ({
  merkeZeichen: async () => {},
  entferneZeichen: (id: string) => entferneMock(id),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { MerklisteZeilen } = await import("./MerklisteZeilen");

const ANKER = "rezept:C.1.1";
const BEISPIEL = findeZeichen(ANKER);
if (BEISPIEL === null) throw new Error("Anker rezept:C.1.1 fehlt im Generat");

const ZEILEN = merkAnzeige([
  { zeichenId: ANKER, titelSchnappschuss: BEISPIEL.titel },
  { zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" },
]);

beforeEach(() => {
  entferneMock.mockClear();
});

afterEach(async () => {
  await unmount();
});

describe("MerklisteZeilen", () => {
  it("zeigt eine aufloesbare Zeile mit Bild, Titel und Bedeutung aus dem Generat", async () => {
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);
    const zeile = query(`[data-testid="zeichen-merkzeile-${ANKER}"]`);
    expect(zeile.querySelector("svg")).not.toBeNull();
    expect(zeile.textContent).toContain(BEISPIEL.titel);
    expect(zeile.textContent).toContain(BEISPIEL.bedeutung);
  });

  /*
   * SPEC §4.6 STUFE 2 — DIE ZEILE BLEIBT STEHEN. Der naheliegende „Aufraeumer"
   * (nicht aufloesbar -> nicht anzeigen) laesst eine gemerkte Sache spurlos
   * verschwinden, ohne dass jemand geloescht hat. Genau das darf nicht passieren.
   */
  it("laesst eine nicht mehr aufloesbare Zeile stehen — mit Schnappschuss und Erklaerung", async () => {
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);
    const zeile = query('[data-testid="zeichen-merkzeile-rezept:GIBTSNICHT"]');
    expect(zeile.textContent).toContain("Bergungsgruppe");
    expect(zeile.textContent).toContain(VERWAIST_TEXT);
    expect(zeile.querySelector("svg")).toBeNull();
  });

  /*
   * Ein Link auf `/katalog/rezept:GIBTSNICHT` liefe in ein `notFound()` — die
   * Zeile erklaert sich, sie verspricht keinen Weg, den es nicht gibt.
   */
  it("verlinkt eine verwaiste Zeile NICHT auf die Einzelseite", async () => {
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);
    const ziele = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(ziele).toContain(`/m/zeichen/katalog/${encodeURIComponent(ANKER)}`);
    expect(ziele.join(" ")).not.toContain("GIBTSNICHT");
  });

  /*
   * ZWEI ZEILEN, NICHT EINE. Mit einer einzigen waere eine fest verdrahtete Id
   * ununterscheidbar von der richtigen — dieselbe Regel wie in
   * `aufgaben/_ui/RoutinenTabelle.test.tsx`.
   */
  it("jeder Entfernen-Knopf traegt die EIGENE Id, auch der einer verwaisten Zeile", async () => {
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);
    await click('[data-testid="zeichen-merkliste-entfernen-rezept:GIBTSNICHT"]');
    expect(entferneMock).toHaveBeenCalledWith("rezept:GIBTSNICHT");

    await click(`[data-testid="zeichen-merkliste-entfernen-${ANKER}"]`);
    expect(entferneMock).toHaveBeenLastCalledWith(ANKER);
    expect(entferneMock).toHaveBeenCalledTimes(2);
  });

  it("der Leerzustand sagt, woher Merkzeilen kommen", async () => {
    await mount(<MerklisteZeilen zeilen={[]} />);
    expect(exists('[data-testid="zeichen-merkliste"]')).toBe(false);
    expect(document.body.textContent).toContain("Merken");
    expect(document.body.textContent).toContain("Katalog");
  });
});

/*
 * KORREKTUR 9 DES AUFTRAGS — dieselbe Zusage wie in der Katalog-Insel: ein
 * abgewiesener Schreibvorgang zeigt einen Satz und laesst die Liste stehen. Ohne
 * `catch` nahm ein `Forbidden` nach abgelaufener Sitzung die ganze Flaeche mit.
 */
describe("MerklisteZeilen — abgewiesene Aktion", () => {
  it("zeigt einen Satz und behaelt die Zeilen", async () => {
    entferneMock.mockRejectedValueOnce(new Error("Forbidden"));
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);

    await click(`[data-testid="zeichen-merkliste-entfernen-${ANKER}"]`);

    expect(query('[data-testid="zeichen-aktionsfehler"]').textContent).toContain(
      AKTION_FEHLGESCHLAGEN,
    );
    expect(queryAll('[data-testid^="zeichen-merkzeile-"]')).toHaveLength(2);
  });
});
