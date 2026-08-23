// src/app/m/radio/_actions/ausleihe.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, isNull } from "drizzle-orm";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";
import { devices, loans, zugangscodes } from "../_db/schema";
import { AUSWAHL_PARAMETER } from "../_lib/auswahl";
import { ausleihText, rueckgabeText, ZUSTANDSNOTIZ_MAX } from "../_lib/meldungen";
import type { AusleihZugang, SperrGrund } from "../_lib/ausleihZugang";

/**
 * DIE VIER AUSLEIH-ACTIONS (Spec 1 §4.3/§4.4,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3417-3592`; Testauftrag §4.12,
 * Spec:4033-4038).
 *
 * ⛔ WARUM DIESE DATEI EIN VERHALTENSTEST IST UND KEIN ZWEITER QUELLTEXT-SCAN:
 * `_actions/guards.test.ts` deckt die BAUFORM bereits ab (Riegel vorhanden, erste Anweisung,
 * Ergebnis gebunden und gelesen, `formData` erst danach). Was dort strukturell NICHT
 * beweisbar ist, ist die WIRKUNG — dass bei einer Absage wirklich nichts geschrieben wird,
 * dass der `grund` unveraendert am Formular ankommt und dass die Transaktion alles oder
 * nichts bucht. ⬜ A-L9 (`.superpowers/sdd/planteil3/progress.md:45-55`) haelt fest, dass
 * die vier Zugangsdateien NULL Verhaltensdeckung tragen; diese Datei baut sie fuer die
 * Ausleih-Actions, nicht fuer die Riegel selbst.
 *
 * ⚠️ VIER NAEHTE WERDEN GEMOCKT, UND JEDE HAT EINEN GRUND:
 *   `../_lib/ausleihZugang` — der Riegel wird GESTEUERT, nicht nachgebaut. Seine eigene
 *                             Logik hat ihren Test in `_lib/ausleihZugang.test.ts`; hier ist
 *                             er die Eingangsbedingung. Der Vollmock haelt zugleich
 *                             `next/headers` und `@/core/auth` aus dieser Datei heraus.
 *   `../_db/client`         — `getDb()` liefert die DB DIESES Tests. ⛔ `getModuleDb()` wird
 *                             in Tests NICHT benutzt: sein Cache ist per MODULSCHLUESSEL
 *                             gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`).
 *   `next/cache`            — `revalidatePath` braucht einen Anfragekontext.
 *   `next/navigation`       — `redirect()` arbeitet ueber einen geworfenen Sentinel; hier
 *                             wird der Aufruf SICHTBAR gemacht statt verschluckt (Vorbild
 *                             `_lib/ausleihZugang.test.ts:48-53`).
 *
 * ⛔ `_db/leihen.ts` WIRD NICHT GEMOCKT. Nur so ist „bucht KEIN Geraet, wenn eines
 * inzwischen vergeben ist" eine Messung an der echten Transaktion und nicht an einer
 * Attrappe, die das Zurueckrollen bloss behauptet.
 */
const riegel = vi.fn<(db: unknown) => Promise<RiegelErgebnis>>();
const revalidiert: string[] = [];
const umgeleitet: string[] = [];

type RiegelErgebnis = { ok: true; zugang: AusleihZugang } | { ok: false; grund: SperrGrund };

vi.mock("../_lib/ausleihZugang", () => ({
  requireAusleihSchreibend: (db: unknown) => riegel(db),
}));
vi.mock("../_db/client", () => ({ getDb: () => db }));
vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => {
    revalidiert.push(pfad);
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    umgeleitet.push(ziel);
    throw new Error(`REDIRECT:${ziel}`);
  },
}));

import {
  ausleiheAnlegen,
  rueckgabeBuchen,
  entleiherVorschlaege,
  listeAktualisieren,
} from "./ausleihe";

/**
 * ⚠️ DIE DREI FELDNAMEN STEHEN HIER EIN ZWEITES MAL, UND DAS IST BENANNT STATT STILL:
 * `_actions/ausleihe.ts` kann sie NICHT als Konstante exportieren — `EXPORT_FORM`
 * (`_actions/guards.test.ts:122`) laesst unter `_actions/` ausschliesslich
 * `export [async] function`, `export type` und `export interface` zu, und der Grund dafuer
 * ist gemessen (`guards.test.ts:106-114`). `geraete` kommt deshalb ueber
 * `AUSWAHL_PARAMETER` (`_lib/auswahl.ts:61`) und nicht als viertes Literal.
 *
 * `ausleiheId` und `zustandsnotiz` stehen woertlich in Spec:3572; `entleiher` ist eine
 * Bau-Entscheidung dieser Aufgabe (er traegt den Namen des Feldes in `AusleihEingabe`,
 * `_db/leihen.ts:162`).
 */
const FELD_ENTLEIHER = "entleiher";
const FELD_AUSLEIHE_ID = "ausleiheId";
const FELD_ZUSTANDSNOTIZ = "zustandsnotiz";

const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const AUSLEIHE_QUELLE = "src/app/m/radio/_actions/ausleihe.ts";

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-ausleihe-action-"));
  sqlite = openModuleDatabase(join(tmp, "radio.db"));
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });

  /*
   * ⛔ DIE CODEZEILE GEHOERT ZUR GRUNDLINIE, NICHT ZU EINEM EINZELFALL. `loans.zugangscode_id`
   * traegt einen FREMDSCHLUESSEL auf `zugangscodes(id)` (`_db/schema.ts:230`), und
   * `openModuleDatabase` setzt `foreign_keys = ON` (`src/core/db/index.ts:19`). Ein Zugang
   * ueber den Code OHNE die zugehoerige Zeile gibt es im Betrieb nicht — `befund` schlaegt sie
   * bei JEDEM Aufruf nach (`_lib/ausleihZugang.ts:180-181`). ⚠️ Gemessen am 2026-08-23: ohne
   * sie scheitert jede Ausleihe am FK und `bucheAusleihe` faltet den Fehler auf `unbekannt`
   * (`_db/leihen.ts:559-570`) — der Fall waere rot mit einer Meldung, die auf die falsche
   * Ursache zeigt.
   */
  db.insert(zugangscodes)
    .values({
      id: "zc-1",
      code: "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW",
      bezeichnung: "Aufsteller Fahrzeughalle",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      createdBy: "sub-admin",
    })
    .run();

  // ⛔ JEDER FALL STARTET AUS DEMSELBEN ZUSTAND — sonst bestuende die Datei nur in ihrer
  // heutigen Reihenfolge.
  riegel.mockReset();
  riegel.mockResolvedValue(zugangUeberCode());
  revalidiert.length = 0;
  umgeleitet.length = 0;
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Der Code-Weg mit Herkunft — der Regelfall der anonymen Ausleihe (Spec:2159-2164). */
function zugangUeberCode(codeId = "zc-1"): RiegelErgebnis {
  return {
    ok: true,
    zugang: {
      weg: "code",
      codeId,
      bezeichnung: "Aufsteller Fahrzeughalle",
      laeuftAb: new Date("2026-06-14T19:12:00Z"),
    },
  };
}

/** Der Suite-Weg — dieselbe Flaeche, andere Herkunft (§3.6.3 Punkt 3). */
function zugangUeberSuite(): RiegelErgebnis {
  return { ok: true, zugang: { weg: "suite", sub: "sub-anna", name: "Anna Beispiel" } };
}

function geraet(id: string, issi: string, werte: Partial<typeof devices.$inferInsert> = {}) {
  db.insert(devices)
    .values({
      id,
      issi,
      rufname: `Ruf ${id}`,
      status: "Einsatzbereit",
      loanable: true,
      createdAt: new Date("2026-01-01T10:00:00Z"),
      updatedAt: new Date("2026-01-01T10:00:00Z"),
      ...werte,
    })
    .run();
}

function legeLeiheAn(geraeteId: string, entleiher: string, rufname: string) {
  const id = `leihe-${geraeteId}`;
  db.insert(loans)
    .values({
      id,
      deviceId: geraeteId,
      snapshotCallSign: rufname,
      borrowerName: entleiher,
      borrowedAt: new Date("2026-06-14T07:12:00Z"),
      zugangscodeId: null,
      createdAt: new Date("2026-06-14T07:12:00Z"),
      updatedAt: new Date("2026-06-14T07:12:00Z"),
    })
    .run();
  return id;
}

function formular(eintraege: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [name, wert] of Object.entries(eintraege)) fd.set(name, wert);
  return fd;
}

/**
 * Ein Formular, das JEDEN Lesezugriff meldet — die Messung fuer „vor dem Lesen von
 * formData" (§4.2.1, Spec:3405-3406). Ein Attrappen-Objekt genuegt: die Actions rufen
 * ausschliesslich `.get(...)`.
 */
function spionFormular(eintraege: Record<string, string>) {
  const gelesen = vi.fn((name: string) => eintraege[name] ?? null);
  return { fd: { get: gelesen } as unknown as FormData, gelesen };
}

const offeneLeihen = () => db.select().from(loans).where(isNull(loans.returnedAt)).all();

describe("radio-_actions/ausleihe: ausleiheAnlegen", () => {
  it("bucht vier Geraete in EINER Transaktion", async () => {
    /*
     * §4.3.2 (Spec:3435-3448): heute sind es N unabhaengige POSTs
     * (`ConfirmLoanButton.tsx:55-59`), kuenftig eine Drizzle-Transaktion.
     *
     * ⚠️ DIE TRANSAKTIONS-HAELFTE MISST DER NAECHSTE FALL. Hier steht die Erfolgsseite:
     * alle vier Zeilen liegen mit DEMSELBEN Entleiher, und die Zahl im Umleitungsziel ist
     * vier — ein Fluss, der drei bucht und die vierte verschluckt, faellt hier auf.
     */
    for (let i = 1; i <= 4; i++) geraet(`g-${i}`, `700000${i}`);

    await expect(
      ausleiheAnlegen(
        null,
        formular({ [AUSWAHL_PARAMETER]: "g-1,g-2,g-3,g-4", [FELD_ENTLEIHER]: "Anna Beispiel" }),
      ),
    ).rejects.toThrow("REDIRECT:/geraete?gebucht=4");

    const gebucht = offeneLeihen();
    expect(gebucht).toHaveLength(4);
    expect(gebucht.every((z) => z.borrowerName === "Anna Beispiel")).toBe(true);
    expect([...gebucht].map((z) => z.deviceId).sort()).toEqual(["g-1", "g-2", "g-3", "g-4"]);
  });

  it("bucht KEIN Geraet, wenn eines inzwischen vergeben ist, und nennt seinen Rufnamen", async () => {
    /*
     * ⛔ DER TRAGENDE FALL: alles oder nichts (§4.3.2) plus Regel 1 der Konfliktsprache
     * („der Rufname steht IM SATZ", Spec:3547). Ein `Promise.all` ueber Einzelbuchungen
     * liesse die ersten beiden stehen — typkorrekt, lint-sauber, und die Zusage
     * „Es wurde nichts gebucht." (`_lib/meldungen.ts:348`) waere gebrochen.
     */
    for (let i = 1; i <= 4; i++) geraet(`g-${i}`, `700000${i}`);
    legeLeiheAn("g-3", "Bea Beispiel", "Ruf g-3");

    const ergebnis = await ausleiheAnlegen(
      null,
      formular({ [AUSWAHL_PARAMETER]: "g-1,g-2,g-3,g-4", [FELD_ENTLEIHER]: "Anna Beispiel" }),
    );

    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) throw new Error("unerreicht");
    expect(ergebnis.grund).toBe("nicht-verfuegbar");
    expect(ergebnis.text).toContain("Ruf g-3");
    expect(ergebnis.text).toContain("Bea Beispiel");
    expect(ergebnis.betroffen).toEqual([{ rufname: "Ruf g-3", status: "ON_LOAN" }]);

    expect(offeneLeihen(), "es wurde etwas gebucht, obwohl der Vorgang gescheitert ist")
      .toHaveLength(1);
    expect(umgeleitet, "eine gescheiterte Ausleihe leitet nicht um").toEqual([]);
    expect(revalidiert, "eine gescheiterte Ausleihe entwertet keinen Cache").toEqual([]);
  });

  it("ruft den Zugangsriegel als erste Anweisung, vor dem Lesen von formData", async () => {
    /*
     * §4.2.1 (Spec:3405-3406). ⛔ DIE GEGENPROBE STEHT IM SELBEN FALL: ohne sie waere
     * „nie gelesen" auch dann gruen, wenn die Action `formData` UEBERHAUPT NICHT liest —
     * ein konstantes Gruen, genau die Fehlerform, gegen die dieses Repo vernarbt ist.
     */
    riegel.mockResolvedValue({ ok: false, grund: "sitzung" });
    const abgewiesen = spionFormular({
      [AUSWAHL_PARAMETER]: "g-1",
      [FELD_ENTLEIHER]: "Anna Beispiel",
    });

    await ausleiheAnlegen(null, abgewiesen.fd);

    expect(riegel).toHaveBeenCalledTimes(1);
    expect(abgewiesen.gelesen, "formData wurde VOR oder trotz der Absage gelesen")
      .not.toHaveBeenCalled();

    geraet("g-1", "7000001");
    riegel.mockResolvedValue(zugangUeberCode());
    const zugelassen = spionFormular({
      [AUSWAHL_PARAMETER]: "g-1",
      [FELD_ENTLEIHER]: "Anna Beispiel",
    });
    await expect(ausleiheAnlegen(null, zugelassen.fd)).rejects.toThrow("REDIRECT:");
    expect(zugelassen.gelesen, "die Action liest formData gar nicht — der Fall oben ist leer")
      .toHaveBeenCalled();
  });

  it("schreibt den Entleihernamen unveraendert, ohne Umschreiben", async () => {
    /*
     * Spec:3587-3592 und §4.12 Nr. 9 (Spec:4095): `sanitizeForDisplay` wandert NICHT mit
     * (`ReturnDialog.tsx:58`, `ConfirmLoanButton.tsx:52`). React escaped beim Rendern; eine
     * Bereinigung VOR dem Schreiben veraendert die gespeicherte Zeichenkette dauerhaft und
     * ist hier ein Datenschaden, kein Schutz. ⛔ Auch kein `trim()`.
     *
     * ⚠️ DER FIXTURE-NAME TRAEGT EINEN UMLAUT UND EIN `&`, und beides ist Absicht: `&` ist
     * das Zeichen, das jede HTML-Bereinigung anfasst, der Umlaut das, das eine
     * Normalisierung anfasst. Der Auftrag schreibt ihn woertlich vor
     * (`.superpowers/sdd/planteil3/briefs/A17.md`, Testtabelle); Hauspraezedenz fuer einen
     * Umlaut im FIXTURE-WERT: `_db/leihen.test.ts:456`.
     */
    geraet("g-1", "7000001");

    await expect(
      ausleiheAnlegen(
        null,
        formular({ [AUSWAHL_PARAMETER]: "g-1", [FELD_ENTLEIHER]: "  Müller & Sohn  " }),
      ),
    ).rejects.toThrow("REDIRECT:");

    expect(offeneLeihen()[0]?.borrowerName).toBe("  Müller & Sohn  ");
  });

  it("eine ueber den Code gebuchte Leihe traegt die Herkunft, eine ueber die Suite gebuchte nicht", async () => {
    /*
     * ⛔ AUFLAGE 9. Spec:2159-2164: die Spalte „ist NULL fuer alle importierten Alt-Leihen
     * und fuer jede Leihe ueber den Suite-Weg (3.5)" und ist „die HERKUNFT des Zugangs …
     * ueber sie loest die Anzeige `bezeichnung` auf". ⛔ OHNE DIESE EINE ZEILE IN DER ACTION
     * SCHREIBT NIEMAND DIE SPALTE — sie bliebe dauerhaft leer, und das Loeschverbot aus
     * §3.2.4 (Spec:2218-2220, „Beides oder nichts") verloere die Haelfte, die ihm Wirkung
     * gibt.
     *
     * ⚠️ DER FALL STEHT AUCH IN `_db/leihen.test.ts:650` — dort auf der Ebene, die SCHREIBT.
     * Hier steht er auf der Ebene, die den Wert AUS DEM ZUGANG HOLT; das ist die Haelfte,
     * die A15 nicht pruefen kann.
     */
    geraet("g-code", "7000001");
    geraet("g-suite", "7000002");

    await expect(
      ausleiheAnlegen(
        null,
        formular({ [AUSWAHL_PARAMETER]: "g-code", [FELD_ENTLEIHER]: "Anna Beispiel" }),
      ),
    ).rejects.toThrow("REDIRECT:");

    riegel.mockResolvedValue(zugangUeberSuite());
    await expect(
      ausleiheAnlegen(
        null,
        formular({ [AUSWAHL_PARAMETER]: "g-suite", [FELD_ENTLEIHER]: "Bea Beispiel" }),
      ),
    ).rejects.toThrow("REDIRECT:");

    expect(db.select().from(loans).where(eq(loans.deviceId, "g-code")).get()?.zugangscodeId).toBe(
      "zc-1",
    );
    expect(
      db.select().from(loans).where(eq(loans.deviceId, "g-suite")).get()?.zugangscodeId,
    ).toBeNull();
  });

  it("entwertet beide Flaechen und leitet mit der Anzahl auf die Uebersicht", async () => {
    /*
     * Entscheidung E1 (`briefs/KOPF.md:416-455`): die Uebersicht liegt an `/geraete`, `/` ist
     * das Gate — Spec:3429 schreibt `/`, und das ist genau die Zeile, die E1 umschreibt.
     *
     * ⛔ `revalidatePath` UND `force-dynamic` (A18-A20) SIND BEIDES, NICHT EINES VON BEIDEN
     * (`VORABSCAN-A.md:415-424`, Fund F26): `force-dynamic` verhindert, dass die
     * SERVERANTWORT vorgerendert ist; `revalidatePath` entwertet zusaetzlich den
     * ROUTER-CACHE DES CLIENTS, den der `redirect` unmittelbar danach benutzt.
     */
    geraet("g-1", "7000001");
    geraet("g-2", "7000002");

    await expect(
      ausleiheAnlegen(
        null,
        formular({ [AUSWAHL_PARAMETER]: "g-1,g-2", [FELD_ENTLEIHER]: "Anna Beispiel" }),
      ),
    ).rejects.toThrow("REDIRECT:/geraete?gebucht=2");

    expect(revalidiert).toEqual(["/geraete", "/rueckgabe"]);
    expect(umgeleitet).toEqual(["/geraete?gebucht=2"]);
  });
});

describe("radio-_actions/ausleihe: rueckgabeBuchen", () => {
  it("verweigert eine Zustandsnotiz ueber der Zeichengrenze serverseitig", async () => {
    /*
     * §4.4 Punkt 2 (Spec:3583-3585): „Der Server prueft erneut — eine Regel, die nur im
     * Client steht, ist keine Regel." Das `maxLength` am Feld (A20) ist eine Bequemlichkeit.
     *
     * ⚠️ DIE GRENZE HAT GENAU EINEN EIGENTUEMER: `ZUSTANDSNOTIZ_MAX` (`_lib/meldungen.ts:88`),
     * geprueft in `bucheRueckgabe` (`_db/leihen.ts:599-601`). Die Action setzt KEINE zweite
     * Zahl daneben und kuerzt NICHT — sie reicht die Notiz unveraendert durch, und genau das
     * misst dieser Fall: eine Kuerzung in der Action liesse die Rueckgabe GELINGEN.
     */
    geraet("g-1", "7000001");
    const leiheId = legeLeiheAn("g-1", "Anna Beispiel", "Ruf g-1");

    const ergebnis = await rueckgabeBuchen(
      null,
      formular({
        [FELD_AUSLEIHE_ID]: leiheId,
        [FELD_ZUSTANDSNOTIZ]: "x".repeat(ZUSTANDSNOTIZ_MAX + 1),
      }),
    );

    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) throw new Error("unerreicht");
    expect(ergebnis.grund).toBe("notiz-zu-lang");
    expect(offeneLeihen(), "die Leihe wurde trotz zu langer Notiz geschlossen").toHaveLength(1);
    expect(revalidiert).toEqual([]);
  });

  it("bucht die Rueckgabe, speichert die Notiz unveraendert und leitet NICHT um", async () => {
    /*
     * §4.4 Schritt 5 (Spec:3562): `revalidatePath` auf beide Flaechen, und die Erfolgszeile
     * rendert die Seite. ⛔ KEIN `redirect()` — der Dialog (A20) zeigt `rufname` aus dem
     * Rueckgabewert, und eine Umleitung verwuerfe ihn samt der getippten Notiz
     * (`ReturnDialog.tsx:66-73`, Feinheit 1 in `briefs/A20.md:35-38`).
     */
    geraet("g-1", "7000001");
    const leiheId = legeLeiheAn("g-1", "Anna Beispiel", "Ruf g-1");

    const ergebnis = await rueckgabeBuchen(
      null,
      formular({ [FELD_AUSLEIHE_ID]: leiheId, [FELD_ZUSTANDSNOTIZ]: "  Antenne locker  " }),
    );

    expect(ergebnis).toEqual({ ok: true, rufname: "Ruf g-1" });
    expect(offeneLeihen()).toEqual([]);
    expect(db.select().from(loans).where(eq(loans.id, leiheId)).get()?.returnNote).toBe(
      "  Antenne locker  ",
    );
    expect(revalidiert).toEqual(["/geraete", "/rueckgabe"]);
    expect(umgeleitet, "eine Rueckgabe leitet nicht um").toEqual([]);
  });

  it("eine leere Zustandsnotiz wird zu NULL und nicht zur leeren Zeichenkette", async () => {
    /*
     * Das Feld ist optional (Spec:3560: „Optional: Zustandsnotiz hinterlassen"). Ein
     * nicht ausgefuelltes Feld schickt `""`; als `""` gespeichert waere es spaeter von einer
     * abgegebenen leeren Notiz nicht zu unterscheiden. ⚠️ Das ist die EINZIGE Umformung auf
     * dem Weg in die Datenbank — kein `trim()`, kein Umschreiben (Spec:3587-3592).
     */
    geraet("g-1", "7000001");
    const leiheId = legeLeiheAn("g-1", "Anna Beispiel", "Ruf g-1");

    await rueckgabeBuchen(null, formular({ [FELD_AUSLEIHE_ID]: leiheId, [FELD_ZUSTANDSNOTIZ]: "" }));

    expect(db.select().from(loans).where(eq(loans.id, leiheId)).get()?.returnNote).toBeNull();
  });
});

describe("radio-_actions/ausleihe: die zwei lesenden Actions", () => {
  it("liefert hoechstens zehn Vorschlaege und nichts unter zwei Zeichen", async () => {
    /*
     * §4.3.4 (Spec:3506-3512). ⚠️ DEN DECKEL SETZT DIE DATENFUNKTION, NICHT DIESE ACTION:
     * `sucheEntleiher(db, suchtext, deckel = 10)` traegt die 10 als Vorgabewert
     * (`_db/leihen.ts:342`, Spec:4084), und `entleiherVorschlaege` setzt KEINEN eigenen
     * daneben — zwei Zahlen fuer dieselbe Grenze laufen auseinander.
     *
     * ⛔ DIE ANTWORT TRAEGT NUR `{ name, zuletztText }` — kein Geraet, keine Millisekunden,
     * keine ID (Spec:3506-3512). Der Fall prueft die Schluessel, nicht nur die Anzahl.
     */
    geraet("g-1", "7000001");
    for (let i = 0; i < 12; i++) {
      db.insert(loans)
        .values({
          id: `leihe-${i}`,
          deviceId: "g-1",
          snapshotCallSign: "Ruf g-1",
          borrowerName: `Beispiel ${i}`,
          borrowedAt: new Date(2026, 5, 14, 9, 12 + i),
          returnedAt: new Date(2026, 5, 14, 18, 0),
          zugangscodeId: null,
          createdAt: new Date("2026-06-14T07:12:00Z"),
          updatedAt: new Date("2026-06-14T07:12:00Z"),
        })
        .run();
    }

    expect(await entleiherVorschlaege("B"), "ein Zeichen liefert schon Namen").toEqual([]);
    expect(await entleiherVorschlaege(" "), "ein Leerzeichen liefert schon Namen").toEqual([]);

    const treffer = await entleiherVorschlaege("Beispiel");
    expect(treffer).toHaveLength(10);
    expect(Object.keys(treffer[0]!).sort()).toEqual(["name", "zuletztText"]);
  });

  it("auch die lesenden Actions rufen den Riegel", async () => {
    /*
     * ⛔ Die Ausnahmeliste des Guard-Scans hat GENAU DREI Eintraege
     * (`_actions/guards.test.ts:56-60`, Spec:6762 plus Entscheidung E12); ein VIERTER waere
     * ein roter Test. Keine der vier Ausleih-Actions steht darauf — auch die zwei lesenden
     * nicht. Bei `{ ok: false }` liefert `entleiherVorschlaege` eine LEERE LISTE und
     * `listeAktualisieren` tut NICHTS.
     *
     * ⚠️ DIE GEGENPROBE STEHT DANEBEN: ohne sie waere „liefert nichts" auch dann gruen, wenn
     * die Action grundsaetzlich nichts liefert.
     */
    geraet("g-1", "7000001");
    legeLeiheAn("g-1", "Anna Beispiel", "Ruf g-1");

    riegel.mockResolvedValue({ ok: false, grund: "gesperrt" });
    expect(await entleiherVorschlaege("Anna")).toEqual([]);
    await listeAktualisieren();
    expect(revalidiert, "listeAktualisieren hat trotz Absage entwertet").toEqual([]);
    expect(riegel).toHaveBeenCalledTimes(2);

    riegel.mockResolvedValue(zugangUeberCode());
    expect(
      (await entleiherVorschlaege("Anna")).map((v) => v.name),
      "die Action liefert auch mit Zugang nichts — der Fall oben ist leer",
    ).toEqual(["Anna Beispiel"]);
    await listeAktualisieren();
    expect(revalidiert).toEqual(["/geraete"]);
  });
});

describe("radio-_actions/ausleihe: die Sperrgruende am Formular", () => {
  it("eine abgelaufene Sitzung liefert ok false, ohne umzuleiten", async () => {
    /*
     * Bauform-Zulaessigkeitstafel Zeile 10 (`briefs/KOPF.md:351`, Spec:2413-2415,
     * Spec:2780-2784): ein `redirect()` aus einer schreibenden Action verwuerfe die
     * eingetragenen Werte — der Mensch haette vier Geraete und einen Namen eingegeben und
     * faende ein leeres Formular vor.
     */
    riegel.mockResolvedValue({ ok: false, grund: "sitzung" });

    const ausleihe = await ausleiheAnlegen(
      null,
      formular({ [AUSWAHL_PARAMETER]: "g-1", [FELD_ENTLEIHER]: "Anna Beispiel" }),
    );
    const rueckgabe = await rueckgabeBuchen(null, formular({ [FELD_AUSLEIHE_ID]: "leihe-1" }));

    expect(ausleihe.ok).toBe(false);
    expect(rueckgabe.ok).toBe(false);
    expect(umgeleitet, "eine Absage am Riegel leitet um und verwirft die Eingaben").toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("reicht bei einer abgelaufenen Sitzung grund sitzung durch, nicht unbekannt", async () => {
    /*
     * ⛔ ENTSCHEIDUNG E13 (`briefs/KOPF.md:732-778`). An dieser Unterscheidung haengt Zusage
     * §3.10 Nr. 8 (Spec:3235-3236): die Inline-Erneuerung wird NUR bei `grund === "sitzung"`
     * angeboten, NIE bei `"gesperrt"` — bei einem gesperrten Code scheitert derselbe Code
     * genauso, und „ein Feld, das nicht helfen kann, ist schlimmer als eine klare Absage"
     * (Spec:2568-2570). Ein Einfalten auf `"unbekannt"` machte die Erneuerung entweder nie
     * oder immer sichtbar.
     *
     * ⛔ `betroffen` IST DABEI DIE LEERE LISTE (`briefs/KOPF.md:774-775`): es gibt kein
     * betroffenes Geraet, der Vorgang ist am Riegel gescheitert.
     */
    for (const grund of ["sitzung", "gesperrt"] as const) {
      riegel.mockResolvedValue({ ok: false, grund });

      const ausleihe = await ausleiheAnlegen(
        null,
        formular({ [AUSWAHL_PARAMETER]: "g-1", [FELD_ENTLEIHER]: "Anna Beispiel" }),
      );
      if (ausleihe.ok) throw new Error("unerreicht");
      expect(ausleihe.grund, `ausleiheAnlegen faltet ${grund} ein`).toBe(grund);
      expect(ausleihe.betroffen).toEqual([]);
      expect(ausleihe.text.length).toBeGreaterThan(0);

      const rueckgabe = await rueckgabeBuchen(null, formular({ [FELD_AUSLEIHE_ID]: "leihe-1" }));
      if (rueckgabe.ok) throw new Error("unerreicht");
      expect(rueckgabe.grund, `rueckgabeBuchen faltet ${grund} ein`).toBe(grund);
      expect(rueckgabe.text.length).toBeGreaterThan(0);
    }
  });

  it("die zwei Sperrsaetze kommen aus _lib/meldungen.ts und stehen hier nicht ein zweites Mal", async () => {
    /*
     * Spec:5229-5232: „die Union ist die Rueckgabeform beider Schreib-Actions, und JEDER
     * `grund` braucht dort einen Text." Der Text ist NICHT die Sache dieser Datei — er
     * kommt aus `ausleihText`/`rueckgabeText` (`_lib/meldungen.ts:331`, `:404`).
     *
     * ⛔ WAS DIESER FALL FAENGT: ein Literal in der Action. Ohne ihn liesse sich
     * `ausleihText({ grund })` durch einen zeichengleichen String ersetzen, ohne dass ein
     * Fall rot wuerde — dieselbe Mechanik, die `_lib/meldungen.test.ts` fuer die zwei
     * Statusetiketten mit einem Quelltext-Zaehler abwehrt (Sonde P7, 0 rot, gemessen).
     *
     * ⛔ DER SCAN LAEUFT UEBER BEIDE SPERRGRUENDE UND BEIDE FLUESSE — VIER SAETZE, NICHT EINER.
     * Ein Scan nur auf `sitzung` liesse die Haelfte unbewacht, waehrend der Testname beide
     * verspricht: die zwei Gleichheitszusicherungen darueber bleiben gegen ein
     * ZEICHENGLEICHES Literal gruen, und genau dagegen steht dieser Fall. (Die zwei
     * Sperr-Saetze sind ausserdem in `_lib/meldungen.ts:253-256` je EINMAL geschrieben, der
     * zu `gesperrt` kommt sogar aus `_lib/gateTexte.ts` — ein Literal HIER waere der dritte
     * Ort fuer denselben Satz.)
     */
    for (const grund of ["sitzung", "gesperrt"] as const) {
      riegel.mockResolvedValue({ ok: false, grund });

      const ausleihe = await ausleiheAnlegen(null, formular({}));
      const rueckgabe = await rueckgabeBuchen(null, formular({}));
      if (ausleihe.ok || rueckgabe.ok) throw new Error("unerreicht");

      expect(ausleihe.text).toBe(ausleihText({ grund }));
      expect(rueckgabe.text).toBe(rueckgabeText({ grund }));
    }

    const quelle = readFileSync(AUSLEIHE_QUELLE, "utf8");
    for (const grund of ["sitzung", "gesperrt"] as const) {
      expect(quelle, `ein zweiter Ort fuer den Ausleih-Satz zu ${grund}`).not.toContain(
        ausleihText({ grund }),
      );
      expect(quelle, `ein zweiter Ort fuer den Rueckgabe-Satz zu ${grund}`).not.toContain(
        rueckgabeText({ grund }),
      );
    }
  });
});

describe("radio-_actions/ausleihe: die Leerstellen dieser Datei", () => {
  it("benennt A-L17 als weiterhin offen und uebergibt sie namentlich an A19", () => {
    /*
     * ⬜ A-L17 — DIE LAENGENGRENZE DES ENTLEIHERNAMENS FAELLT AUCH HIER NICHT, und das
     * Ledger weist den Posten AUSDRUECKLICH DIESER AUFGABE zu
     * (`.superpowers/sdd/planteil3/progress.md`, Block „Fix-Runde 1 zu A15"): „Auf
     * Formularebene gibt es Feldfehler ohne `grund`; dort ist die Grenze ohne E13-Bruch zu
     * haben. Faellt sie dort nicht, bleibt der Posten offen."
     *
     * ⛔ EINE SERVER ACTION HAT DIESE EBENE NICHT: ihr einziger Fehlerkanal ist
     * `AusleihErgebnis`, dessen `grund`-Union keinen Zweig fuer „zu lang" traegt, und einen
     * achten `grund` verbietet Entscheidung E13. Der Eigentuemer wandert damit an A19 — das
     * Namensfeld, wo A20 dasselbe fuer die Zustandsnotiz tut.
     *
     * ⚠️ DER WAECHTER GEHOERT IN DEN VERFOLGTEN BAUM UND NICHT IN EINEN BERICHT:
     * `.superpowers/` ist git-ignoriert (`.gitignore:17`) — eine Leerstelle, die nur dort
     * steht, steht nirgends. Dieselbe Bauform wie `_db/leihen.test.ts:941-960`.
     *
     * ⛔ ER BELEGT, DASS DER SATZ DASTEHT, NICHT DASS ER STIMMT. Behauptet wird nichts anderes.
     */
    const quelle = readFileSync(AUSLEIHE_QUELLE, "utf8");
    expect(quelle).toContain("A-L17");
    expect(quelle).toContain("radio-admin/shared/src/loan.ts:5");
    expect(quelle, "der Posten wird ohne Nachfolger fallen gelassen").toContain("A19");
  });

  it("behauptet nirgends, die Ratenbegrenzung dieser vier Actions sei gebaut", () => {
    /*
     * ⛔ Zusage §4.12 Nr. 4 (Spec:4074-4076) nennt die Ratenbegrenzung als VORAUSSETZUNG der
     * Vorschlaege ueber eine Server Action und setzt sie NICHT um. Der Auftrag verbietet
     * ausdruecklich, in einem Kommentar dieser Datei das Gegenteil zu behaupten — und genau
     * eine solche Behauptung faellt keinem Tor auf: `typecheck`, `lint` und jede Testebene
     * lesen Kommentare nicht (Ledger-Lehre aus REVIEW-A15 Fund F3).
     *
     * ⚠️ VERANKERT AUF DEN BEZEICHNERN DES BESTANDS, nicht auf einem deutschen Wort: die
     * Schranke des Moduls heisst `gateGesperrt`/`gateFehlversuchBuchen`
     * (`_lib/gateSchranke.ts`), der Absender kommt aus `clientIpAus` (`src/core/ratelimit.ts`).
     * Steht einer davon hier, ist entweder eine Schranke eingebaut — dann gehoert sie
     * getestet — oder eine behauptet, die es nicht gibt.
     */
    const quelle = readFileSync(AUSLEIHE_QUELLE, "utf8");
    expect(quelle).not.toContain("gateGesperrt");
    expect(quelle).not.toContain("gateFehlversuchBuchen");
    expect(quelle).not.toContain("clientIpAus");
    expect(quelle, "die fehlende Ratenbegrenzung ist nicht benannt").toContain(
      "RATENBEGRENZUNG DIESER VIER ACTIONS IST NICHT GEBAUT",
    );
  });
});

describe("radio-_actions/ausleihe: die Auswahl kommt aus dem einen Vertrag", () => {
  it("entdoppelt, kappt bei zwanzig und wirft bei einer handgetippten Auswahl nicht", async () => {
    /*
     * ⛔ DER DECKEL HAT GENAU EINEN EIGENTUEMER: `AUSWAHL_MAX = 20` in `_lib/auswahl.ts:53`,
     * durchgesetzt in `normalisiereIds` (`_lib/auswahl.ts:76-85`). Die Action ruft
     * `auswahlLesen` und setzt KEINE zweite Zahl daneben — dieselbe Form wie beim Deckel 10
     * der Vorschlaege.
     *
     * ⚠️ `auswahlLesen` WIRFT NIE (`_lib/auswahl.ts:91-93`): der Wert ist Nutzereingabe, und
     * ein Wurf machte aus einer handgetippten URL einen HTTP 500. Der zweite Teil dieses
     * Falles misst genau das — eine leere Auswahl endet als `keine-auswahl`, nicht als 500.
     */
    for (let i = 1; i <= 25; i++) geraet(`g-${i}`, `70000${String(i).padStart(2, "0")}`);
    const viele = Array.from({ length: 25 }, (_, i) => `g-${i + 1}`);

    await expect(
      ausleiheAnlegen(
        null,
        formular({
          [AUSWAHL_PARAMETER]: [...viele, "g-1"].join(","),
          [FELD_ENTLEIHER]: "Anna Beispiel",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/geraete?gebucht=20");
    expect(offeneLeihen()).toHaveLength(20);

    const leer = await ausleiheAnlegen(
      null,
      formular({ [AUSWAHL_PARAMETER]: " , ,", [FELD_ENTLEIHER]: "Anna Beispiel" }),
    );
    if (leer.ok) throw new Error("unerreicht");
    expect(leer.grund).toBe("keine-auswahl");
  });
});
