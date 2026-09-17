import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { HelferZugang } from "./helferZugang";
import { VOLLE_REICHWEITE } from "./helferBereich";
import {
  journalQuelle,
  sitzungsEtikett,
  zugangsAkteur,
  zugangsKennung,
} from "./zugangHerkunft";

/**
 * DRK-305 — die vier Antworten, die sich mit der zweiten Herkunft verdoppelt
 * haben.
 *
 * Alle vier sind reine Funktionen und werden hier OHNE Rendern und OHNE
 * Datenbank geprüft. Das ist kein Sparprogramm: drei von ihnen entscheiden
 * über den Inhalt append-only geschriebener Zeilen, und ein Test, der dafür
 * erst eine Seite aufbauen müsste, prüft sie in der Praxis nur in dem einen
 * Fall, den die Seite gerade hergibt.
 */

const TOKEN: HelferZugang = {
  herkunft: "token",
  tokenId: "tk1",
  code: "482-137",
  label: "RTW 1 Kärtchen",
  laeuftAb: new Date("2026-09-15T18:00:00.000Z"),
  fahrzeugBindung: "fz-rtw1", reichweite: VOLLE_REICHWEITE,
};

const KONTO: HelferZugang = {
  herkunft: "konto",
  sub: "pocket-id-sub-42",
  name: "A. Verwaltung",
  laeuftAb: null,
  fahrzeugBindung: null, reichweite: VOLLE_REICHWEITE,
};

describe("zugangsKennung — die Bindung, nicht die Anzeige", () => {
  it("Kärtchen: die ZEILEN-Id, nicht der Code", () => {
    // Der Code wandert ins Journal, die Zeilen-Id in die Bindung. Wer sie
    // vertauscht, bindet das Ziel-Cookie an ein Secret, das die Verwaltung
    // jederzeit neu vergeben kann.
    expect(zugangsKennung(TOKEN)).toBe("tk1");
  });

  it("Konto: der OIDC-`sub`", () => {
    expect(zugangsKennung(KONTO)).toBe("pocket-id-sub-42");
  });

  it("liefert NIE etwas Leeres — sonst gälte eine Wahl für alle", () => {
    // `zielWert` setzt die Kennung vor einen `|`-Trenner. Eine leere Kennung
    // machte die Wahl aller Personen ununterscheidbar, und der Fehler wäre
    // still: die Buchung gelänge, nur auf das falsche Fahrzeug.
    for (const z of [TOKEN, KONTO]) expect(zugangsKennung(z).length).toBeGreaterThan(0);
  });
});

describe("journalQuelle — was in der append-only-Zeile steht", () => {
  it("Kärtchen: quelleTyp token mit dem CODE", () => {
    expect(journalQuelle(TOKEN)).toEqual({ quelleTyp: "token", quelleId: "482-137" });
  });

  it("Konto: quelleTyp oidc mit dem SUB, nicht mit dem Namen", () => {
    /*
     * Der Name steht in `users` und wird zur ANZEIGE nachgeschlagen
     * (`_db/quelle.ts`). Stünde er im Nachweis, änderte sich eine historische
     * Zeile mit jeder Namensänderung — und die Tabelle ist append-only.
     */
    expect(journalQuelle(KONTO)).toEqual({ quelleTyp: "oidc", quelleId: "pocket-id-sub-42" });
  });

  it("kennt genau die zwei Werte, die die Spalte führt", () => {
    // `system` ist der dritte Wert der Spalte und entsteht hier NIE: eine
    // Handlung aus dem Helfer-Ast hat immer einen Menschen davor.
    for (const z of [TOKEN, KONTO]) {
      expect(["token", "oidc"]).toContain(journalQuelle(z).quelleTyp);
    }
  });
});

describe("zugangsAkteur — das Zugriffsprotokoll", () => {
  it("Kärtchen: ein ZUGANG, ausdrücklich keine Person", () => {
    expect(zugangsAkteur(TOKEN)).toEqual({
      kind: "access",
      id: "lagerbuch:token:tk1",
      name: "Gemeinsamer Zugangscode",
    });
  });

  it("Konto: eine PERSON mit Namen", () => {
    expect(zugangsAkteur(KONTO)).toEqual({
      kind: "user",
      id: "pocket-id-sub-42",
      name: "A. Verwaltung",
    });
  });

  it("ohne Namen bleibt das Feld WEG statt leer dazustehen", () => {
    expect(zugangsAkteur({ ...KONTO, name: null })).toEqual({
      kind: "user",
      id: "pocket-id-sub-42",
    });
  });

  it("kappt einen überlangen Namen auf 256 Zeichen", () => {
    // Dieselbe Grenze wie `auditActor` in `core/audit/server.ts`. Ohne sie
    // wüchse eine Protokollzeile an einem Anzeigenamen, den niemand begrenzt.
    const akteur = zugangsAkteur({ ...KONTO, name: "x".repeat(400) });
    expect(akteur.kind === "user" && akteur.name?.length).toBe(256);
  });
});

describe("sitzungsEtikett — der Satz im Rahmenkopf", () => {
  it("Kärtchen: Code UND Label", () => {
    expect(sitzungsEtikett(TOKEN)).toBe("Zugang: Token 482-137 · RTW 1 Kärtchen");
  });

  it("Konto: der Name, und NIE die Kennung", () => {
    expect(sitzungsEtikett(KONTO)).toBe("Angemeldet: A. Verwaltung");
    expect(sitzungsEtikett(KONTO)).not.toContain("pocket-id-sub-42");
  });

  it("ein Name aus Leerzeichen ist kein Name", () => {
    // Dieselbe Regel wie in `_lib/konto.ts` und `_db/quelle.ts`. Ohne den
    // `trim()` stünde im Kopf „Angemeldet:" und dahinter nichts.
    expect(sitzungsEtikett({ ...KONTO, name: "   " })).toBe("Angemeldet: Lagerbuch-Verwaltung");
    expect(sitzungsEtikett({ ...KONTO, name: null })).toBe("Angemeldet: Lagerbuch-Verwaltung");
  });
});

describe("Bauform", () => {
  it('trägt kein "use client" (Falle 6)', () => {
    /*
     * Drei Server Components lesen `sitzungsEtikett` als WERT. Aus einem als
     * Client markierten Modul bekämen sie eine Client-Referenz statt des Wertes
     * — HTTP 500 für die ganze Seite, und weder `pnpm build` noch Vitest sähen
     * es (dort ist die Direktive ein wirkungsloser String).
     */
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/zugangHerkunft.ts", "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});
