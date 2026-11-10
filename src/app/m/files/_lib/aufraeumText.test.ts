import { describe, expect, it } from "vitest";

import type { Aufraeumzahlen } from "./aufraeumen";
import { aufraeumSatz } from "./aufraeumText";

const NULL: Aufraeumzahlen = {
  sharesGeloescht: 0,
  dateienGeloescht: 0,
  bytesGeloescht: 0,
  logzeilenGeloescht: 0,
  inboxGeloescht: 0,
  verwaisteBlobsGemeldet: 0,
};

describe("aufraeumSatz (IDA-388)", () => {
  it("nennt nichts, wenn nichts zu löschen ist — auch nicht die nur gemeldeten Waisen", () => {
    expect(aufraeumSatz({ ...NULL, verwaisteBlobsGemeldet: 3 })).toBeNull();
  });

  it("nennt Freigaben, Dateien mit Größe, Abgaben und Protokolleinträge", () => {
    expect(
      aufraeumSatz({
        ...NULL,
        sharesGeloescht: 2,
        dateienGeloescht: 5,
        bytesGeloescht: 14 * 1024 * 1024,
        inboxGeloescht: 1,
        logzeilenGeloescht: 7,
      }),
    ).toBe(
      "Löscht 2 abgelaufene Freigaben, 5 Dateien (14,0 MiB), 1 Abgabe im Posteingang " +
        "und 7 Einträge im Zugriffsprotokoll.",
    );
  });

  it("lässt Nullen weg und spricht im Singular", () => {
    expect(aufraeumSatz({ ...NULL, sharesGeloescht: 1, dateienGeloescht: 1, bytesGeloescht: 512 })).toBe(
      "Löscht 1 abgelaufene Freigabe und 1 Datei (512 Byte).",
    );
  });
});
