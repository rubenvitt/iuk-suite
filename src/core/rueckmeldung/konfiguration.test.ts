import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  RUECKMELDUNG_URL_ENV,
  _warnsperreZuruecksetzen,
  rueckmeldungUrl,
} from "@/core/rueckmeldung/konfiguration";

/**
 * Die Vorgabe ist AUS, und das ist der wichtigste Fall in dieser Datei: ohne
 * Einrichtung verhält sich die Suite wie vor der Einbindung — kein
 * Menüeintrag, keine Kachel, kein Knopf, nichts.
 */
describe("rueckmeldungUrl", () => {
  const still = () => {};

  /*
   * ⚠️ OHNE DIESE ZEILE PRÜFEN SICH DIE WARNFÄLLE GEGENSEITIG WEG. Die Sperre
   * ist modulweit und lebt über den ganzen Lauf — der erste Fall, der warnt,
   * ließe jeden folgenden „keine Warnung" messen, und zwar in der Reihenfolge,
   * in der Vitest die Fälle abarbeitet. Grün wäre das Ergebnis trotzdem.
   */
  beforeEach(_warnsperreZuruecksetzen);

  it("ist ohne Wert aus — wortlos, das ist der Normalfall", () => {
    const warnen = vi.fn();
    expect(rueckmeldungUrl({}, warnen)).toBeNull();
    expect(warnen).not.toHaveBeenCalled();
  });

  it("behandelt eine leere Zeichenkette wie nicht gesetzt (so schaltet E2E ab)", () => {
    const warnen = vi.fn();
    expect(rueckmeldungUrl({ [RUECKMELDUNG_URL_ENV]: "" }, warnen)).toBeNull();
    expect(rueckmeldungUrl({ [RUECKMELDUNG_URL_ENV]: "   " }, warnen)).toBeNull();
    expect(warnen).not.toHaveBeenCalled();
  });

  it("liefert die Adresse, wenn sie steht", () => {
    const url = "https://forms.clickup.com/9015920204/f/8cp81jc-7355/VB45T1RIN6RKY0MSPM";
    expect(rueckmeldungUrl({ [RUECKMELDUNG_URL_ENV]: url }, still)).toBe(url);
  });

  it("nimmt Leerraum um den Wert herum weg", () => {
    // Eine `.env`-Zeile mit einem Leerzeichen hinter dem `=` ist der
    // wahrscheinlichste Tippfehler überhaupt, und er wäre ohne `trim()` ein
    // `href`, der mit einem Leerzeichen beginnt.
    const url = "https://forms.example.test/f/abc";
    expect(rueckmeldungUrl({ [RUECKMELDUNG_URL_ENV]: `  ${url}  ` }, still)).toBe(url);
  });

  /**
   * ⚠️ DER SCHRÄGSTRICH AM ENDE BLEIBT STEHEN, anders als bei der abgelösten
   * Formbricks-Adresse. Dort wurde `${appUrl}/js/…` zusammengesetzt, ein
   * doppelter Schrägstrich wäre also entstanden. Hier ist die Adresse das
   * ZIEL und wird nirgends verlängert — sie abzuschneiden hieße, an einer
   * fremden URL herumzuschreiben, ohne dafür einen Grund zu haben.
   */
  it("lässt die Adresse sonst unverändert — auch mit Schrägstrich und Query", () => {
    for (const url of [
      "https://forms.example.test/f/abc/",
      "https://forms.example.test/f/abc?quelle=suite",
      "https://forms.example.test/f/abc#feld",
    ]) {
      expect(rueckmeldungUrl({ [RUECKMELDUNG_URL_ENV]: url }, still), url).toBe(url);
    }
  });

  /**
   * ⚠️ `javascript:` IST HIER NICHT NUR UNBRAUCHBAR, SONDERN DIE EIGENTLICHE
   * GEFAHR. Der Wert landet als `href` eines Links; ein `javascript:`-Ziel ist
   * dort eine Skriptausführung im Ursprung der Suite. Dass die Variable aus der
   * `.env` des Betreibers kommt und nicht von einem Anwender, macht die Prüfung
   * nicht überflüssig — sie macht sie nur billig.
   */
  it("warnt und bleibt aus, wenn die Adresse kein http(s) ist", () => {
    for (const adresse of [
      "forms.clickup.com/f/abc",
      "//forms.clickup.com/f/abc",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "/f/abc",
    ]) {
      _warnsperreZuruecksetzen();
      const warnen = vi.fn();
      expect(rueckmeldungUrl({ [RUECKMELDUNG_URL_ENV]: adresse }, warnen), adresse).toBeNull();
      expect(warnen, adresse).toHaveBeenCalledOnce();
    }
  });

  /**
   * ⚠️ DER FALL, DEN DIE ÜBRIGEN NICHT SEHEN KÖNNEN. `FullShell` und
   * `SuiteHeader` rendern je Anfrage, rufen diese Funktion also bei JEDEM
   * Aufruf einer Arbeitsfläche erneut — und zwar zweimal. Ein dauerhafter
   * Tippfehler in der `.env` schriebe ohne die Sperre zwei Logzeilen pro
   * Seitenaufruf statt der einen, die der Kommentar zusagt, und ersäufte damit
   * genau das Log, das er informieren soll.
   */
  it("warnt nur EINMAL, auch wenn jede Anfrage erneut fragt", () => {
    const warnen = vi.fn();
    const env = { [RUECKMELDUNG_URL_ENV]: "kaputt" };
    for (let i = 0; i < 25; i++) {
      expect(rueckmeldungUrl(env, warnen)).toBeNull();
    }
    expect(warnen).toHaveBeenCalledOnce();
  });

  /**
   * ⚠️ DIE NAMENSKOLLISION, DIE DIESE VARIABLE VERMEIDET — als Zusicherung und
   * nicht nur als Kommentar. `SUITE_HOST_FEEDBACK`,
   * `SUITE_ACCESS_GROUP_FEEDBACK` und `SUITE_ADMIN_GROUP_FEEDBACK` gehören dem
   * MODUL `feedback`. Hieße diese hier `SUITE_FEEDBACK_URL`, stünde sie in der
   * `.env` zwischen drei Variablen mit demselben Wort und einer ganz anderen
   * Bedeutung. Der Test hält den Namen fest, damit ein späterer „Vereinheitlichen"
   * genau hier anhält.
   */
  it("heißt bewusst nicht wie die drei Variablen des Moduls `feedback`", () => {
    expect(RUECKMELDUNG_URL_ENV).toBe("SUITE_RUECKMELDUNG_URL");
    expect(RUECKMELDUNG_URL_ENV).not.toContain("FEEDBACK");
  });
});
