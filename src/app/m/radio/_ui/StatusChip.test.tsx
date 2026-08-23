// @vitest-environment jsdom
// src/app/m/radio/_ui/StatusChip.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { GERAETE_STATUS, statusEtikett, statusTon } from "../_lib/status";
import { StatusChip } from "./StatusChip";

const QUELLE = "src/app/m/radio/_ui/StatusChip.tsx";

/**
 * Kopie von `ohneKommentare()` aus `src/app/m/radio/riegel.test.ts:181-201`.
 *
 * ⚠️ OHNE SIE IST DER LETZTE SCAN AUF SEINER EIGENEN BEGRUENDUNG ROT (gemessen, erster
 * Lauf dieser Datei): `StatusChip.tsx` schreibt die Falle-6-Begruendung in seinen
 * Kopfkommentar und nennt die Direktive dabei woertlich. Die naheliegende „Reparatur"
 * waere, den Satz zu loeschen. `riegel.test.ts` exportiert die Funktion nicht, und dies
 * ist ein anderer Testkoerper — deshalb die lokale Kopie, wie
 * `lagerbuch/_ui/rahmen.test.tsx:28-51` sie haelt.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

afterEach(async () => {
  await unmount();
});

describe("radio-StatusChip: Farbe ist nie der einzige Traeger", () => {
  it("jeder Chip traegt sein Etikett, der Punkt ist aria-hidden", async () => {
    /*
     * Spec:3696-3697 und Entscheidung E3 (`briefs/KOPF.md:571-580`). Dieser Fall ist der
     * Erbe aus A12: er stand dort in der Tabelle und war ueber `_ui/StatusChip.tsx`
     * leer-gruen, weil die Datei erst hier entsteht
     * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:295-304`, Fund F15;
     * `progress.md:249-251`).
     *
     * ⛔ VOLLZAEHLIG UEBER `GERAETE_STATUS`, NICHT UEBER EINE ZWEITE LISTE. Waechst die
     * Union um einen Zweig, laeuft dieser Fall von selbst mit — eine hier abgeschriebene
     * Liste liefe still an ihm vorbei.
     */
    for (const status of GERAETE_STATUS) {
      await unmount();
      await mount(<StatusChip status={status} />);
      const chip = query("[data-rolle='radio-statuschip']");
      expect(chip.textContent, status).toContain(statusEtikett(status));

      const punkte = queryAll("[data-rolle='radio-statuschip'] [aria-hidden='true']");
      expect(punkte.length, `${status}: genau EIN versteckter Punkt`).toBe(1);
      expect(punkte[0]!.textContent, `${status}: der Punkt traegt keinen Text`).toBe("");
    }
  });

  it("der Ton steht als Datenattribut, nicht als verdrahtete Farbe im Markup", async () => {
    /*
     * Falle 2 (`CLAUDE.md:14-16`): die vier Hexpaare stehen als EIGENE CSS-Variablen im
     * Modul-Stylesheet, je Hell- und Dunkelzweig (⬜ A-L10, `_lib/status.ts` bei
     * `STATUS_HEX`). Ein `style={{ background: … }}` im Markup traege genau EINEN der
     * beiden Werte und liesse den Dunkelzweig still auf dem Hellwert stehen.
     */
    for (const status of GERAETE_STATUS) {
      await unmount();
      await mount(<StatusChip status={status} />);
      const chip = query("[data-rolle='radio-statuschip']");
      expect(chip.getAttribute("data-ton"), status).toBe(statusTon(status));
      expect(chip.getAttribute("style"), `${status}: Farbe im Markup statt im Stylesheet`).toBeNull();
    }
    const quelle = readFileSync(QUELLE, "utf8");
    expect(quelle, "eine Hexzahl im Markup — sie gehoert nach _lib/status.ts").not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("der Chip zeigt GENAU sein Etikett — kein fuenfter Zustand, kein Rueckfalltext", async () => {
    /*
     * ⛔ ⬜ A-L13, Betreiberentscheidung vom 2026-08-22 (`progress.md:22-32`):
     * `status = NULL` faellt auf „frei" zurueck — ⛔ KEIN fuenfter Chip-Zustand, KEIN eigener
     * Ton dafuer, KEINE Sperre der Ausleihe. Die Faltung steht an genau EINER Stelle,
     * `geraeteZustandAus` in `_lib/status.ts`; dieser Chip nimmt bereits einen gefalteten
     * `GeraeteStatus` und kann konstruktiv nicht an ihr vorbeilaufen.
     *
     * Die VERHALTENS-Haelfte: der sichtbare Text ist das Etikett und sonst nichts. Ein
     * fuenfter Zweig oder ein angehaengter Zusatz faellt hier auf, ohne dass ein
     * Prosa-Scan noetig waere.
     */
    for (const status of GERAETE_STATUS) {
      await unmount();
      await mount(<StatusChip status={status} />);
      expect(query("[data-rolle='radio-statuschip']").textContent?.trim(), status).toBe(
        statusEtikett(status),
      );
    }
  });

  it("traegt keinen Rueckfall-Operator — der waere ein ZWEITER Faltungsort", () => {
    // Ein `?? …` in dieser Datei waere tot, weil `GeraeteStatus` kein `null` kennt — tot und
    // irrefuehrend: ein spaeterer Leser hielte die Entscheidung fuer offen.
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/\?\?/);
  });

  it("ist eine Server Component — kein use client, kein antd", () => {
    // E3: der Chip ist reine Ableitung aus `_lib/status.ts`, ohne Interaktion. Ein antd
    // `Tag color="error"` saehe wegen `colorError === colorPrimary` aus wie die
    // Primaeraktion (Falle 3, `src/core/theme/theme.ts:32-33`).
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/["']use client["']/);
    expect(q).not.toMatch(/from\s+["']antd["']/);
  });
});
