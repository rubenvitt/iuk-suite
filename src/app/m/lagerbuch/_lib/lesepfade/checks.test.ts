import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, checks, geraete, lagerorte, o2Flaschen, sollPositionen } from "../../_db/schema";
import { checkHistorie, checkDetail } from "./checks";
import { CHECK_GRENZE } from "../grenzen";
import { summiereCheckErgebnis } from "../domain/check";

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

const V2 = {
  positionen: [{ sollPositionId: "sp1", artikelId: "a1", soll: 4, ist: 3 }],
  artikel: [{ artikelId: "a1", sollSumme: 4, istSumme: 3, recordedVorher: 5,
              korrektur: -2, nachfuellGewuenscht: 1, nachfuellGebucht: 1 }],
  geraete: [{ geraetId: "g1", vorhanden: false, zustand: "In Ordnung", bemerkung: "fehlt" }],
  flaschen: [{ flascheId: "f-300", druckBar: 150 }],   // OHNE Snapshot!
  verfall: [{ artikelId: "a1", verfall: "2026-07", ampel: "gruen", abgelaufen: false }],
};

/**
 * DIE VERFALLSSCHWELLEN WERDEN AUSDRUECKLICH GEPINNT.
 *
 * Der Pfad ruft `verfallSchwellen()` ohne Argument, liest also `process.env` —
 * und dieser Test behauptet konkrete Ampelwerte. Ein Entwickler mit
 * `LAGERBUCH_VERFALL_ROT_TAGE=7` in seiner Shell bekaeme sonst eine rote Datei
 * mit einer Meldung, die nichts erklaert. Teil 2 hat die Regel in
 * `grenzen.test.ts` aufgeschrieben: „Der Test darf nicht davon abhaengen, was in
 * der Entwicklerumgebung zufaellig gesetzt ist."
 *
 * `vi.stubEnv`/`vi.unstubAllEnvs` ist das etablierte Muster des Repos fuer genau
 * diesen Fall (`core/bootstrap.test.ts`, `devLogin.test.ts`) — `process.env.X = …`
 * scheitert an Nexts `readonly`-Augmentierung.
 *
 * ⚠️ NICHT „vereinfachen". Ohne den Pin ist die Datei rennabhaengig gruen.
 */
function pinneSchwellen(): void {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
}

beforeEach(() => {
  pinneSchwellen();
  t = migrierteTestDb("lagerbuch-lp-checks-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true }).run();
  t.db.insert(artikel).values(
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
  t.db.insert(sollPositionen).values(
    { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4, templatePositionId: null,
      ueberschrieben: false, entfernt: false }).run();
  t.db.insert(geraete).values(
    { id: "g1", typ: "objekt", name: "Spineboard", lagerortId: "rtw-1",
      aktiv: true, createdAt: NOW, barcode: null, anmerkung: null,
      mtkFaellig: null, beschreibung: null, ablaufdatum: null }).run();
  // 300-bar-Flasche — der Fall, den der ?? 200-Rueckfall still falsch rechnete.
  t.db.insert(o2Flaschen).values(
    { id: "f-300", name: "O2 300", lagerortId: "rtw-1", groesseLiter: 10,
      nennfuelldruckBar: 300, aktiv: true, createdAt: NOW }).run();
  t.db.insert(checks).values(
    { id: "chk-1", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: NOW, completedAt: NOW, ergebnis: JSON.stringify(V2) }).run();
});
afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

describe("checkHistorie", () => {
  it("liefert die Summen aus summiereCheckErgebnis", () => {
    const z = checkHistorie(t.db).zeilen[0];
    expect(z).toMatchObject({
      fahrzeugName: "RTW 1", positionen: 1, nachgefuellt: 1,
      korrigiert: 2, offen: 0, geraeteAuffaellig: 1, altFormat: false,
    });
  });

  it("zaehlt die Flasche OHNE Snapshot in nichtBewertbar, nicht in flaschenAuffaellig", () => {
    // §5.12: die HISTORIE hat keinen Rueckgriff auf den Flaschenstamm und ist
    // damit der LEICHTERE der beiden Wege in den Rueckfall. Ein Altcheck ueber
    // 300-bar-Flaschen meldete dort systematisch zu wenige auffaellige Flaschen.
    const z = checkHistorie(t.db).zeilen[0];
    expect(z.nichtBewertbar).toBe(1);
    expect(z.flaschenAuffaellig).toBe(0);
  });

  it("filtert nach Fahrzeug und Zeitraum", () => {
    expect(checkHistorie(t.db, { fahrzeugId: "rtw-1" }).zeilen).toHaveLength(1);
    expect(checkHistorie(t.db, { fahrzeugId: "gibtsnicht" }).zeilen).toHaveLength(0);
    expect(checkHistorie(t.db, { von: new Date("2026-07-01T00:00:00Z") }).zeilen).toHaveLength(0);
  });

  it("macht den Deckel BEOBACHTBAR — CHECK_GRENZE + 1", () => {
    // §5.14.3, der strengere Fall: die Checks-Seite nennt ihre 50 heute an KEINER
    // Stelle.
    for (let i = 0; i < CHECK_GRENZE; i++) {
      t.db.insert(checks).values({
        id: `c${i}`, fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
        startedAt: NOW, completedAt: NOW, ergebnis: "[]",
      }).run();
    }
    const h = checkHistorie(t.db);
    expect(h.zeilen).toHaveLength(CHECK_GRENZE);
    expect(h.mehrVorhanden).toBe(true);
  });

  it("meldet bei EXAKT CHECK_GRENZE Zeilen mehrVorhanden FALSE", () => {
    /**
     * ⚠️ DER GEGENFALL ZUM DECKEL-TEST DARUEBER, und er ist der eigentlich
     * scharfe: ohne ihn ueberlebt die Mutation `rows.length > grenze` →
     * `>= grenze`, weil kein Fall mit EXAKT `GRENZE` Zeilen existiert. Ihre Folge
     * ist genau die Fehlaussage, gegen die §5.14.3 gebaut wurde — „Neueste 50 von
     * mehr Treffern", obwohl die Grenze gar nicht griff. `journal.test.ts:37`
     * fuehrt denselben Gegenfall.
     *
     * `chk-1` steht schon in der Fixture, also werden `CHECK_GRENZE − 1`
     * ergaenzt.
     */
    for (let i = 0; i < CHECK_GRENZE - 1; i++) {
      t.db.insert(checks).values({
        id: `g${i}`, fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
        startedAt: NOW, completedAt: NOW, ergebnis: "[]",
      }).run();
    }
    const h = checkHistorie(t.db);
    expect(h.zeilen).toHaveLength(CHECK_GRENZE);
    expect(h.mehrVorhanden).toBe(false);
  });

  it("sortiert completedAt DESC mit id-Tiebreaker", () => {
    // Dieselbe Sekundengranularitaet wie im Journal (§5.14.4).
    t.db.insert(checks).values({
      id: "chk-2", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
      startedAt: NOW, completedAt: NOW, ergebnis: "[]",
    }).run();
    expect(checkHistorie(t.db).zeilen.map((z) => z.id)).toEqual(["chk-2", "chk-1"]);
  });
});

describe("checkDetail — der Nennfuelldruck wird NICHT geraten (§5.12)", () => {
  it("greift auf den FLASCHENSTAMM zurueck, wenn der Snapshot fehlt", () => {
    // Die Kette `e.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null`. Die
    // 300-bar-Flasche existiert noch → 150/300 = 50 % → gruen.
    const f = checkDetail(t.db, "chk-1", NOW)!.flaschen[0];
    expect(f.nennfuelldruckBar).toBe(300);
    expect(f.prozent).toBe(50);
    expect(f.ampel).toBe("gruen");
    expect(f.niedrig).toBe(false);
  });

  it("liefert null statt 200, wenn Snapshot UND Stamm fehlen", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT (§5.19.3): den `?? null` wieder auf `?? 200`
     * setzen. Fuer eine 300-bar-Flasche erschienen 150 bar als 75 % statt der
     * wahren 50 %, und die Ampel spraenge von gelb auf gruen.
     */
    t.db.delete(o2Flaschen).run();
    const f = checkDetail(t.db, "chk-1", NOW)!.flaschen[0];
    expect(f.nennfuelldruckBar).toBeNull();
    expect(f.prozent).toBeNull();
    expect(f.ampel).toBeNull();
    expect(f.name).toBe("(gelöschte Flasche)");
  });

  it("zaehlt eine unbewertbare Flasche in nichtBewertbar, NICHT in flaschenAuffaellig", () => {
    t.db.delete(o2Flaschen).run();
    const d = checkDetail(t.db, "chk-1", NOW)!;
    expect(d.summe.nichtBewertbar).toBe(1);
    expect(d.summe.flaschenAuffaellig).toBe(0);
  });

  it("ueberschreibt die Flaschenzaehler der Summe in die SICHERE Richtung, wenn der Stamm mehr weiss", () => {
    /**
     * Der diskriminierende Fall fuer die zweite Entscheidung, die diese Datei
     * traegt: `summiereCheckErgebnis` (T40) kennt den Flaschenstamm NICHT und
     * zaehlt eine Flasche ohne JSON-Snapshot immer als "nicht bewertbar" — auch
     * dann, wenn der Stamm die Flasche noch kennt und der Druck tatsaechlich
     * niedrig ist. Das Detail rechnet die volle Kette und ueberschreibt die
     * beiden Zaehler: aus "nicht bewertbar" wird "auffaellig".
     *
     * f-300 lebt hier WEITER (kein delete) — 50 bar / 300 bar = 17 % → rot →
     * niedrig. Ohne die Ueberschreibung in checks.ts bliebe die Summe bei T40s
     * (0, 1) stehen; SIE MUSS (1, 0) werden.
     */
    const ergebnisMitNiedrigemDruck = JSON.stringify({
      ...V2,
      flaschen: [{ flascheId: "f-300", druckBar: 50 }],
    });
    t.db.insert(checks).values({
      id: "chk-druck-niedrig", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
      startedAt: NOW, completedAt: NOW, ergebnis: ergebnisMitNiedrigemDruck,
    }).run();

    // Beweis, dass T40 allein den Fall NICHT auffaellig sieht — der Stammbezug
    // ist ausschliesslich hier in checks.ts eingebaut.
    const summeOhneStamm = summiereCheckErgebnis(ergebnisMitNiedrigemDruck);
    expect(summeOhneStamm.flaschenAuffaellig).toBe(0);
    expect(summeOhneStamm.nichtBewertbar).toBe(1);

    const d = checkDetail(t.db, "chk-druck-niedrig", NOW)!;
    expect(d.summe.flaschenAuffaellig).toBe(1);
    expect(d.summe.nichtBewertbar).toBe(0);
  });
});

describe("checkDetail — eine Flasche OHNE gemessenen Druck (§5.12)", () => {
  it("liefert druckBar null statt 0 und zaehlt sie in nichtBewertbar", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT: `x.druckBar ?? 0` statt der Null-Pruefung.
     * Aus der FEHLENDEN Messung entstuende „0 bar / 300 bar = 0 % → rot →
     * niedrig" — die Zeile behauptete auf einem Fahrzeug-Check-Nachweis eine
     * LEERE Flasche, die niemand gemessen hat, und `flaschenAuffaellig` stiege.
     * Der Nenndruck ist hier BEKANNT (300 aus dem Stamm); unbewertbar ist die
     * Zeile allein wegen der fehlenden Messung.
     */
    t.db.insert(checks).values({
      id: "chk-ohne-druck", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
      startedAt: NOW, completedAt: NOW,
      ergebnis: JSON.stringify({ ...V2, flaschen: [{ flascheId: "f-300" }] }),
    }).run();
    const d = checkDetail(t.db, "chk-ohne-druck", NOW)!;
    expect(d.flaschen[0].druckBar).toBeNull();
    expect(d.flaschen[0].nennfuelldruckBar).toBe(300);
    expect(d.flaschen[0].prozent).toBeNull();
    expect(d.flaschen[0].ampel).toBeNull();
    expect(d.flaschen[0].niedrig).toBe(false);
    expect(d.summe.nichtBewertbar).toBe(1);
    expect(d.summe.flaschenAuffaellig).toBe(0);
  });
});

describe("checkDetail — die `offen`-Zeilen addieren sich zur ausgewiesenen Summe (§5.8.3)", () => {
  it("haelt beide Aufrufstellen von `offenJeArtikel` gegeneinander", () => {
    /**
     * ⚠️ DIE ZUSICHERUNG, DIE DEN ZWEITEN RECHENWEG VERHINDERT. Bis zu diesem Fix
     * stand `max(0, soll − ist − nachgefuellt)` ZWEIMAL woertlich da: einmal je
     * Detailzeile (`checks.ts`) und einmal in der Summe (`domain/check.ts`).
     * Genau so lief die Alt-Anwendung beim Nennfuelldruck auseinander. Laeuft
     * eine der beiden Stellen weg, zeigt die Detailseite Zeilen, deren `offen`
     * sich nicht zur Summe addiert — auf einem Fahrzeug-Check-Nachweis.
     *
     * Die Fixture ist bewusst NICHT trivial: drei Artikel, einer davon
     * UEBERFUELLT (b), sodass eine erst in der Summe geklemmte Rechnung 8 statt
     * 12 lieferte, und einer mit Nachfuellung (c).
     */
    t.db.insert(artikel).values([
      { id: "a-b", name: "Ueberfuellt", einheit: "Stk.", fach: "B1",
        mindestbestand: 0, aktiv: true, createdAt: NOW },
      { id: "a-c", name: "Nachgefuellt", einheit: "Stk.", fach: "C1",
        mindestbestand: 0, aktiv: true, createdAt: NOW },
    ]).run();
    t.db.insert(checks).values({
      id: "chk-offen", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
      startedAt: NOW, completedAt: NOW,
      ergebnis: JSON.stringify({
        positionen: [], geraete: [], flaschen: [], verfall: [],
        artikel: [
          { artikelId: "a1", sollSumme: 10, istSumme: 2, nachfuellGebucht: 0 },  // 8
          { artikelId: "a-b", sollSumme: 1, istSumme: 9, nachfuellGebucht: 0 },  // 0, nicht −8
          { artikelId: "a-c", sollSumme: 7, istSumme: 1, nachfuellGebucht: 2 },  // 4
        ],
      }),
    }).run();
    const d = checkDetail(t.db, "chk-offen", NOW)!;
    // VON HAND gerechnet, nicht aus der Implementierung abgeleitet.
    expect(d.artikel.map((a) => a.offen)).toEqual([8, 0, 4]);
    expect(d.summe.offen).toBe(12);
    // DIE BINDUNG: die Zeilen addieren sich zur Summe.
    expect(d.artikel.reduce((s, a) => s + a.offen, 0)).toBe(d.summe.offen);
  });
});

describe("checkDetail — tolerant gegen geloeschte Bezugsobjekte", () => {
  it("ueberbrueckt Artikel, Geraet und Soll-Position", () => {
    // `ergebnis` ist freies JSON OHNE Fremdschluessel (§4.10, 1:1-Pflicht 3).
    t.db.delete(geraete).run();
    const d = checkDetail(t.db, "chk-1", NOW)!;
    expect(d.geraete[0].name).toBe("(gelöschtes Gerät)");
    expect(d.positionen[0].fachLabel).toBe("Fach 1");
    expect(d.positionen[0].artikelName).toBe("Verband");
  });
});

describe("checkDetail — Verfall-Ampel gegen HEUTE, nicht gegen den Check-Zeitpunkt", () => {
  it("rechnet neu und ignoriert den gespeicherten Ampelwert", () => {
    /**
     * §5.6.3: der Snapshot traegt `ampel: "gruen"`. Gegen einen `now` von 2026-08
     * ist 2026-07 ABGELAUFEN. Das ist eine bewusste Entscheidung und bleibt — mit
     * der Konsequenz, dass die Detailseite fuer DENSELBEN Check ueber die Zeit
     * verschiedene Ampeln zeigt. VERBINDLICH: die Seite schreibt das aus (Teil 5).
     */
    const spaeter = new Date("2026-08-15T10:00:00Z");
    const d = checkDetail(t.db, "chk-1", spaeter)!;
    const v = d.verfall[0];
    expect(v.abgelaufen).toBe(true);
    expect(v.ampel).toBe("rot");
    expect(v.text).toBe("abgelaufen");
    // `verfallAuffaellig` zaehlt Zeilen mit Ampel != gruen — der abgelaufene
    // Eintrag ist die einzige Verfallszeile im Fixture.
    expect(d.summe.verfallAuffaellig).toBe(1);
  });
});

describe("checkDetail — das ALTE Format", () => {
  it("setzt altFormat true und liefert leere Detaillisten", () => {
    t.db.insert(checks).values({
      id: "chk-alt", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
      startedAt: NOW, completedAt: NOW, ergebnis: JSON.stringify([{ fehlt: 3, gebucht: 1 }]),
    }).run();
    const d = checkDetail(t.db, "chk-alt", NOW)!;
    expect(d.altFormat).toBe(true);
    expect(d.positionen).toEqual([]);
    expect(d.artikel).toEqual([]);
    // Die Summen kommen trotzdem — das ist die EINZIGE Auswertung, die es fuer
    // Altchecks je gab (§4.10, 1:1-Pflicht 1).
    expect(d.summe.nachgefuellt).toBe(1);
  });

  it("liefert null fuer eine unbekannte ID", () => {
    expect(checkDetail(t.db, "gibtsnicht", NOW)).toBeNull();
  });
});
