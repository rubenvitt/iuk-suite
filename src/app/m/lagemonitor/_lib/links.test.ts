import { describe, expect, it } from "vitest";
import { link } from "../_db/schema";
import { alsVertrag } from "./konfiguration";
import { alsPublicLinks, legeLinkAn, linkAdresse, listeLinks, widerrufeLink } from "./links";
import { onlineAdresse } from "./online";
import { hashVon } from "./schluessel";
import { testDb } from "./testDb";

describe("Links für den Online-Lagemonitor", () => {
  it("speichert nur den Hash und schickt ihn dem Monitor", () => {
    const db = testDb();
    const { id, schluessel } = legeLinkAn(db, "Rechner Wache", "Ruben", new Date("2026-10-28T13:00:00Z"));
    expect(schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(db.select().from(link).all())).not.toContain(schluessel);
    expect(listeLinks(db)).toEqual([{ id, bezeichnung: "Rechner Wache", angelegtAm: "2026-10-28T13:00:00.000Z", angelegtVon: "Ruben" }]);
    expect(alsVertrag(db).publicLinks).toEqual([{ id, label: "Rechner Wache", hash: hashVon(schluessel) }]);
    expect(JSON.stringify(alsVertrag(db))).not.toContain(schluessel);
  });

  it("ein widerrufener Link fehlt in der Konfiguration", () => {
    const db = testDb();
    const { id } = legeLinkAn(db, "Rechner Wache", "Ruben");
    expect(widerrufeLink(db, id)).toBe(true);
    expect(widerrufeLink(db, id)).toBe(false);
    expect(alsPublicLinks(db)).toEqual([]);
  });

  it("der Schlüssel steht hinter # und erreicht so kein Server-Log", () => {
    expect(linkAdresse("https://lagemonitor.iuk-ue.de/monitor/", "abc")).toBe("https://lagemonitor.iuk-ue.de/monitor/auth/link#abc");
  });

  it("liest die Adresse des Online-Monitors aus der Umgebung", () => {
    expect(onlineAdresse({})).toBeNull();
    expect(onlineAdresse({ LAGEMONITOR_ONLINE_URL: "  " })).toBeNull();
    expect(onlineAdresse({ LAGEMONITOR_ONLINE_URL: "ftp://x" })).toBeNull();
    expect(onlineAdresse({ LAGEMONITOR_ONLINE_URL: "https://lagemonitor.iuk-ue.de/monitor/" })).toBe("https://lagemonitor.iuk-ue.de/monitor");
  });
});
