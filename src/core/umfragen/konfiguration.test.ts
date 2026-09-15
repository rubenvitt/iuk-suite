import { describe, it, expect, vi } from "vitest";

import {
  UMFRAGEN_APP_URL_ENV,
  UMFRAGEN_WORKSPACE_ENV,
  umfragenKonfiguration,
} from "@/core/umfragen/konfiguration";

/**
 * Die Vorgabe ist AUS, und das ist der wichtigste Fall in dieser Datei: ohne
 * Einrichtung verhält sich die Suite wie vor der Einbindung — kein Skript, kein
 * Aufruf an einen fremden Host, nichts.
 */
describe("umfragenKonfiguration", () => {
  const still = () => {};

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
      const warnen = vi.fn();
      const wert = nur === UMFRAGEN_APP_URL_ENV ? "https://bricks.iuk-ue.de" : "ws1";
      expect(umfragenKonfiguration({ [nur]: wert }, warnen)).toBeNull();
      expect(warnen).toHaveBeenCalledOnce();
    }
  });

  it("warnt und bleibt aus, wenn die Adresse kein http(s) ist", () => {
    for (const adresse of ["bricks.iuk-ue.de", "//bricks.iuk-ue.de", "javascript:alert(1)"]) {
      const warnen = vi.fn();
      const konfiguration = umfragenKonfiguration(
        { [UMFRAGEN_APP_URL_ENV]: adresse, [UMFRAGEN_WORKSPACE_ENV]: "ws1" },
        warnen,
      );
      expect(konfiguration, adresse).toBeNull();
      expect(warnen, adresse).toHaveBeenCalledOnce();
    }
  });
});
