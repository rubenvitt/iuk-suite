// @vitest-environment jsdom
// src/app/m/radio/_ui/SitzungErneuern.test.tsx
import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * DIE INLINE-ERNEUERUNG DER SITZUNG — Entscheidung E12
 * (`.superpowers/sdd/planteil3/briefs/KOPF.md:675-728`), Zusage §3.10 Nr. 8
 * (Spec:3235-3236) und §3.4.4 (Spec:2563-2570).
 *
 * ⛔ `_actions/sitzung.ts` TRAEGT `"use server"` und zieht `next/headers`, die Gate-Schranke
 * und die Moduldatenbank nach. Diese Datei braucht `erneuereSitzung` nur als REFERENZ; WAS
 * sie tut, gehoert A9 (`_actions/guards.test.ts`, `_lib/bauform.test.ts`). Dieselbe Bauform
 * wie `_ui/AusleihRahmen.test.tsx:14-15` und `_ui/GateFormular.test.tsx:34`.
 *
 * ⛔ WAS DIESE DATEI NICHT BELEGT: dass die Erneuerung am Server WIRKT (⬜ A-L9,
 * `.superpowers/sdd/planteil3/progress.md:45-55`). Sie belegt, was die Insel mit dem
 * Ergebnis macht.
 */
const erneuereSitzungMock = vi.hoisted(() => vi.fn());
vi.mock("../_actions/sitzung", () => ({ erneuereSitzung: erneuereSitzungMock }));

import { mount, unmount, query, exists, fill, click } from "@/app/m/qr/_lib/test-dom";
import { SitzungErneuern } from "./SitzungErneuern";

const INSEL = "[data-rolle='radio-sitzung-erneuern']";
const CODEFELD = "#radio-erneuern-code";
const SENDEN = "[data-rolle='radio-erneuern-senden']";
const FEHLER = "[data-rolle='radio-erneuern-fehler']";
const ERLEDIGT = "[data-rolle='radio-sitzung-erneuert']";

/** Ein Code in der Schreibweise des Aufstellers (Spec:2082-2087, sieben Vierergruppen). */
const CODE = "kj3m-7q0z-h8ax-bt2v-9r5n-w4dc-ye6f";

afterEach(async () => {
  await unmount();
  erneuereSitzungMock.mockReset();
});

describe("radio-SitzungErneuern: wann sie ueberhaupt erscheint", () => {
  it("erscheint bei grund sitzung", async () => {
    /*
     * Die POSITIVE Haelfte der Zusage §3.10 Nr. 8. §3.4.4 (Spec:2563-2570): „die Flaeche
     * bietet INLINE ein Codefeld an, das die Sitzung erneuert, ohne die eingetragenen Werte
     * zu verlieren."
     */
    await mount(<SitzungErneuern grund="sitzung" />);

    expect(exists(INSEL)).toBe(true);
    expect(exists(CODEFELD)).toBe(true);
    expect(exists(SENDEN)).toBe(true);
  });

  it("erscheint NICHT bei grund gesperrt", async () => {
    /*
     * ⛔ DIE NEGATIVE HAELFTE, UND SIE IST DIE WICHTIGERE (Zusage §3.10 Nr. 8,
     * Spec:3235-3236). Bei einem GESPERRTEN Code scheitert dieselbe Eingabe genauso, und
     * „ein Feld, das nicht helfen kann, ist schlimmer als eine klare Absage"
     * (Spec:2563-2570). Sonde S-A19c weicht die Bedingung auf `grund !== "unbekannt"` auf —
     * dann rendert die Insel hier, und dieser Fall faellt.
     */
    await mount(<SitzungErneuern grund="gesperrt" />);

    expect(exists(INSEL)).toBe(false);
    expect(exists(CODEFELD)).toBe(false);
  });

  it("erscheint bei keinem der uebrigen Gruende", async () => {
    /*
     * ⛔ DIE ZWEI FAELLE OBEN LIESSEN EINE GLEICHHEITSPRUEFUNG AUF „NICHT gesperrt" durch —
     * die Insel erschiene dann bei `unbekannt`, `nicht-verfuegbar` und jedem anderen
     * fachlichen Ausgang, in dem ein Codefeld nichts zu suchen hat. Die zwei Unions stehen
     * in `_lib/meldungen.ts:157-163` und `:185-190`; hier stehen ihre Werte AUSGESCHRIEBEN
     * und nicht importiert, damit eine geschrumpfte Union den Fall nicht leer-gruen macht
     * (dieselbe Lehre wie `_lib/meldungen.test.ts:126-140`).
     */
    for (const grund of [
      "keine-auswahl",
      "kein-name",
      "nicht-verfuegbar",
      "verschwunden",
      "unbekannt",
      "schon-zurueck",
      "unbekannt-geworden",
      "notiz-zu-lang",
    ] as const) {
      await mount(<SitzungErneuern grund={grund} />);
      expect(exists(INSEL), `bei grund ${grund} darf kein Codefeld stehen`).toBe(false);
      await unmount();
    }
  });
});

describe("radio-SitzungErneuern: was sie mit dem Ergebnis macht", () => {
  it("zeigt den Fehlertext am Feld, wenn der Code nicht stimmt", async () => {
    /*
     * ⛔ KEIN WURF, KEIN REDIRECT: `erneuereSitzung` liefert `{ ok: false, text }`
     * (`_actions/sitzung.ts:49`). Ein Redirect verwuerfe genau die eingetragenen Werte, um
     * derentwillen diese Insel ueberhaupt existiert.
     * ⛔ DER TEXT KOMMT AUS DER ACTION UND WIRD HIER NICHT NACHGEBAUT — die Gate-Saetze
     * stehen an genau einer Stelle (`_lib/gateTexte.ts`, Spec:2387).
     */
    erneuereSitzungMock.mockResolvedValue({ ok: false, text: "Dieser Code stimmt nicht." });
    await mount(<SitzungErneuern grund="sitzung" />);

    await fill(CODEFELD, CODE);
    await click(SENDEN);

    expect(erneuereSitzungMock).toHaveBeenCalledWith(CODE);
    expect(query(FEHLER).textContent).toBe("Dieser Code stimmt nicht.");
    expect(exists(CODEFELD), "das Feld bleibt stehen — der Mensch tippt erneut").toBe(true);
    expect(exists(ERLEDIGT)).toBe(false);
  });

  it("der Fehlerort traegt role alert und kein aria-live", async () => {
    /*
     * ⛔ RULING AUS DER FIX-RUNDE 1 ZU A11 UND A18 (`progress.md:163-177`, `:404-435`):
     * ein Meldungsort, der NACH einem Antippen OHNE Seitenwechsel entsteht, traegt
     * `role="alert"`. Genau das ist dieser: er entsteht erst, wenn die Person auf „Zugang
     * erneuern" getippt hat. ⛔ KEIN `aria-live` DANEBEN — `alert` impliziert `assertive`,
     * ein `polite` daneben kehrte die Wahl still um (`_ui/GateFormular.tsx:124-146`).
     */
    erneuereSitzungMock.mockResolvedValue({ ok: false, text: "Dieser Code stimmt nicht." });
    await mount(<SitzungErneuern grund="sitzung" />);

    await fill(CODEFELD, CODE);
    await click(SENDEN);

    const ort = query(FEHLER);
    expect(ort.getAttribute("role")).toBe("alert");
    expect(ort.getAttribute("aria-live")).toBeNull();
  });

  it("bei ok true verschwindet das Feld und die Insel sendet nichts weiter", async () => {
    /*
     * ⛔ KEIN EIGENES ABSENDEN DES AUSLEIHFORMULARS (Brief A19,
     * `.superpowers/sdd/planteil3/briefs/A19.md:66-67`): ein Automatismus „erneuern und
     * gleich buchen" waere ein ZWEITER Schreibweg, den kein Test dieses Planteils bewacht.
     * Der Mensch drueckt selbst erneut.
     *
     * ⚠️ Deshalb ist die Insel KEIN `<form>` und ihr Knopf traegt `htmlType="button"`: sie
     * wird INNERHALB des Ausleihformulars gerendert (A19) bzw. im Rueckgabedialog (A20) —
     * ein verschachteltes `<form>` ist ungueltiges HTML, und ein Absendeknopf loeste das
     * AEUSSERE Formular aus.
     */
    erneuereSitzungMock.mockResolvedValue({ ok: true });
    const abgesendet = vi.fn();
    await mount(
      <form onSubmit={abgesendet}>
        <SitzungErneuern grund="sitzung" />
      </form>,
    );

    await fill(CODEFELD, CODE);
    await click(SENDEN);

    expect(exists(CODEFELD), "nach dem Erfolg ist das Feld weg").toBe(false);
    expect(exists(ERLEDIGT)).toBe(true);
    expect(abgesendet, "die Insel sendet das umgebende Formular NICHT ab").not.toHaveBeenCalled();
  });

  it("faengt einen Wurf der Action ab, statt den Baum abzureissen", async () => {
    /*
     * ⚠️ DER WURF IST EIN ECHTER PFAD, KEINE ZIER: `erneuereSitzung` traegt den WERFENDEN
     * Host-Riegel als erste Anweisung (`_actions/sitzung.ts:72-80`,
     * Bauform-Zulaessigkeitstafel Zeile 11), und ein fehlendes
     * `RADIO_AUSLEIH_SITZUNG_SECRET` wirft in JEDEM Trefferpfad (⬜ A-L7). Ohne das `catch`
     * stiege der Wurf in den Absendeweg hoch und die Person saehe eine technische
     * Fehlerseite statt eines Satzes an ihrem Feld — dieselbe Erwaegung wie in
     * `_ui/GateFormular.tsx:32-62`.
     */
    erneuereSitzungMock.mockRejectedValue(new Error("kaputt"));
    await mount(<SitzungErneuern grund="sitzung" />);

    await fill(CODEFELD, CODE);
    await click(SENDEN);

    expect(query(FEHLER).textContent, "ein Satz statt eines abgerissenen Baums").not.toBe("");
    expect(exists(CODEFELD)).toBe(true);
  });
});

describe("radio-SitzungErneuern: die Bauform", () => {
  it("setzt kein size und nennt nur deklarierte Klassen", async () => {
    /*
     * Falle 4 (`CLAUDE.md:18-22`) und Falle 2 (`CLAUDE.md:14-15`) haben ihre modulweiten
     * Waechter in `_ui/AusleihRahmen.test.tsx` (`FALLE4_DATEIEN`, `STYLESHEET_LESER`, seit
     * der Fix-Runde 1 zu A18 ERZEUGT statt aufgezaehlt). Hier steht nur der Fall, den jene
     * beiden nicht sehen: dass die Insel ueberhaupt in beide Mengen faellt — sie ist eine
     * `.tsx` unter `src/app/m/radio` und liest `ausleihe.module.css`.
     */
    const { readFileSync } = await import("node:fs");
    const q = readFileSync("src/app/m/radio/_ui/SitzungErneuern.tsx", "utf8");
    expect(q, "die Insel muss das Modul-Stylesheet lesen, sonst faellt sie aus dem Klassenscan")
      .toMatch(/import\s+s\s+from\s+["'][^"']*ausleihe\.module\.css["']/);
    expect(q, "eine Client-Insel — sonst kaeme der Zustand nie an").toMatch(/^"use client";/);
  });
});
