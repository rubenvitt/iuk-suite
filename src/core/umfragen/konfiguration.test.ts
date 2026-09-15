import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  UMFRAGEN_APP_URL_ENV,
  UMFRAGEN_WORKSPACE_ENV,
  _warnsperreZuruecksetzen,
  umfragenKonfiguration,
} from "@/core/umfragen/konfiguration";

/**
 * Die Vorgabe ist AUS, und das ist der wichtigste Fall in dieser Datei: ohne
 * Einrichtung verhält sich die Suite wie vor der Einbindung — kein Skript, kein
 * Aufruf an einen fremden Host, nichts.
 */
describe("umfragenKonfiguration", () => {
  const still = () => {};

  /*
   * ⚠️ OHNE DIESE ZEILE PRÜFEN SICH DIE WARNFÄLLE GEGENSEITIG WEG. Die Sperre
   * ist modulweit und lebt über den ganzen Lauf — der erste Fall, der warnt,
   * ließe jeden folgenden „keine Warnung" messen, und zwar in der Reihenfolge,
   * in der Vitest die Fälle abarbeitet. Grün wäre das Ergebnis trotzdem.
   */
  beforeEach(_warnsperreZuruecksetzen);

  it("ist ohne beide Werte aus — wortlos, das ist der Normalfall", () => {
    const warnen = vi.fn();
    expect(umfragenKonfiguration({}, warnen)).toBeNull();
    expect(warnen).not.toHaveBeenCalled();
  });

  it("behandelt leere Zeichenketten wie nicht gesetzt (so schaltet E2E ab)", () => {
    const warnen = vi.fn();
    const env = { [UMFRAGEN_APP_URL_ENV]: "", [UMFRAGEN_WORKSPACE_ENV]: "" };
    expect(umfragenKonfiguration(env, warnen)).toBeNull();
    expect(warnen).not.toHaveBeenCalled();
  });

  it("liefert beide Werte, wenn beide stehen", () => {
    const konfiguration = umfragenKonfiguration(
      {
        [UMFRAGEN_APP_URL_ENV]: "https://bricks.iuk-ue.de",
        [UMFRAGEN_WORKSPACE_ENV]: "cmu2pm1dt000101ostjuq1jrp",
      },
      still,
    );
    expect(konfiguration).toEqual({
      appUrl: "https://bricks.iuk-ue.de",
      workspaceId: "cmu2pm1dt000101ostjuq1jrp",
    });
  });

  it("schneidet den Schrägstrich am Ende ab — sonst entstünde `…de//js/…`", () => {
    const konfiguration = umfragenKonfiguration(
      {
        [UMFRAGEN_APP_URL_ENV]: "https://bricks.iuk-ue.de/",
        [UMFRAGEN_WORKSPACE_ENV]: "ws1",
      },
      still,
    );
    expect(konfiguration?.appUrl).toBe("https://bricks.iuk-ue.de");
  });

  /**
   * Halb eingerichtet ist ein Tippfehler, kein Zustand. Er bleibt aus — aber
   * nicht still: wer die Einbindung einschalten wollte, soll im Serverlog
   * sehen, warum sie es nicht tat.
   */
  it("warnt, wenn nur einer der beiden Werte steht", () => {
    for (const nur of [UMFRAGEN_APP_URL_ENV, UMFRAGEN_WORKSPACE_ENV]) {
      // Je Durchlauf: die Sperre ist modulweit, der zweite Durchlauf sähe sonst
      // den Stand des ersten.
      _warnsperreZuruecksetzen();
      const warnen = vi.fn();
      const wert = nur === UMFRAGEN_APP_URL_ENV ? "https://bricks.iuk-ue.de" : "ws1";
      expect(umfragenKonfiguration({ [nur]: wert }, warnen)).toBeNull();
      expect(warnen).toHaveBeenCalledOnce();
    }
  });

  it("warnt und bleibt aus, wenn die Adresse kein http(s) ist", () => {
    for (const adresse of ["bricks.iuk-ue.de", "//bricks.iuk-ue.de", "javascript:alert(1)"]) {
      _warnsperreZuruecksetzen();
      const warnen = vi.fn();
      const konfiguration = umfragenKonfiguration(
        { [UMFRAGEN_APP_URL_ENV]: adresse, [UMFRAGEN_WORKSPACE_ENV]: "ws1" },
        warnen,
      );
      expect(konfiguration, adresse).toBeNull();
      expect(warnen, adresse).toHaveBeenCalledOnce();
    }
  });

  /**
   * ⚠️ DER FALL, DEN DIE ÜBRIGEN NICHT SEHEN KÖNNEN. `FullShell` rendert je
   * Anfrage, ruft diese Funktion also bei JEDEM Aufruf einer Arbeitsfläche
   * erneut. Ein dauerhafter Tippfehler in der `.env` schriebe ohne die Sperre
   * eine Logzeile pro Seitenaufruf statt der einen, die der Kommentar oben
   * zusagt — und ersäufte damit genau das Log, das er informieren soll.
   */
  it("warnt nur EINMAL, auch wenn jede Anfrage erneut fragt", () => {
    const warnen = vi.fn();
    const env = { [UMFRAGEN_APP_URL_ENV]: "kaputt", [UMFRAGEN_WORKSPACE_ENV]: "ws1" };
    for (let i = 0; i < 25; i++) {
      expect(umfragenKonfiguration(env, warnen)).toBeNull();
    }
    expect(warnen).toHaveBeenCalledOnce();
  });
});
