import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import {
  bzGeraete, checks, fahrzeugTemplates, geraete, inventuren, lagerorte, o2Flaschen,
} from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { bzGeraetDetail } from "./bz";
import { checkDetail } from "./checks";
import { templateDetail } from "./fahrzeuge";
import { geraetById } from "./geraete";
import { inventurLauf } from "./inventurVerlauf";
import { o2FlascheDetail } from "./o2";
import { detailVorhanden, type Detailroute } from "./vorhanden";

/**
 * DRK-480 — das Schutz-Layout und die Seite darunter muessen DIESELBE Antwort
 * geben. Weicht das Layout nach oben ab, kommt der 404 wieder als 200; weicht
 * es nach unten ab, verschwindet eine Seite, die es gibt. Deshalb je Route der
 * Lesepfad, an dem die Seite ihr `notFound()` festmacht, als Gegenprobe.
 */

const NOW = new Date("2026-09-27T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb();
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true }).run();
  t.db.insert(geraete).values(
    { id: "g-1", typ: "objekt", name: "Spineboard", lagerortId: "rtw-1", aktiv: true, createdAt: NOW }).run();
  t.db.insert(bzGeraete).values(
    { id: "bz-1", name: "Accu-Chek", lagerortId: "rtw-1", aktiv: true, createdAt: NOW }).run();
  t.db.insert(o2Flaschen).values(
    { id: "o2-1", name: "O2 200", lagerortId: "rtw-1", nennfuelldruckBar: 200, aktiv: true, createdAt: NOW }).run();
  t.db.insert(fahrzeugTemplates).values(
    { id: "tpl-1", name: "RTW-Vorlage", aktiv: true, createdAt: NOW }).run();
  t.db.insert(checks).values(
    { id: "chk-1", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: NOW, completedAt: NOW, ergebnis: "{}" }).run();
  t.db.insert(inventuren).values(
    { id: "inv-1", ts: NOW, quelleTyp: "system", quelleId: "test", kommentar: "Jahresinventur" }).run();
});
afterEach(() => t.schliessen());

const GEGENPROBE: [Detailroute, string, (id: string) => unknown][] = [
  ["bz", "bz-1", (id) => bzGeraetDetail(t.db, id, NOW)],
  ["check", "chk-1", (id) => checkDetail(t.db, id, NOW)],
  ["geraet", "g-1", (id) => geraetById(t.db, id, NOW)],
  ["inventurlauf", "inv-1", (id) => inventurLauf(t.db, id)],
  ["sauerstoff", "o2-1", (id) => o2FlascheDetail(t.db, id)],
  ["vorlage", "tpl-1", (id) => templateDetail(t.db, id)],
];

describe("detailVorhanden — dieselbe Antwort wie der Lesepfad der Seite", () => {
  it.each(GEGENPROBE)("%s: bekannt ja, unbekannt nein", (route, bekannt, lesepfad) => {
    expect(lesepfad(bekannt)).not.toBeNull();
    expect(detailVorhanden(t.db, route, bekannt)).toBe(true);

    expect(lesepfad("gibt-es-nicht")).toBeNull();
    expect(detailVorhanden(t.db, route, "gibt-es-nicht")).toBe(false);
  });

  /**
   * ⚠️ DER EINZIGE FALL MIT MEHR ALS „GIBT ES": das Fahrzeugblatt lehnt auch
   * eine bekannte Lager-ID ab (`fahrzeuge/[id]/page.tsx`, `fahrzeugInhalt`).
   * Ohne die Typpruefung liesse das Layout das Handlager durch — und dessen
   * 404 kaeme wieder als 200.
   */
  it("fahrzeug: nur ein Lagerort vom Typ Fahrzeug", () => {
    expect(detailVorhanden(t.db, "fahrzeug", "rtw-1")).toBe(true);
    expect(detailVorhanden(t.db, "fahrzeug", HANDLAGER_ID)).toBe(false);
    expect(detailVorhanden(t.db, "fahrzeug", "gibt-es-nicht")).toBe(false);
  });

  it("verwechselt die Tabellen nicht", () => {
    // Eine ID aus der falschen Tabelle ist fuer die Route unbekannt.
    expect(detailVorhanden(t.db, "geraet", "bz-1")).toBe(false);
    expect(detailVorhanden(t.db, "bz", "g-1")).toBe(false);
    expect(detailVorhanden(t.db, "sauerstoff", "g-1")).toBe(false);
  });
});
