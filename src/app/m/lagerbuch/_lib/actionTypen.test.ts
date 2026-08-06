import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  RIEGEL_TEXTE, leerText, NETZ_TEXT_BUCHUNG, NETZ_TEXT_CHECK, darfErneuern,
  type HelferErgebnis, type HelferGrund,
} from "./actionTypen";

const QUELLE = "src/app/m/lagerbuch/_lib/actionTypen.ts";

describe("HelferGrund — der geschlossene Satz aus §7.3", () => {
  it("hat genau fuenf Werte, und die Typzusicherung haelt sie fest", () => {
    // Ein `satisfies` statt `as`: `as` schwiege, wenn ein Wert wegfiele.
    // ⚠️ `satisfies` allein FAENGE EINEN FEHLENDEN WERT NICHT — eine Teilmenge
    // erfuellt `HelferGrund[]` genauso. Der Traeger ist die
    // Exhaustiveness-Zusicherung darunter: fiele einer der fuenf Werte weg oder
    // kaeme ein sechster hinzu, ist `zuOrdnung` nicht mehr vollstaendig und
    // `pnpm typecheck` bricht.
    const alle = ["sitzung", "gesperrt", "leer", "netz", "eingabe"] satisfies HelferGrund[];
    expect(new Set(alle).size).toBe(5);

    const zuOrdnung: Record<HelferGrund, true> = {
      sitzung: true, gesperrt: true, leer: true, netz: true, eingabe: true,
    };
    expect(Object.keys(zuOrdnung).sort()).toEqual(
      ["eingabe", "gesperrt", "leer", "netz", "sitzung"],
    );
  });

  it("leitet die geteilte Haelfte aus SperrGrund ab statt sie abzuschreiben (G7)", () => {
    // Der Bruch waere still: `requireHelferSchreibend` gaebe "gesperrt" zurueck,
    // die Action reichte es in eine Union, die es nicht kennt, und TypeScript
    // faende es erst beim dritten Sperrgrund.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/import type \{ SperrGrund \} from "\.\/helferZugang";/);
    expect(q).toMatch(
      /export type HelferGrund = SperrGrund \| "leer" \| "netz" \| "eingabe";/,
    );
    expect(q).not.toMatch(/HelferGrund =\s*"sitzung"/);
  });

  it("`eingabe` traegt seine Begruendung an der Definition (B4)", () => {
    // Der naechste Leser sucht sonst die Erzeugerstelle und findet nur einen
    // fuenften Wert ohne Anlass — und der naheliegende „Aufraeumschritt" waere,
    // ihn auf `netz` zurueckzufuehren, also genau den Verstoss.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/["`]eingabe["`][\s\S]{0,400}safeParse/);
  });
});

describe("RIEGEL_TEXTE — die zwei serverseitigen Saetze, wortgleich mit §7.3", () => {
  it("sitzung: nennt das Kaertchen UND die Zusage, dass Eingaben stehenbleiben", () => {
    expect(RIEGEL_TEXTE.sitzung).toBe(
      "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
    );
  });

  it("gesperrt: sagt AUSDRUECKLICH, dass nichts gespeichert wurde", () => {
    // Der teuerste Zustand dieser Tabelle ist ein 200, das luegt. Wer hier
    // „bitte erneut versuchen" schreibt, schickt die Helferin in eine Schleife,
    // die ein erneutes Einloesen desselben Codes genauso wenig aufloest.
    expect(RIEGEL_TEXTE.gesperrt).toBe(
      "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
    );
  });

  it("hat genau zwei Eintraege — `leer` und `netz` stehen NICHT hier", () => {
    // `leer` braucht den Artikelnamen, `netz` entsteht nie serverseitig.
    expect(Object.keys(RIEGEL_TEXTE).sort()).toEqual(["gesperrt", "sitzung"]);
  });
});

describe("leerText — der Zustand, der heute als Erfolg aussieht", () => {
  it("nennt den Artikel beim Namen und schickt zur Verwaltung", () => {
    // Heute macht HelferEntnahme.tsx:26-27 aus {gebucht: 0} ein gruenes
    // „Entnahme gebucht: 0 × X" mit Haekchen (:55, `chip chip-ok`).
    expect(leerText("Kompresse 10×10")).toBe(
      "Im Handlager liegt nichts mehr von Kompresse 10×10. Bitte der Verwaltung melden.",
    );
  });

  it("kommt auch mit einem leeren Namen ohne doppelte Leerzeichen aus", () => {
    expect(leerText("")).not.toMatch(/ {2}/);
  });
});

describe("Die zwei Netztexte sagen VERSCHIEDENES und werden nie getauscht", () => {
  it("Buchung: kurz, weil eine Entnahme ein Handgriff ist", () => {
    expect(NETZ_TEXT_BUCHUNG).toBe("Keine Verbindung. Die Buchung wurde nicht gespeichert.");
  });

  it("Check: nennt ausdruecklich, dass nichts verloren ist", () => {
    // Ein Fahrzeug-Check ist zehn bis zwanzig Minuten Arbeit, und der gesamte
    // Zustand liegt im Client. „Nicht gespeichert" ohne den Nachsatz liest sich
    // wie „alles weg" — und genau dann laedt jemand die Seite neu.
    expect(NETZ_TEXT_CHECK).toBe(
      "Keine Verbindung. Der Check wurde nicht gespeichert — nichts ist verloren, " +
      "bitte erneut auf Abschließen tippen.",
    );
  });

  it("sind nicht derselbe String", () => {
    expect(NETZ_TEXT_BUCHUNG).not.toBe(NETZ_TEXT_CHECK);
  });
});

describe("darfErneuern — §7.4.4, und warum `gesperrt` KEIN Feld bekommt", () => {
  it("nur `sitzung` darf erneuern", () => {
    expect(darfErneuern("sitzung")).toBe(true);
  });

  it("`gesperrt` darf NICHT — ein erneutes Einloesen desselben Codes scheitert genauso", () => {
    // Ein Feld anzubieten, das nicht helfen kann, ist schlimmer als keins.
    expect(darfErneuern("gesperrt")).toBe(false);
  });

  it("`leer` und `netz` duerfen nicht — beide haben nichts mit der Sitzung zu tun", () => {
    expect(darfErneuern("leer")).toBe(false);
    expect(darfErneuern("netz")).toBe(false);
  });

  it("`eingabe` darf NICHT — eine unvollstaendige Nutzlast wird durch Erneuern nicht vollstaendig (B4)", () => {
    expect(darfErneuern("eingabe")).toBe(false);
  });
});

describe("HelferErgebnis — die Form, nicht der Inhalt", () => {
  it("traegt im Erfolgsfall `wert` und KEINEN Text", () => {
    const e: HelferErgebnis<{ gebucht: number }> = { ok: true, wert: { gebucht: 3 } };
    expect(e.ok && e.wert.gebucht).toBe(3);
    expect("text" in e).toBe(false);
  });

  it("traegt im Fehlerfall Grund UND Text — nie nur den Grund", () => {
    // Der Grund steuert die Anzeige (Erneuerungsfeld ja/nein), der Text ist das,
    // was die Person liest. Ein Ergebnis mit Grund und ohne Text zwaenge jede
    // Insel, die Tabelle aus §7.3 ein zweites Mal zu fuehren.
    const e: HelferErgebnis<null> = { ok: false, grund: "gesperrt", text: RIEGEL_TEXTE.gesperrt };
    expect(e.ok).toBe(false);
    expect(!e.ok && e.text.length).toBeGreaterThan(0);
  });
});

describe("Bauform", () => {
  it("traegt KEIN \"use client\" — sie exportiert WERTE fuer Server Components (Falle 6)", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/"use client"/);
  });

  it("traegt den Kommentar, der die Erzeugerstelle von `netz` benennt", () => {
    // Ohne ihn sucht der naechste Leser sie im Server und findet sie nie.
    // [\s\S]* statt ".*" mit "s"-Flag: das Projekt-Target ist ES2017, das
    // dotAll-Flag ("s") braucht ES2018+ und liesse `pnpm typecheck` rot
    // zurueck (TS1501) — semantisch identisch, ueber Zeilenumbrueche hinweg.
    expect(readFileSync(QUELLE, "utf8")).toMatch(/netz[\s\S]*nie serverseitig|nie serverseitig[\s\S]*netz/i);
  });
});
