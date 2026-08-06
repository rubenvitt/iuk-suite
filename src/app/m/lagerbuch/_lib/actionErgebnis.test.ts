import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { zodFehler, type ActionErgebnis, type FeldFehler } from "./actionErgebnis";

const QUELLE = join(process.cwd(), "src/app/m/lagerbuch/_lib/actionErgebnis.ts");

/**
 * Zeichengleiche lokale Kopie aus `_lib/bauform.test.ts:84-103` (Nachtrag N-5:
 * die Funktion ist dort NICHT exportiert, und wer sie braucht, kopiert sie —
 * so halten es bereits `_lib/pwaIcons.test.ts` und
 * `_lib/schreibpfade/tokenEinloesung.test.ts`).
 *
 * ⚠️ NACHGEMESSEN, damit hier keine unwahre Begruendung steht: der Scan
 * unten bliebe HEUTE auch auf dem Rohtext gruen — sein Anker `^\s*` trifft
 * die Zeile ` * KEIN "use server" auf dieser Datei` nicht. Der Filter steht
 * fuer den naechsten Kommentar, dessen Zeile MIT der Direktive beginnt; dort
 * waere der ungefilterte Scan falsch ROT auf seiner eigenen Begruendung
 * (Regel 1, Befund 1).
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt
 * mit `//` BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt
 * stehen. Ein Scan darf falsch-positiv sein und laut, nie falsch-negativ und
 * still.
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
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

describe("zodFehler — nur ein echter ZodError ergibt eine Feldkarte", () => {
  it("liefert null fuer alles, was kein ZodError ist", () => {
    expect(zodFehler(new Error("Datenbank weg"))).toBeNull();
    expect(zodFehler(null)).toBeNull();
    expect(zodFehler(undefined)).toBeNull();
    expect(zodFehler("Bitte die markierten Felder prüfen.")).toBeNull();
  });

  it("liefert null fuer ein Objekt, das nur AUSSIEHT wie ein ZodError", () => {
    // Die Pruefung ist `instanceof`, keine Formschnueffelei. Ein fremdes
    // Objekt mit einem `issues`-Feld — etwa aus einer anderen Bibliothek —
    // darf nicht als Feldkarte durchgereicht werden: die Insel zeigte sonst
    // Text an einem Feld, das die Action nie validiert hat.
    const wieEinZodError = { issues: [{ path: ["name"], message: "leer" }] };
    expect(zodFehler(wieEinZodError)).toBeNull();
  });
});

describe("zodFehler — die Uebersetzung eines wirklich fehlgeschlagenen safeParse", () => {
  it("legt jedes verletzte Feld unter seinem Feldnamen ab", () => {
    const schema = z.object({
      name: z.string().min(1, "Name darf nicht leer sein"),
      mindestbestand: z.number().int().min(0, "Mindestbestand darf nicht negativ sein"),
    });
    const ergebnis = schema.safeParse({ name: "", mindestbestand: -1 });
    if (ergebnis.success) throw new Error("Vorbedingung verletzt: safeParse haette scheitern muessen");

    // `toStrictEqual` und nicht `toEqual` — Nachtrag N-4: Vitest behandelt bei
    // `toEqual` eine Eigenschaft mit Wert `undefined` wie einen fehlenden
    // Schluessel, und eine Karte `{ name: undefined }` waere dort gruen.
    expect(zodFehler(ergebnis.error)).toStrictEqual({
      name: "Name darf nicht leer sein",
      mindestbestand: "Mindestbestand darf nicht negativ sein",
    });
  });

  it("nimmt den ERSTEN Fehler je Feld, nicht den letzten", () => {
    const schema = z.object({
      code: z.string().min(5, "Mindestens fünf Zeichen").regex(/^\d+$/, "Nur Ziffern"),
    });
    const ergebnis = schema.safeParse({ code: "ab" });
    if (ergebnis.success) throw new Error("Vorbedingung verletzt: safeParse haette scheitern muessen");

    // Vorbedingung des eigentlichen Tests: zod meldet fuer DASSELBE Feld
    // wirklich ZWEI Probleme, in Pruefreihenfolge. Ohne diese Zeile waere die
    // Zusicherung darunter wirkungslos, sobald zod nur noch eins meldete —
    // sie bliebe gruen, ohne die Regel „der erste gewinnt" zu tragen.
    expect(ergebnis.error.issues.map((p) => p.message)).toStrictEqual([
      "Mindestens fünf Zeichen",
      "Nur Ziffern",
    ]);

    // Zwei Meldungen an einem Eingabefeld sind eine mehr, als jemand lesen
    // wird — und die zweite ist hier zusaetzlich die unbrauchbarere.
    expect(zodFehler(ergebnis.error)).toStrictEqual({ code: "Mindestens fünf Zeichen" });
  });

  it("verbindet einen verschachtelten Pfad mit Punkten", () => {
    const schema = z.object({ charge: z.object({ mhd: z.string() }) });
    const ergebnis = schema.safeParse({ charge: { mhd: 20260806 } });
    if (ergebnis.success) throw new Error("Vorbedingung verletzt: safeParse haette scheitern muessen");
    expect(ergebnis.error.issues[0]?.path).toStrictEqual(["charge", "mhd"]);

    // Der Schluessel ist der Name, unter dem die Insel ihr Feld findet. Ein
    // anderer Verbinder traefe dort nichts, und der Text erschiene nirgends.
    expect(Object.keys(zodFehler(ergebnis.error) ?? {})).toStrictEqual(["charge.mhd"]);
  });

  it("legt einen Fehler OHNE Pfad unter `_` ab statt unter dem leeren Namen", () => {
    // Ein Fehler an der Wurzel (`z.string()` gegen eine Zahl, oder ein
    // `.refine()` am ganzen Objekt) hat einen leeren Pfad. Ohne den Rueckfall
    // hiesze der Schluessel "" — ein Name, den kein Feld traegt und den die
    // Insel nirgends anzeigen kann.
    const ergebnis = z.string().safeParse(42);
    if (ergebnis.success) throw new Error("Vorbedingung verletzt: safeParse haette scheitern muessen");
    expect(ergebnis.error.issues[0]?.path).toStrictEqual([]);

    const karte = zodFehler(ergebnis.error);
    expect(Object.keys(karte ?? {})).toStrictEqual(["_"]);
    // Der Text stammt von zod, nicht aus diesem Test — er belegt, dass der
    // Wert wirklich durch `zodFehler` gelaufen ist.
    expect(karte?.["_"]).toMatch(/expected string/);
  });

  it("arbeitet auf dem WURFPFAD, den jeder Aufrufer benutzt", () => {
    // Alle Verwender rufen `Schema.parse()` in einem `try` und reichen den
    // gefangenen Wert weiter (Falle 66: die Fehlerlage ist ein Rueckgabewert,
    // kein Wurf, aber zod selbst wirft). Der Wert im `catch` ist als `unknown`
    // typisiert — genau die Signatur von `zodFehler`.
    const schema = z.object({ menge: z.number().int().min(1, "Mindestens 1") });
    let karte: FeldFehler | null = null;
    try {
      schema.parse({ menge: 0 });
      throw new Error("Vorbedingung verletzt: parse haette werfen muessen");
    } catch (e) {
      karte = zodFehler(e);
    }
    expect(karte).toStrictEqual({ menge: "Mindestens 1" });
  });
});

describe("ActionErgebnis — was der Typ ZUSAGT", () => {
  // ⚠️ DIE DREI ZUSICHERUNGEN DIESES BLOCKS TRAEGT `pnpm typecheck`, NICHT
  // VITEST. Waere die jeweilige Regel weg, waere die `@ts-expect-error`-
  // Direktive unbenutzt, und `tsc` meldet „Unused '@ts-expect-error'
  // directive" — der Bau bricht. Vorbild: `_ui/rahmen.test.tsx:187-196`.

  it("verlangt `wert`, sobald T nicht `undefined` ist", () => {
    // @ts-expect-error `wert` ist bei einem Nutzlast-Typ ABSICHTLICH Pflicht.
    const ohneWert: ActionErgebnis<{ id: string }> = { ok: true };
    expect("wert" in ohneWert).toBe(false);
  });

  it("verlangt im Fehlerzweig einen `fehler`-Text", () => {
    // Ohne Text haette die Anzeige nichts zu zeigen, und der Aufrufer fiele
    // auf `e.message` zurueck — in Produktion Framework-Englisch (Falle 66).
    // @ts-expect-error `fehler` ist ABSICHTLICH Pflicht.
    const ohneText: ActionErgebnis = { ok: false };
    expect("fehler" in ohneText).toBe(false);
  });

  it("nimmt fuer `feldFehler` KEIN null — deshalb der Spread-Umweg der Aufrufer", () => {
    // `zodFehler` liefert `FeldFehler | null`; `feldFehler` ist optional, nicht
    // nullbar. Jeder Aufrufer schreibt deshalb
    // `...(feldFehler ? { feldFehler } : {})` statt `feldFehler` direkt.
    // @ts-expect-error `null` ist ABSICHTLICH kein zulaessiger Wert.
    const mitNull: ActionErgebnis = { ok: false, fehler: "x", feldFehler: null };
    expect("feldFehler" in mitNull).toBe(true);
  });

  it("laeszt einen Erfolg OHNE Nutzlast zu, wenn T `undefined` ist", () => {
    // Die Gegenprobe zum ersten Fall: ohne sie waere „`wert` ist Pflicht"
    // auch dann erfuellt, wenn `wert` IMMER Pflicht waere — und `ok: true`
    // ohne Nutzlast (jede `updateArtikel`-artige Action) nicht mehr baubar.
    const nurOk: ActionErgebnis = { ok: true };
    expect("wert" in nurOk).toBe(false);

    // Und die positive Form des Nutzlast-Zweiges, wie T114 sie schreibt
    // (`return { ok: true, wert: { gebucht } }`). Getragen wird auch DIESE
    // Zeile von `tsc`, nicht vom `expect`: waere `wert` anders typisiert,
    // stuende hier ein Typfehler. Ein Laufzeitvergleich gegen dasselbe
    // Literal, aus dem der Wert zwei Zeilen darueber gebaut wurde, koennte
    // konstruktiv nie fehlschlagen und stuende nur da.
    const mitWert: ActionErgebnis<{ gebucht: number }> = { ok: true, wert: { gebucht: 3 } };
    expect("wert" in mitWert).toBe(true);
  });
});

/*
 * KEIN eigener "use client"-Scan hier, und das ist eine Entscheidung, keine
 * Luecke: `_lib/bauform.test.ts:293-307` sammelt JEDE Datei unter `_lib/` und
 * `_db/` ein und prueft sie auf genau diese Direktive (Falle 6). Diese Datei
 * faellt dort ohne Zutun hinein — ein zweiter Scan waere eine Kopie, die als
 * Absicherung gelesen wird (Regel 4).
 */
describe("Bauform der Datei", () => {
  it('traegt KEINE "use server"-Direktive', () => {
    // Auf einer "use server"-Datei ist jeder Export eine Action — und ein
    // exportierter TYP dort ein Fehler, den erst die Laufzeit meldet.
    //
    // ⚠️ `ohneKommentare()` ist bewusst vorgeschaltet, aber die naheliegende
    // Begruendung stimmt NICHT und ist nachgemessen: der Anker `^\s*` trifft
    // die heutige Zeile im Kopfkommentar (` * KEIN "use server" auf dieser
    // Datei`) nicht, derselbe Scan bleibt auf dem ROHTEXT gruen. Der Filter
    // faengt den naechsten Kommentar, dessen Zeile MIT der Direktive
    // beginnt — dort waere der ungefilterte Scan falsch ROT (Regel 1,
    // Befund 1).
    const roh = readFileSync(QUELLE, "utf8");
    expect(ohneKommentare(roh)).not.toMatch(/^\s*["']use server["']/m);
  });

  it("behaelt die vom Plan vorgeschriebene Begruendung", () => {
    // Regel 1 woertlich: „loesche dabei niemals einen Kommentar, den der Plan
    // als Begruendung vorschreibt" — und die naheliegende „Reparatur" eines
    // Kommentar-Treffers ist genau das Loeschen dieses Satzes. Beide Saetze
    // sind das Einzige, was einem spaeteren Bearbeiter sagt, warum die Datei
    // WEDER Server- NOCH Client-Direktive traegt.
    const roh = readFileSync(QUELLE, "utf8");
    expect(roh).toContain('KEIN "use server" auf dieser Datei');
    expect(roh).toContain('KEIN "use client": Server Actions lesen sie.');
  });
});
