// @vitest-environment jsdom
// src/app/m/radio/page.test.tsx
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * DIE WEICHE GATE-ODER-AUSLEIHE (Spec §3.3.5 Zeilen 2400-2419, §3.5.5 Zeile 2767,
 * §3.6.3 Zeilen 2914-2924).
 *
 * ⛔ WARUM DIE SEITENFUNKTION DIREKT GERUFEN WIRD UND NICHT ALS `<RadioGatePage />`
 * GEMOUNTET: sie ist eine ASYNC Server Component. `mount()` aus
 * `src/app/m/qr/_lib/test-dom.tsx` treibt eine solche nicht an — react-dom rendert kein
 * Promise —, und `redirect()` arbeitet ueber einen geworfenen Sentinel, der den
 * `next/navigation`-Mock braucht (Auflage `.superpowers/sdd/planteil3/briefs/A11.md:200-204`).
 *
 * ⚠️ DAS ERGEBNIS DES DIREKTEN AUFRUFS WIRD SEHR WOHL GEMOUNTET, und das ist die
 * Hauspraezedenz, kein Umweg um die Auflage: `src/app/m/lagerbuch/page.test.tsx:139`
 * schreibt `mount(await GatePage({ searchParams: Promise.resolve(sp) }))` — die Funktion
 * wird DIREKT gerufen, das fertige Element danach mit dem etablierten Harness gemountet.
 * Ein eigener Baumlaeufer waere das zweite Harness, das `CLAUDE.md` („Tests") ausdruecklich
 * verbietet.
 *
 * ⛔ WAS DIESE DATEI NICHT BELEGT: dass der Riegel bei einem ECHTEN Abruf GREIFT
 * (⬜ A-L9, Stand `e2e/radio-zugang.spec.ts:11-23`). Sie belegt die LOGIK der Weiche.
 * Kein Fall hier darf etwas anderes behaupten.
 */

/*
 * ⚠️ NICHT DER PROD-HOST. `core/registry.ts` fuehrt fuer `radio` keine `prodHosts`; der
 * Host, unter dem der Zweig faehrt, ist `radio.localtest.me` — dieselbe Konstante, die
 * `_lib/ausleihZugang.test.ts:39` schon fuehrt.
 */
/** Der Dateitext, den der Bauform-Scan am Ende dieser Datei liest. */
const QUELLE = "src/app/m/radio/page.tsx";

const HOST = "radio.localtest.me";
const ABSENDER = "203.0.113.7";

/*
 * ⛔ DIE VIER SAETZE STEHEN HIER AUSGESCHRIEBEN und werden NICHT aus `_lib/gateTexte.ts`
 * importiert: sonst richtete sich die Zusicherung gegen ein selbstgebautes Literal und
 * koennte konstruktiv nie fehlschlagen (dieselbe Form wie
 * `src/app/m/lagerbuch/page.test.tsx:59-66`). Quelle: Spec:2382-2385.
 */
const SATZ_CODE = "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.";
const SATZ_ZUVIELE_42 = "Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.";
const SATZ_ZUVIELE_OFFEN = "Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.";

const hostRiegel = vi.fn();
const kopfzeilenGelesen = vi.fn();
const umleitungen: string[] = [];
let kopfzeilen: Headers;

vi.mock("next/headers", () => ({
  headers: async () => {
    kopfzeilenGelesen();
    return kopfzeilen;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    umleitungen.push(ziel);
    throw new Error("NEXT_REDIRECT");
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

/*
 * ⛔ `_db/client` WIRD GEMOCKT, weil `getDb()` sonst eine echte Moduldatenbank oeffnete.
 * `getModuleDb`s Cache ist per MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR`
 * (`src/core/db/index.ts:31-35`) — ein Testlauf verbaende sich hier mit der Datei des
 * Entwicklungsstands (KONTEXT.md:95-97). Die Weiche interessiert nur, DASS das Handle
 * durchgereicht wird.
 */
const dbAttrappe = { attrappe: "radio-db" };
vi.mock("./_db/client", () => ({ getDb: () => dbAttrappe }));

vi.mock("./_lib/ausleihZugang", () => ({ ausleihZugangOderNull: vi.fn() }));

/*
 * ⚠️ `gateFehlversuchBuchen` WIRFT: die Gate-SEITE liest die Schranke nur. Der Wurf ist die
 * laute Absicherung, `not.toHaveBeenCalled()` unten die leise — dieselbe Doppelung wie in
 * `src/app/m/lagerbuch/page.test.tsx:97-100`. Ohne sie machte das blosse Neuladen des Gates
 * jeden Aufruf zu einem Fehlversuch, und eine gesperrte Person kaeme durch Warten nie
 * wieder herein.
 */
vi.mock("./_lib/gateSchranke", () => ({
  gateGesperrt: vi.fn(),
  gateFehlversuchBuchen: vi.fn(() => {
    throw new Error("Die Gate-SEITE darf NICHT buchen");
  }),
}));

vi.mock("./_lib/host", async (echt) => ({
  ...(await echt<typeof import("./_lib/host")>()),
  requireRadioHost: (h: Headers) => hostRiegel(h),
}));

/*
 * ⚠️ DIE INSEL WIRD DURCH EINE ATTRAPPE ERSETZT, die ihre zwei Props als Attribute an den
 * GERENDERTEN Baum haengt — eine Zusage ueber das gerenderte Ergebnis gehoert an den Baum,
 * nicht an den Dateitext (Vorbild `src/app/m/lagerbuch/page.test.tsx:102-118`). Die Insel
 * selbst ist `"use client"` mit `useActionState`; ihr Verhalten ist nicht die Aussage
 * dieser Datei.
 *
 * ⚠️ `_lib/gateTexte.ts` und `_lib/returnTo.ts` bleiben ECHT. Nur so pruefen die Faelle
 * unten den WIRKLICHEN Satz und die WIRKLICHE Ablehnung eines fremden Ziels statt einer
 * selbst gesetzten Attrappe.
 */
vi.mock("./_ui/GateFormular", () => ({
  GateFormular: (p: { fehlerText: string | null; returnTo: string }) => (
    <div data-rolle="gate-formular" data-meldung={p.fehlerText ?? ""} data-returnto={p.returnTo} />
  ),
}));

import { ausleihZugangOderNull } from "./_lib/ausleihZugang";
import { gateGesperrt, gateFehlversuchBuchen } from "./_lib/gateSchranke";
import RadioGatePage, { dynamic } from "./page";
import { ohneKommentare } from "./_lib/quelltextScan";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";

beforeEach(() => {
  kopfzeilen = new Headers({ host: HOST, "cf-connecting-ip": ABSENDER });
  umleitungen.length = 0;
  vi.mocked(ausleihZugangOderNull).mockResolvedValue(null);
  vi.mocked(gateGesperrt).mockReturnValue(null);
});
afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

async function rendere(sp: Record<string, string> = {}): Promise<void> {
  await mount(await RadioGatePage({ searchParams: Promise.resolve(sp) }));
}

/** Der Wert, den die Seite an die Insel reicht — `""`, wenn es keinen Satz gibt. */
function meldungAusBaum(): string {
  return query('[data-rolle="gate-formular"]').getAttribute("data-meldung") ?? "";
}

describe("das Gate an /", () => {
  it("ohne Zugang rendert das Codefeld und leitet NICHT um", async () => {
    /*
     * DER REGELFALL DIESER SEITE (Spec:2407, Zeile „gesperrt, auf der Gate-Weiche"): das
     * Praedikat `ausleihZugangOderNull` leitet NICHT um und loescht NICHTS. Ein
     * `redirect()` an dieser Stelle machte aus der Weiche einen Werfer, und ein gesperrter
     * Code liefe in eine 303-Runde statt ins Codefeld.
     */
    await rendere();

    expect(exists('[data-rolle="gate-formular"]')).toBe(true);
    expect(umleitungen).toEqual([]);
    expect(vi.mocked(ausleihZugangOderNull)).toHaveBeenCalledWith(dbAttrappe);
  });

  it("mit Zugang leitet sie auf /geraete um", async () => {
    /*
     * ENTSCHEIDUNG E1 (`.superpowers/sdd/planteil3/briefs/KOPF.md:416-443`): die Uebersicht
     * liegt an `/geraete`, nicht an `/`. Ein `redirect("/")` waere die Schleife auf diese
     * Seite selbst.
     *
     * ⚠️ DER WURF IST DER ERWARTETE AUSGANG: `redirect()` arbeitet ueber einen geworfenen
     * Sentinel. Der Fall faengt ihn HIER — ein `try`/`catch` in `page.tsx` selbst
     * verschluckte die Weiterleitung still (Bauform-Zulaessigkeitstafel Zeile 6).
     */
    vi.mocked(ausleihZugangOderNull).mockResolvedValue({
      weg: "code",
      codeId: "z-1",
      bezeichnung: "Aufsteller Funkraum",
      laeuftAb: new Date("2026-08-23T20:00:00Z"),
    });

    await expect(rendere()).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/geraete"]);
  });

  it("liest die Kopfzeilen genau einmal", async () => {
    /*
     * ⛔ KEIN ZWEITER HOST-RIEGEL UND KEINE ZWEITE LESUNG (Pflicht 16,
     * `docs/radio-portierung-analyse.md:973-977`; Testauftrag Spec:3092). `page.tsx` ruft
     * `requireRadioHost` ZUSAETZLICH zum Praedikat — das ist die eine angeordnete Ausnahme
     * (`_lib/ausleihZugang.ts:104-113`) —, aber sie liest die Kopfzeilen dafuer EINMAL und
     * reicht dasselbe Objekt an `clientIpAus` weiter. Ein zweites `await headers()` waere
     * hier unsichtbar und in der Vorbildform gar nicht messbar.
     *
     * ⚠️ Das Praedikat ist gemockt; seine EIGENE, interne Lesung faellt hier also nicht ins
     * Gewicht. Gemessen wird genau, was `page.tsx` selbst tut.
     */
    await rendere({ grund: "zuviele" });

    expect(kopfzeilenGelesen).toHaveBeenCalledTimes(1);
    expect(hostRiegel).toHaveBeenCalledTimes(1);
    expect(hostRiegel).toHaveBeenCalledWith(kopfzeilen);
  });

  it("jede Suite-Sitzung wird ebenso nach /geraete geleitet, auch eine verwaltende", async () => {
    /*
     * ⛔ DER FALL, DEN ES WIRKLICH GIBT — und er ersetzt den unmoeglichen Fall darueber.
     * `befund` gibt JEDER Suite-Sitzung `{ weg: "suite" }`, OHNE jede Gruppenpruefung
     * (`_lib/ausleihZugang.ts:148-152`, Auflage 5 `:138-143`). Eine verwaltende Person ist
     * damit KEIN eigener Zustand dieser Seite: sie wird wie jede andere angemeldete Person
     * behandelt und landet auf `/geraete`. Der Weg in die Verwaltung entsteht DORT, im Kopf
     * der Ausleihflaeche — der Bestand verortet ihn selbst so (`_lib/zugang.ts:505-507`:
     * „am /admin-Link der Ausleihflaeche").
     *
     * ⚠️ DIESER FALL IST VON ANFANG AN GRUEN, und das steht hier ausgeschrieben statt
     * verschwiegen: er ist ein Rueckfallwaechter, kein Nachweis einer neuen Zeile. Rot wird
     * er, wenn `if (zugang) redirect("/geraete")` in `page.tsx:76` faellt.
     */
    vi.mocked(ausleihZugangOderNull).mockResolvedValue({
      weg: "suite",
      sub: "u-1",
      name: "Anna",
    });

    await expect(rendere()).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/geraete"]);
  });

  it("zeigt einem anonymen Besucher KEINEN Weg in die Verwaltung", async () => {
    /*
     * §4.9.6 (Spec:3919-3922) am gerenderten BAUM, nicht am Dateitext: „ein sichtbarer Weg
     * dorthin, wo die aufrufende Person nicht hindarf, verletzt die Gegenprobe"
     * (`docs/design/README.md:420`). Zeichengleiche Form wie der Bestandswaechter
     * `(ausleihe)/geraete/page.test.tsx:419-421`.
     *
     * ⛔ DIE ZUSICHERUNG LIEST `href`, NICHT `data-rolle`: ein Verwaltungsweg unter einem
     * anderen Etikett waere derselbe Ausfall, und ein Scan auf `gate-admin` allein saehe ihn
     * nicht. ⛔ UND `*=`, NICHT `^=` — zeichengleich zum Bestandswaechter: ein Praefix-
     * Vergleich uebersaehe die innere Pfadform `/m/radio/admin/…`. Die zweite Zeile haelt
     * den Fall gegen leeres Gruen — ohne sie bestuende ihn auch eine Seite, die gar nichts
     * rendert.
     */
    await rendere();

    expect(queryAll('a[href*="/admin"]')).toHaveLength(0);
    expect(exists('[data-rolle="gate-formular"]')).toBe(true);
  });

  it("ein unbekannter grund erzeugt keine Meldung, ein bekannter sehr wohl", async () => {
    /*
     * ⛔ KEIN RUECKFALLTEXT (Spec:2396-2398, woertlich: „Ein ‚Etwas ist schiefgelaufen' auf
     * einer Seite, auf der nichts schiefgelaufen ist, ist schlechter als Schweigen").
     *
     * ⛔ DIE ZWEITE HAELFTE IM SELBEN FALL, und sie ist der Grund, warum er etwas belegt:
     * eine Abwesenheitspruefung allein bliebe gruen, wenn `gateMeldung` IMMER `null`
     * lieferte. Der bekannte Grund zeigt, dass der Weg ueberhaupt einen Satz transportiert.
     */
    await rendere({ grund: "gibtsnicht" });
    expect(meldungAusBaum()).toBe("");
    await unmount();

    await rendere({ grund: "code" });
    expect(meldungAusBaum()).toBe(SATZ_CODE);
  });

  it("bei grund=zuviele fragt die Seite die Schranke selbst, mit dem Absender aus den Kopfzeilen", async () => {
    /*
     * ⛔ DER GRUND WANDERT UEBER DIE URL, DIE ZAHL NICHT (Spec:2391-2394). Die Seite hat
     * DIESELBEN Absender-Kopfzeilen wie die eben abgewiesene Anfrage und fragt die Schranke
     * mit demselben Schluessel. Eine Zahl aus der URL waere beim ersten Neuladen gelogen
     * und obendrein Nutzereingabe.
     *
     * ⛔ DER FALL PRUEFT DIE ZAHL, NICHT NUR „ein Satz erscheint" — sonst bliebe er gruen,
     * wenn `gateGesperrt` gar nicht gerufen wuerde: `gateMeldung("zuviele", null)` liefert
     * dann den Satz OHNE Zahl (`_lib/gateTexte.ts:90`), und die Abwesenheit der Zahl waere
     * die einzige Spur. Deshalb steht der 42er-Satz WOERTLICH da, dazu der Aufruf mit dem
     * Absender und die Gegenprobe mit offener Schranke.
     */
    vi.mocked(gateGesperrt).mockReturnValue(42);

    await rendere({ grund: "zuviele" });

    expect(vi.mocked(gateGesperrt)).toHaveBeenCalledWith(ABSENDER);
    expect(meldungAusBaum()).toBe(SATZ_ZUVIELE_42);
    await unmount();

    // Gegenprobe: offene Schranke -> derselbe Grund, der Satz OHNE Zahl.
    vi.mocked(gateGesperrt).mockReturnValue(null);
    await rendere({ grund: "zuviele" });
    expect(meldungAusBaum()).toBe(SATZ_ZUVIELE_OFFEN);
  });

  it("fragt die Schranke NUR bei zuviele und bucht nie einen Fehlversuch", async () => {
    /*
     * Zwei Zusagen in einem Fall, weil sie dieselbe Zeile bewachen. `gateMeldung` ignoriert
     * `sperrSekunden` fuer jeden anderen Text (`_lib/gateTexte.ts:105`); ein Aufruf der
     * Schranke bei JEDEM Gate-Abruf waere Arbeit ohne Wirkung. Und ein
     * `gateFehlversuchBuchen` hier machte das blosse Neuladen zu einem Fehlversuch — die
     * Attrappe wirft deshalb, zusaetzlich zur leisen Zusicherung.
     */
    await rendere({ grund: "code" });

    expect(vi.mocked(gateGesperrt)).not.toHaveBeenCalled();
    expect(vi.mocked(gateFehlversuchBuchen)).not.toHaveBeenCalled();
  });

  it("reicht ein lokales returnTo weiter und verwirft ein fremdes Ziel", async () => {
    /*
     * ⛔ `?returnTo=` GEHOERT AUF DIESE SEITE: `t/[code]/route.ts:92-100` schreibt ihn auf
     * die Gate-URL und schreibt daneben „⛔ DAS GATE LIEST IHN (Spec:2400-2419)". Ohne die
     * Weitergabe faellt das gescannte Regaletikett zwischen Handeingabe und Weiterleitung
     * still auf den Boden.
     *
     * ⛔ UND ER GEHT DURCH `sanitizeReturnTo` (`_lib/returnTo.ts:52-60`): der Wert landet
     * ueber `einloesenAmGate` in einem `Location`-Kopf, wo keine React-Entkommung schuetzt
     * (Spec:2417-2419). `//boese.example` ist protokoll-relativ und damit cross-origin.
     */
    await rendere({ returnTo: "/geraete?geraete=g-1" });
    expect(query('[data-rolle="gate-formular"]').getAttribute("data-returnto")).toBe(
      "/geraete?geraete=g-1",
    );
    await unmount();

    await rendere({ returnTo: "//boese.example/uebernahme" });
    expect(query('[data-rolle="gate-formular"]').getAttribute("data-returnto")).toBe("");
  });

  it("ist force-dynamic", async () => {
    /*
     * Die Seite liest Cookies und Kopfzeilen; ein statisch vorgerendertes Gate zeigte allen
     * dieselbe Antwort — dieselbe Sitzung, derselbe Sperrsatz, derselbe Verwaltungslink.
     * §4.7 (Spec:3827) setzt dasselbe fuer die drei Ausleihseiten.
     */
    expect(dynamic).toBe("force-dynamic");
  });
});

/*
 * DIE BAUFORM DES GATES — der Quelltext-Scan gegen die Rueckkehr des entfernten
 * Verwaltungszweiges.
 *
 * ⛔ WARUM UEBERHAUPT EIN SCAN UND NICHT NUR EIN BAUMFALL: der Zweig war
 * `darfVerwalten && …` — er rendert nichts, solange das Praedikat falsch ist. Ein Baumfall
 * ueber der anonymen Seite bliebe also gruen, wenn ihn jemand woertlich wieder einsetzte.
 * Rot wird nur eine Zusicherung ueber dem DATEITEXT. Hausform:
 * `src/app/m/lagerbuch/page.test.tsx:345-360`.
 *
 * ⛔ ER LAEUFT UEBER `ohneKommentare`, NICHT UEBER `bereinigt` (`_lib/quelltextScan.ts:61`
 * bzw. `:126`). `bereinigt` leert zusaetzlich Zeichenkettenliterale — und
 * `data-rolle="gate-admin"` IST eines. Die negative Zusicherung waere damit STILL gruen,
 * genau die Richtung, vor der der Kopf jener Datei warnt („weniger Text heisst weniger
 * gefundene Verstoesse", `_lib/quelltextScan.ts:95-101`).
 *
 * ⚠️ WAS ER NICHT LEISTET, UND WARUM DAS HIER STEHT statt in einem Wort wie „dauerhaft"
 * (Fix-Runde 1 zu L2, Fund K1). GEMESSEN (Sonde M-1): ein Zweig unter ANDEREN Namen —
 * `data-rolle="gate-pflege"` und `href="/m/radio/admin/geraete"`, hinter einer Bedingung, die
 * im Test nie wahr wird — lief durch ALLE elf Faelle. Er rendert nichts, also sieht ihn der
 * Baumfall nicht, und er traegt keinen der drei benannten Namen, also sah ihn der Scan nicht.
 * Dagegen steht seit dieser Runde das VIERTE, klassenweite Verbot unten.
 *
 * ⛔ AUCH DAS FAENGT NICHT ALLES: ein `redirect()` in den Verwaltungsbereich oder ein Weg
 * unter einer Adresse OHNE `/admin` kaeme weiter durch. Dieser Block ist ein
 * Rueckfallwaechter fuer die gemessene Klasse, kein Beweis der Abwesenheit.
 */
describe("Bauform des Gates", () => {
  const quelle = () => ohneKommentare(readFileSync(QUELLE, "utf8"));

  it("traegt keinen Verwaltungszweig — er war tot durch Konstruktion", () => {
    /*
     * ⛔ ZUERST DIE LEER-GRUEN-PROBE, DANN DIE VERBOTE. Liefe der Scan ins Leere — falscher
     * Pfad, leere Datei —, waere JEDES `not.toMatch` darunter still wahr. Dieselbe Lehre,
     * die L1 in `_lib/zugang.test.ts` gemessen hat: die Probe ist dort rot geworden, nicht
     * bloss behauptet.
     */
    expect(quelle(), "der Scan liest nichts — jedes Verbot darunter waere leer-gruen")
      .not.toBe("");
    expect(quelle(), "der Scan liest nicht das Gate — die Weiche fehlt im Text")
      .toMatch(/ausleihZugangOderNull\s*\(/);

    /*
     * ⛔ ZUERST DIE BENANNTEN SPUREN. Der Zweig bestand aus genau diesen dreien
     * (`page.tsx:125-126` und `:151-157`, Stand vor dieser Aufgabe). Sie stehen EINZELN da
     * und nicht als eine Alternative, damit die Fehlermeldung sagt, WELCHE Haelfte
     * zurueckgekommen ist.
     *
     * ⚠️ DAS VERBOT VON `istRadioVerwaltung(` IST EINE FOLGE VON §2.10 DER MESSUNG, KEINE
     * SPEC-REGEL. Der Betreiber hat am 2026-08-27 entschieden, WER den Link sieht — beide
     * Rechtestufen, `KONTEXT.md:24-33` —, NICHT wo er wohnt; dass er nicht ans Gate gehoert,
     * sagt `BERICHT-urls-und-adminzugang.md` §2.10. Wer §2.10 ueberstimmt, aendert diesen
     * Fall MIT: er ist kein Einspruch des Betreibers, sondern eine Bau-Entscheidung.
     *
     * ⛔ DIE PRAEDIKATSLISTE FUEHRT SEIT DER FIX-RUNDE 1 AUCH `istRadioUpdater(` UND
     * `viewerAusSession(`: die Sonde P-4 der Pruefung kam mit
     * `istRadioUpdater(viewerAusSession(await auth()))` an den frueheren zwei Namen vorbei
     * — derselbe Zweig, nur ohne die verbotenen Woerter.
     */
    expect(quelle(), "das Etikett des toten Gate-Links ist zurueck (Bericht §2.10)")
      .not.toMatch(/gate-admin/);
    expect(quelle(), "ein Verwaltungs-Praedikat auf dem Gate — es kann hier nie wahr werden")
      .not.toMatch(
        /\bistRadioAdmin\s*\(|\bistRadioVerwaltung\s*\(|\bistRadioUpdater\s*\(|\bviewerAusSession\s*\(/,
      );
    expect(quelle(), "`viewerOderNull(` auf dem Gate — die Sitzung entscheidet hier nichts")
      .not.toMatch(/\bviewerOderNull\s*\(/);

    /*
     * ⛔ UND DAS NETZ DARUNTER: KEIN WEG NACH `/admin` IM RUMPF — unter welchem Etikett und
     * hinter welchem Praedikat auch immer. Die drei Verbote darueber treffen die Klasse nur
     * stichprobenhaft; dieses trifft sie.
     *
     * ⚠️ ES IST KEINE DOPPELUNG DES BAUMFALLS „zeigt einem anonymen Besucher KEINEN Weg in
     * die Verwaltung". Jener misst das GERENDERTE Ergebnis und bleibt gruen, solange der
     * Zweig nichts ausgibt — genau die Lage der Sonde M-1. Dieser misst den DATEITEXT und
     * wird dort rot. Gegenprobe gefahren, `1 rot` und zwar nur dieser.
     */
    expect(quelle(), "ein Weg nach /admin im Gate-Rumpf — er gehoert in die Ausleihflaeche")
      .not.toMatch(/\/admin/);
  });
});
