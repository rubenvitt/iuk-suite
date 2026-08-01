// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DER QR-DIALOG DER FREIGABEN (Spec §7.9; Plan T36 Punkt 8).
 *
 * DER DOWNLOAD IST DER PRUEFGEGENSTAND, nicht das Bild. `drop` hatte den
 * PNG-Download, `easy-filesharing` nicht, und §7.9 haelt ausdruecklich fest,
 * dass er beim Port nicht unbemerkt wegfallen darf — „unbemerkt" heisst genau:
 * ein Dialog, der den Code zeigt, sieht vollstaendig aus.
 *
 * WAS DIESE DATEI NICHT BESITZT: dass der Dateiname RICHTIG entschaerft ist. Das
 * passiert serverseitig (`entschaerfeTitel`, `_lib/zip.ts`) und besitzt
 * `SharesUebersicht.test.tsx` mit einem Umlaut-Titel. Hier steht die andere
 * Haelfte: dieser Dialog rechnet den Namen NICHT selbst — sonst gaebe es zwei
 * Entschaerfungen, und die zweite zoege `node:net` ins Client-Bundle.
 */

import { QrDialog } from "./QrDialog";
import { clickElement, existsPortal, mount, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

const QUELLE = "src/app/m/files/_ui/QrDialog.tsx";
const ohneKommentare = (quelle: string) =>
  quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DATEINAME = "_bung_Nord-qr.png";

async function zeige(offen = true, schliessen = vi.fn()) {
  await mount(
    <QrDialog
      shareId="sh-aaaaaaaa"
      titel="Übung Nord"
      qrDateiname={DATEINAME}
      offen={offen}
      schliessen={schliessen}
    />,
  );
  return schliessen;
}

afterEach(async () => {
  await unmount();
});

describe("Punkt 8 — der QR-Dialog bietet einen PNG-Download", () => {
  it("bietet den Download mit dem entschaerften Dateinamen an", async () => {
    await zeige();
    const knopf = queryPortal<HTMLAnchorElement>("[data-testid='files-share-qr-png']");
    // Das `download`-Attribut TRAEGT den Namen — bei gleicher Herkunft ist es
    // wirksam, und der Share-QR liegt auf demselben Host wie diese Seite.
    expect(knopf.getAttribute("download")).toBe(DATEINAME);
    expect(knopf.textContent).toContain("PNG");
  });

  it("zeigt das Bild und laedt in Druckgroesze herunter — beides von derselben Route", async () => {
    await zeige();
    const bild = queryPortal<HTMLImageElement>("[data-testid='files-share-qr-bild']");
    const knopf = queryPortal<HTMLAnchorElement>("[data-testid='files-share-qr-png']");

    // RELATIV: `/api/s/<id>/qr.png` liegt auf DEMSELBEN Host wie die Verwaltung
    // (`core/routing.ts` schreibt jeden Pfad des Hosts auf `/m/files/<pfad>` um).
    // Ein absoluter Link waere eine zweite Hostbestimmung.
    expect(bild.getAttribute("src")).toBe("/api/s/sh-aaaaaaaa/qr.png?w=512");
    expect(knopf.getAttribute("href")).toBe("/api/s/sh-aaaaaaaa/qr.png?w=1024");

    /*
     * KEIN `?dl=1`. Der Abgabelink-QR braucht ihn (fremde Herkunft, `download`
     * wirkt dort nicht) — `api/s/[id]/qr.png/route.ts` liest ausschliesslich
     * `w`. Ein `dl` waere hier ein zweiter Cache-Schluessel fuer dasselbe Bild
     * und keine einzige Wirkung.
     */
    expect(knopf.getAttribute("href")).not.toContain("dl=");
  });

  it("benennt den Alternativtext mit dem Titel, nicht mit „QR-Code“", async () => {
    await zeige();
    const bild = queryPortal<HTMLImageElement>("[data-testid='files-share-qr-bild']");
    expect(bild.getAttribute("alt")).toContain("Übung Nord");
  });

  it("steht nicht im Dokument, solange er zu ist", async () => {
    await zeige(false);
    expect(existsPortal("[data-testid='files-share-qr-dialog']")).toBe(false);
    expect(existsPortal("[data-testid='files-share-qr-png']")).toBe(false);
  });

  it("meldet das Schliessen an den Aufrufer", async () => {
    const schliessen = await zeige();
    const x = document.body.querySelector<HTMLElement>(".ant-modal-close");
    expect(x, "kein Schliessen-Knopf am Dialog").not.toBeNull();
    await clickElement(x!);
    // Der Dialog gehoert dem Aufrufer: er haelt die Zeile, deren QR gerade
    // sichtbar ist. Ein selbst geschlossener Modal liesze diesen Zustand stehen.
    expect(schliessen).toHaveBeenCalled();
  });

  /**
   * `_lib/zip.ts` zieht ueber `_lib/av.ts` `node:net` STATISCH in den
   * Modulgraphen; ein Import von hier truege das ins Client-Bundle — ein lauter
   * Bundler-Fehler, den `pnpm typecheck` nicht zeigt. Und eine hier
   * nachgebaute Entschaerfung waere die stille Variante desselben Fehlers: zwei
   * Regeln fuer denselben Namen, die auseinanderlaufen.
   */
  it("entschaerft den Dateinamen NICHT selbst", () => {
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle).not.toMatch(/_lib\/(zip|av)/);
    expect(quelle).not.toMatch(/replace\(/);
  });
});
