// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { baue } from "../../_lib/beispiele/bau";
import { aendereStelle } from "../../_lib/plan/operationen";
import type { Aendere } from "../editor/aendere";
import { neuerVerlauf, tue } from "../editor/verlauf";
import { Gliederung } from "./Gliederung";
vi.mock("../../_actions/bibliothek", () => ({ speichereBibStelleAction: vi.fn(), importiereBibEinheitenAction: vi.fn(), importiereBibVerbindungenAction: vi.fn() }));

/** Jede gerenderte Zeile rendert genau einen Zeichenknopf — sein Aufruf zählt die Zeilen-Renders. */
const renders = vi.hoisted(() => ({ n: 0, bib: 0 }));
vi.mock("./ZeichenKnopf", () => ({ ZeichenKnopf: () => { renders.n++; return null; } }));
vi.mock("../editor/bibliothekKontext", async (orig) => {
  const m = await orig<typeof import("../editor/bibliothekKontext")>();
  return { ...m, useBibliothek: () => { renders.bib++; return m.useBibliothek(); } };
});
import { BibliothekAnbieter } from "../editor/bibliothekKontext";
import type { Bibliothek } from "../../_lib/bibliothek/typen";

const VIELE = baue({ stellen: [{ id: "el", titel: "EL" }, ...Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, titel: `S${i}`, eltern: "el" }))] });

/** `bib`: der Anbieter steht INNEN, wie im Editor — er rendert bei jeder Taste mit, sein Wert darf sich dabei nicht ändern. */
function Pruefstand({ bib }: { bib?: Bibliothek }) {
  const [v, setV] = useState(() => neuerVerlauf(VIELE));
  const aendere: Aendere = (op, schluessel) => { setV(tue(v, op(v.jetzt), new Date().getTime(), schluessel)); return null; };
  const inhalt = (
    <>
      <button type="button" data-flyin-tippen="" onClick={() => aendere((q) => aendereStelle(q, "s5", { titel: `${q.stellen.find((x) => x.id === "s5")!.titel}x` }), "titel:s5")} />
      <Gliederung inhalt={v.jetzt} auswahl="s3" aendere={aendere} meldung={null} onAuswahl={() => {}} onDetails={() => {}} onLoeschen={() => {}}
        onRueck={() => {}} onWieder={() => {}} onHinweis={() => {}} verwirfUnberuehrt={() => null} symbole={{}} zeichenIndex={[]} ladeSymbole={() => {}} />
    </>
  );
  return bib ? <BibliothekAnbieter start={bib}>{inhalt}</BibliothekAnbieter> : inhalt;
}

afterEach(async () => { await unmount(); });

describe("Last der Gliederung (Entscheidungen 2, 15)", () => {
  it("eine Änderung an einer Stelle rendert nur deren Zeile neu — auch wenn `aendere` bei jedem Rendern neu ist", async () => {
    await mount(<Pruefstand />);
    await act(async () => {});
    renders.n = 0;
    for (let i = 0; i < 5; i++) await act(async () => { query<HTMLButtonElement>("[data-flyin-tippen]").click(); });
    expect(renders.n).toBeLessThanOrEqual(5); // eine Zeile je Tastendruck, nicht 61
  });
  it("mit Bibliothek im Kontext: Tippen im Flyin rendert weiter nur die eine Zeile — auch die Kontext-Leser (Entscheidung 14)", async () => {
    const BIB = { stellen: Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, titel: `Bib ${i}`, zeichen: null, leiter: null, kontakte: [], notiz: null })), einheiten: [], verbindungen: [{ id: "bv", art: "dmo" as const, bezeichnung: "DMO 1", notiz: null }] };
    await mount(<Pruefstand bib={BIB} />);
    await act(async () => {});
    renders.n = 0;
    renders.bib = 0;
    for (let i = 0; i < 5; i++) await act(async () => { query<HTMLButtonElement>("[data-flyin-tippen]").click(); });
    expect(renders.n).toBeLessThanOrEqual(5);
    // Kontext-Leser: je Taste die Gliederung selbst und das Verbindungsfeld der geänderten Zeile — nicht 61 Felder.
    expect(renders.bib).toBeLessThanOrEqual(10);
  });
});
