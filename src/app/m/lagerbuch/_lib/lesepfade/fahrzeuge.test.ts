import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, checks, fahrzeugTemplates, lagerorte,
         lagerortVerfall, sollPositionen, templatePositionen, newId } from "../../_db/schema";
import { fahrzeugListe, fahrzeugUebersicht, sollFuerFahrzeug,
         templateUebersicht, templateDetail, templateListeAktiv } from "./fahrzeuge";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-fahrzeuge-");
  // Einfuegereihenfolge bewusst GEGEN die erwartete Sortierreihenfolge (aktiv
  // zuerst, dann alphabetisch) — sonst faellt eine fehlende Sortierung nicht auf
  // (T30/T44/T46/T47-Muster: Einfuegereihenfolge faellt zufaellig mit der
  // Sollreihenfolge zusammen). ZWEI aktive Templates ("Basis-Vorlage" vor
  // "RTW-Vorlage" alphabetisch, aber NACH ihr eingefuegt) machen den
  // Alphabet-Tiebreaker unter den Aktiven erst load-bearing — mit nur einem
  // aktiven Template waere `templateListeAktiv`s "alphabetisch" unbeweisbar.
  t.db.insert(fahrzeugTemplates).values([
    { id: "tpl-rtw", name: "RTW-Vorlage", aktiv: true, createdAt: NOW },
    { id: "tpl-alt", name: "Alte Vorlage", aktiv: false, createdAt: NOW },
    { id: "tpl-basis", name: "Basis-Vorlage", aktiv: true, createdAt: NOW },
  ]).run();
  // ZWEITES Fahrzeug an "tpl-rtw", INAKTIV, VOR "rtw-1" eingefuegt — sonst
  // waere `templateDetail("tpl-rtw").fahrzeuge` (nur `rtw-1`) nie mehr als ein
  // Element gross, und dessen aktiv/alphabetisch-Sortierung waere unbeweisbar.
  t.db.insert(lagerorte).values([
    // DRK-309: DIESE ZEILE TRAEGT KEINE `einheitenart` — der Zwischenstand aus
    // Migration 0009, die bewusst nicht backfillt. Er steht MITTEN in der
    // Fixture und nicht am Ende, damit jede Zusicherung ueber die Uebersicht
    // ueber ihn laeuft, ohne ihn eigens zu suchen.
    { id: "rtw-2", name: "ELW", typ: "fahrzeug", kennung: "MS-2", aktiv: false },
    { id: "rtw-3", name: "ZZZ Ersatzwagen", typ: "fahrzeug", kennung: "MS-3",
      aktiv: false, templateId: "tpl-rtw", einheitenart: "fahrzeug" },
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1",
      aktiv: true, templateId: "tpl-rtw", einheitenart: "fahrzeug" },
    // VIERTES Fahrzeug fuer die vollstaendig gepflegte, unauffaellige Lage.
    // „AAA" sortiert vor „ELW" — unter den Inaktiven wird der Alphabet-
    // Tiebreaker damit erst wirklich beweisbar.
    { id: "rtw-4", name: "AAA Grünwagen", typ: "fahrzeug", kennung: "MS-4",
      aktiv: false, templateId: null },
    // DRK-309: eine TASCHE — derselbe `typ`, andere Art, und ohne Kennung.
    { id: "tasche-1", name: "Sanitätstasche 1", typ: "fahrzeug", kennung: null,
      aktiv: true, templateId: null, einheitenart: "tasche" },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a3", name: "Rettungsdecke", einheit: "Stk.", fach: "C3",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(templatePositionen).values(
    { id: "tp1", templateId: "tpl-rtw", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4 }).run();
  // Auch hier ausser der Reihe eingefuegt (sp3, sp4, sp1, sp2 statt der
  // erwarteten Sortierreihenfolge sp1, sp2, sp4, sp3) — und sp4 ist eine ZWEITE
  // Zeile im selben Fach wie sp2 ("Fach 2"), damit der `sort`-Tiebreaker
  // tatsaechlich greift (sonst unterscheidet keine Faecher-Zahl allein
  // "sortiert" von "zufaellig gleich geordnet").
  t.db.insert(sollPositionen).values([
    // GRABSTEIN — kein Soll.
    { id: "sp3", fahrzeugId: "rtw-1", fachLabel: "Fach 3", sort: 2,
      artikelId: "a2", soll: 9, templatePositionId: null,
      ueberschrieben: false, entfernt: true },
    { id: "sp4", fahrzeugId: "rtw-1", fachLabel: "Fach 2", sort: 2,
      artikelId: "a1", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    // DERSELBE Artikel in ZWEI Faechern — die zentrale Asymmetrie (§5.7.1).
    { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4, templatePositionId: "tp1",
      ueberschrieben: false, entfernt: false },
    { id: "sp2", fahrzeugId: "rtw-1", fachLabel: "Fach 2", sort: 1,
      artikelId: "a1", soll: 2, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    /**
     * ⚠️ DIE UEBRIGEN FAHRZEUGE BRAUCHEN EIN SOLL, SEIT DIE ERFASSUNG DAGEGEN
     * GEMESSEN WIRD. Ohne Sollposition ist „wie viele Artikel sind gepflegt?"
     * die Frage nach null von null — eine Lage ohne Aussage, und die drei
     * unterscheidbaren Faelle waeren nicht mehr darstellbar.
     */
    { id: "sp-zwei-a1", fahrzeugId: "rtw-2", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    { id: "sp-zwei-a2", fahrzeugId: "rtw-2", fachLabel: "Fach 1", sort: 1,
      artikelId: "a2", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    { id: "sp-drei-a1", fahrzeugId: "rtw-3", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    { id: "sp-drei-a2", fahrzeugId: "rtw-3", fachLabel: "Fach 1", sort: 1,
      artikelId: "a2", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    { id: "sp-vier-a2", fahrzeugId: "rtw-4", fachLabel: "Fach 1", sort: 0,
      artikelId: "a2", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
  ]).run();
  t.db.insert(chargen).values(
    { id: "c1", artikelId: "a1", chargenNr: "CH", verfall: "2030-01", createdAt: NOW }).run();
  const b = (lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId: "a1", chargeId: "c1",
    lagerortId, menge, quelleTyp: "system" as const, quelleId: "t",
    referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([b(HANDLAGER_ID, 30), b("rtw-1", 5)]).run();
  /**
   * DIE VIER LAGEN EINES FAHRZEUGS, ueber vier Fahrzeuge verteilt (DRK-298):
   *
   *   rtw-1  abgelaufen UND warnend      → Soll {a1},     erfasst 1 von 1
   *   rtw-2  nie gepflegt                → Soll {a1,a2},  erfasst 0 von 2
   *   rtw-3  TEILWEISE gepflegt          → Soll {a1,a2},  erfasst 1 von 2
   *   rtw-4  vollstaendig und unauffaellig → Soll {a2},   erfasst 1 von 1
   *
   * ⚠️ rtw-3 IST DER REVIEWBEFUND ZU DIESEM TICKET, und er ist der haeufigste
   * Fall von allen: der Check gibt das Verfallsdatum AUSDRUECKLICH FREIWILLIG
   * ab („nur aendern, wenn auf der Packung ein anderes Datum steht",
   * `CheckFlow.tsx`). Wer „gepflegt" als „es gibt irgendeine Zeile" liest,
   * erklaert rtw-3 zum gruenen Bereich — obwohl die Haelfte des Solls nie
   * angesehen wurde. rtw-4 ist die Gegenprobe: ohne es koennte die Rechnung
   * „vollstaendig" nie erreichen und kein Test es merken.
   *
   * ⚠️ Zu a3 und zu a2 auf rtw-1 gibt es KEINE aktive Sollposition. Das ist
   * Absicht und kein Versehen: die AUFFAELLIGEN Zahlen zaehlen JEDE Meldung des
   * Fahrzeugs — dieselbe Menge, die die Verfallsseite zeigt —, die ERFASSUNG
   * dagegen zaehlt nur das aktive Soll. Wuerde die Erfassung fremde Meldungen
   * mitzaehlen, koennte ein Fahrzeug „3 von 2 erfasst" melden.
   */
  t.db.insert(lagerortVerfall).values([
    { id: newId(), lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-07",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    // GRUEN — zaehlt NICHT als warnend. Ohne diese Zeile koennte
    // `fahrzeugUebersicht` `nurWarnend` weglassen und der Zaehler bliebe
    // trotzdem bei 1.
    { id: newId(), lagerortId: "rtw-1", artikelId: "a2", verfall: "2029-01",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    // ABGELAUFEN: Monatsende 31.05.2026 liegt vor NOW (15.06.2026).
    { id: newId(), lagerortId: "rtw-1", artikelId: "a3", verfall: "2026-05",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    // TEILWEISE: a2 gepflegt, a1 im selben Soll nie angesehen.
    { id: newId(), lagerortId: "rtw-3", artikelId: "a2", verfall: "2029-01",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    { id: newId(), lagerortId: "rtw-4", artikelId: "a2", verfall: "2029-01",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
  ]).run();
  // Checks ausser der Reihe eingefuegt (juengster ZUERST) — sonst faellt eine
  // fehlende Max-Bildung nicht auf, weil „letzter Insert gewinnt" zufaellig
  // dasselbe Ergebnis liefert wie „juengster completedAt gewinnt".
  t.db.insert(checks).values([
    { id: "chk-neu", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: new Date("2026-06-01T10:00:00Z"),
      completedAt: new Date("2026-06-01T10:05:00Z"), ergebnis: "[]" },
    { id: "chk-alt", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: new Date("2026-05-01T10:00:00Z"),
      completedAt: new Date("2026-05-01T10:05:00Z"), ergebnis: "[]" },
  ]).run();
});
afterEach(() => t.schliessen());

describe("fahrzeugUebersicht — Soll je ARTIKEL summiert, dann verglichen", () => {
  it("zaehlt einen Artikel in ZWEI Faechern EINMAL unter Soll", () => {
    /**
     * §5.7.1: das Soll ist pro (Fahrzeug, Fach, Artikel), der Bestand pro
     * (Fahrzeug, Artikel). a1 steht mit 4 + 2 + 1 = 7 im Soll (Fach 1, zweimal
     * Fach 2); der Fahrzeugbestand ist 5 → EIN Artikel unter Soll, nicht drei.
     * Wer je POSITION vergleicht, zaehlt ihn mehrfach.
     */
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.artikelUnterSoll).toBe(1);
  });

  it("zaehlt Grabsteine NICHT als Soll, und Positionen sind nicht Faecher", () => {
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.positionen).toBe(3);   // sp1, sp2, sp4 — NICHT sp3 (Grabstein)
    expect(z.faecher).toBe(2);      // sp2 und sp4 teilen sich "Fach 2"
  });

  it("nennt den JUENGSTEN abgeschlossenen Check", () => {
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.letzterCheck?.toISOString()).toBe("2026-06-01T10:05:00.000Z");
  });

  it("trennt ABGELAUFEN von BALD ABLAUFEND, je Fahrzeug", () => {
    /**
     * DRK-298. Vorher stand hier EINE Zahl fuer beides, und die Fahrzeugliste
     * zeigte sie als gelben Chip — ein Fahrzeug mit drei abgelaufenen Artikeln
     * sah aus wie eins, bei dem in drei Monaten etwas faellig wird.
     *
     * `abgelaufen` und `ampel === "rot"` sind NICHT dasselbe (`domain/verfall.ts`):
     * a1 („2026-07") ist warnend, aber nicht abgelaufen; a3 („2026-05") ist
     * abgelaufen. Wer `warnend` ueber `ampel !== "gruen"` rechnet, zaehlt a3
     * DOPPELT — in beiden Zahlen.
     */
    const l = fahrzeugUebersicht(t.db, NOW);
    const eins = l.find((x) => x.id === "rtw-1")!;
    expect(eins.verfallAbgelaufen).toBe(1);   // a3
    expect(eins.verfallWarnend).toBe(1);      // a1 — NICHT 2, a3 zaehlt hier nicht
  });

  it("zaehlt je Fahrzeug, nicht global", () => {
    // rtw-2 hat KEINE Meldung. Ein global statt je Fahrzeug gezaehlter Wert
    // liesse hier die Zahlen von rtw-1 stehen.
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-2")!;
    expect(z.verfallAbgelaufen).toBe(0);
    expect(z.verfallWarnend).toBe(0);
  });

  it("misst die Erfassung gegen das SOLL, nicht gegen die erste beste Zeile", () => {
    /**
     * ⚠️ EINE ZEILE BEWEIST KEINE VOLLSTAENDIGKEIT (Reviewbefund zu DRK-298).
     *
     * rtw-3 hat ZWEI Artikel im aktiven Soll und fuer EINEN davon eine (gruene)
     * Angabe. Wer „gepflegt" als „es gibt irgendeine Zeile" liest, zeigt hier
     * „im gruenen Bereich" — obwohl die Haelfte des Solls nie angesehen wurde.
     * Der Check gibt das Verfallsdatum ausdruecklich freiwillig ab, dieser Fall
     * ist also der Normalfall und nicht der Rand.
     */
    const drei = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-3")!;
    expect(drei.verfallSollArtikel).toBe(2);
    expect(drei.verfallErfasst).toBe(1);
  });

  it("zaehlt fuer die Erfassung NUR Artikel aus dem aktiven Soll", () => {
    /**
     * rtw-1 traegt DREI Meldungen (a1, a2, a3), hat aber nur EINEN Artikel im
     * aktiven Soll (a1; a2 ist ein Grabstein, a3 steht gar nicht im Soll).
     * Zaehlte die Erfassung die Meldungen statt das Soll, stuende hier
     * „3 von 1 erfasst" — eine Quote ueber hundert Prozent.
     */
    const eins = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(eins.verfallSollArtikel).toBe(1);
    expect(eins.verfallErfasst).toBe(1);
  });

  it("unterscheidet vollstaendig gepflegt von gar nicht gepflegt", () => {
    /**
     * DIE STILLE LUECKE, gegen die DRK-298 gebaut ist: beide Faelle liefern
     * null auffaellige Meldungen, bedeuten aber Gegensaetzliches — einmal
     * „geprueft, nichts faellig", einmal „hat nie jemand angesehen". Eine
     * Ansicht, die daraus dasselbe „—" macht, behauptet Entwarnung, wo sie nur
     * keine Daten hat.
     *
     * ⚠️ DIE ERFASSUNG ZAEHLT AUCH GRUENE ANGABEN. Wer sie aus
     * `lagerortVerfallListe(db, { nurWarnend: true })` ableitet, bekommt fuer
     * rtw-4 null — und die Luecke ist wieder da, obwohl das Feld das Gegenteil
     * verspricht.
     */
    const l = fahrzeugUebersicht(t.db, NOW);
    const vier = l.find((x) => x.id === "rtw-4")!;
    expect(vier.verfallErfasst).toBe(vier.verfallSollArtikel);
    expect(vier.verfallAbgelaufen).toBe(0);
    expect(vier.verfallWarnend).toBe(0);

    const zwei = l.find((x) => x.id === "rtw-2")!;
    expect(zwei.verfallSollArtikel).toBe(2);
    expect(zwei.verfallErfasst).toBe(0);
  });

  it("nennt den Vorlagennamen und sortiert aktive nach vorn", () => {
    const l = fahrzeugUebersicht(t.db, NOW);
    // Die beiden Aktiven zuerst, alphabetisch ("RTW 1" < "Sanitätstasche 1"),
    // dann die drei Inaktiven, ebenfalls alphabetisch:
    // "AAA Grünwagen" < "ELW" < "ZZZ Ersatzwagen".
    //
    // ⚠️ DIE TASCHE SORTIERT MIT DEN FAHRZEUGEN, NICHT HINTER IHNEN (DRK-309).
    // Die Art ist eine EIGENSCHAFT der Einheit, kein Rang: wer sie zum
    // Sortierschlüssel macht, baut zwei Listen in einer Tabelle — und die
    // Reihenfolge widerspräche dem Spaltensortierer „Art" daneben, der genau
    // dafür da ist.
    expect(l.map((z) => z.id)).toEqual(["rtw-1", "tasche-1", "rtw-4", "rtw-2", "rtw-3"]);
    expect(l[0].templateName).toBe("RTW-Vorlage");
    expect(l[1].templateName).toBeNull();
    expect(l[2].templateName).toBeNull();
    expect(l[3].templateName).toBeNull();
    expect(l[4].templateName).toBe("RTW-Vorlage");
  });
});

describe("sollFuerFahrzeug — Grabsteine bleiben DRIN", () => {
  it("gibt auch entfernte Zeilen zurueck, damit der Editor sie wiederherstellen kann", () => {
    // `queries.ts:320-321`. VERBINDLICH: jede Ansicht, die „das Soll" braucht,
    // filtert `entfernt` SELBST heraus.
    const z = sollFuerFahrzeug(t.db, "rtw-1");
    expect(z.map((x) => x.id)).toEqual(["sp1", "sp2", "sp4", "sp3"]);
    expect(z.find((x) => x.id === "sp3")!.entfernt).toBe(true);
  });

  it("nennt fahrzeugBestand und handlagerBestand getrennt", () => {
    const z = sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp1")!;
    expect(z.fahrzeugBestand).toBe(5);
    expect(z.handlagerBestand).toBe(30);
  });

  it("K1: zaehlt handlagerBestand ueber den BEREICH (Wurzel + Schraenke), " +
     "nicht nur ueber die Wurzel", () => {
    // Bestand AUSSCHLIESSLICH in einem Schrank — die Wurzel (HANDLAGER_ID)
    // traegt fuer a2 KEINEN Bestand. Gebucht wird laengst ueber den Bereich
    // (`check.ts:223`, `vonOrten: handlagerOrte(tx)`); `handlagerBestand`
    // muss dieselbe Ortsmenge summieren wie der Buchungspfad — sonst zeigt
    // der Fahrzeug-Check "im Handlager 0", obwohl der Server denselben
    // Bestand anstandslos aus dem Schrank gebucht haette.
    t.db.insert(lagerorte).values(
      { id: "schrank-1", name: "Schrank 1", typ: "lager", aktiv: true,
        parentId: HANDLAGER_ID, sortierung: 10 }).run();
    t.db.insert(chargen).values(
      { id: "c2", artikelId: "a2", chargenNr: "CH2", verfall: "2030-01",
        createdAt: NOW }).run();
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a2", chargeId: "c2",
      lagerortId: "schrank-1", menge: 12, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null,
    }).run();
    // sp3 (Grabstein) traegt artikelId "a2" — bleibt trotzdem in der Liste.
    const z = sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp3")!;
    expect(z.handlagerBestand).toBe(12);
  });

  it("leitet die Herkunft aus templatePositionId und ueberschrieben ab", () => {
    const z = sollFuerFahrzeug(t.db, "rtw-1");
    expect(z.find((x) => x.id === "sp1")!.herkunft).toBe("vorlage");
    expect(z.find((x) => x.id === "sp2")!.herkunft).toBe("manuell");
    t.db.update(sollPositionen).set({ ueberschrieben: true })
      .where(eq(sollPositionen.id, "sp1")).run();
    expect(sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp1")!.herkunft)
      .toBe("ueberschrieben");
  });

  it("sortiert nach Fach, dann nach sort", () => {
    // sp2 (sort 1) und sp4 (sort 2) teilen sich "Fach 2" — nur hier greift der
    // `sort`-Tiebreaker tatsaechlich; bei durchweg verschiedenen Faechern
    // koennte auch eine reine Fach-Sortierung ohne Tiebreaker gruen bleiben.
    expect(sollFuerFahrzeug(t.db, "rtw-1").map((x) => x.fachLabel))
      .toEqual(["Fach 1", "Fach 2", "Fach 2", "Fach 3"]);
    expect(sollFuerFahrzeug(t.db, "rtw-1").map((x) => x.id))
      .toEqual(["sp1", "sp2", "sp4", "sp3"]);
  });

  it("ueberbrueckt einen geloeschten Artikel tolerant", () => {
    // Es gibt einen FK auf artikel.id — der Fall entsteht nur, wenn ein Import
    // Waisen mitbringt. Um ihn ueberhaupt zu erzeugen, wird der FK kurzzeitig
    // abgeschaltet: ohne echten Waisen waere jede Zusicherung „artikelName ist
    // ein String" trivial wahr, ganz gleich ob der Fallback existiert.
    t.sqlite.pragma("foreign_keys = OFF");
    t.db.insert(sollPositionen).values(
      { id: "sp-waise", fahrzeugId: "rtw-1", fachLabel: "Fach 9", sort: 9,
        artikelId: "gibtsnicht", soll: 1, templatePositionId: null,
        ueberschrieben: false, entfernt: false }).run();
    t.sqlite.pragma("foreign_keys = ON");
    const z = sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp-waise")!;
    expect(z.artikelName).toBe("–");
    expect(z.einheit).toBe("");
    expect(z.handlagerFach).toBe("");
  });
});

describe("die drei Vorlagen-Lesepfade (Festlegung H4)", () => {
  it("templateUebersicht zaehlt Positionen, Faecher und verknuepfte Fahrzeuge", () => {
    const l = templateUebersicht(t.db);
    // Aktive zuerst, ALPHABETISCH unter sich ("Basis-Vorlage" vor
    // "RTW-Vorlage"), dann die inaktiven.
    expect(l.map((x) => x.id)).toEqual(["tpl-basis", "tpl-rtw", "tpl-alt"]);
    expect(l.find((x) => x.id === "tpl-rtw"))
      .toMatchObject({ positionen: 1, faecher: 1, fahrzeuge: 2 });   // rtw-1 UND rtw-3
  });

  it("templateDetail nennt Positionen und verknuepfte Fahrzeuge", () => {
    const d = templateDetail(t.db, "tpl-rtw")!;
    expect(d.positionen.map((p) => p.id)).toEqual(["tp1"]);
    expect(d.positionen[0].artikelName).toBe("Verband");
    expect(d.positionen[0].handlagerFach).toBe("A1");
    // rtw-1 (aktiv) vor rtw-3 (inaktiv) — trotz umgekehrter Einfuegereihenfolge.
    expect(d.fahrzeuge.map((f) => f.id)).toEqual(["rtw-1", "rtw-3"]);
  });

  it("templateDetail liefert null fuer eine unbekannte ID", () => {
    expect(templateDetail(t.db, "gibtsnicht")).toBeNull();
  });

  it("templateListeAktiv liefert nur aktive, alphabetisch", () => {
    expect(templateListeAktiv(t.db)).toEqual([
      { id: "tpl-basis", name: "Basis-Vorlage" },
      { id: "tpl-rtw", name: "RTW-Vorlage" },
    ]);
  });
});

describe("fahrzeugListe", () => {
  it("liefert alle Lagerorte vom Typ fahrzeug, inklusive inaktiver und Taschen", () => {
    // ⚠️ DIE TASCHE IST DABEI, UND DAS IST DER PUNKT VON DRK-309: sie ist im
    // Modell ein `typ: "fahrzeug"`, damit jeder Schreib- und Lesepfad sie
    // erreicht. Eine Liste, die nach der ART filterte, waere die Rueckkehr zu
    // „Taschen gibt es nicht" — nur eine Ebene tiefer.
    expect(fahrzeugListe(t.db).map((f) => f.id).sort())
      .toEqual(["rtw-1", "rtw-2", "rtw-3", "rtw-4", "tasche-1"]);
  });

  it("reicht die Art durch, und `null` bleibt `null`", () => {
    const nachId = new Map(fahrzeugListe(t.db).map((f) => [f.id, f.einheitenart]));
    expect(nachId.get("rtw-1")).toBe("fahrzeug");
    expect(nachId.get("tasche-1")).toBe("tasche");
    // ⚠️ NICHT auf „fahrzeug" abgebildet, weil das der haeufigere Fall ist:
    // das machte aus einer offenen Frage still eine Antwort.
    expect(nachId.get("rtw-2")).toBeNull();
  });
});

describe("fahrzeugUebersicht — DRK-309: die Art reist bis in die Zeile", () => {
  it("traegt Fahrzeug, Tasche und den Zwischenstand unveraendert weiter", () => {
    const nachId = new Map(
      fahrzeugUebersicht(t.db, NOW).map((z) => [z.id, z.einheitenart]));
    expect(nachId.get("rtw-1")).toBe("fahrzeug");
    expect(nachId.get("tasche-1")).toBe("tasche");
    expect(nachId.get("rtw-2")).toBeNull();
  });

  it("nimmt die Tasche in die Uebersicht auf wie jede andere Einheit", () => {
    // Sie hat kein Soll und keinen Check — die Kennzahlen sind deshalb die
    // eines leeren Fahrzeugs, nicht „nicht vorhanden".
    const tasche = fahrzeugUebersicht(t.db, NOW).find((z) => z.id === "tasche-1")!;
    expect(tasche.positionen).toBe(0);
    expect(tasche.faecher).toBe(0);
    expect(tasche.letzterCheck).toBeNull();
  });
});
