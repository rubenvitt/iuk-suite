// @vitest-environment jsdom
// src/app/m/radio/page.test.tsx
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
 * (⬜ A-L9, Erbe von Z-L1, `riegel.test.ts:50-55`). Sie belegt die LOGIK der Weiche.
 * Kein Fall hier darf etwas anderes behaupten.
 */

/*
 * ⚠️ NICHT DER PROD-HOST. `core/registry.ts` fuehrt fuer `radio` keine `prodHosts`; der
 * Host, unter dem der Zweig faehrt, ist `radio.localtest.me` — dieselbe Konstante, die
 * `_lib/ausleihZugang.test.ts:39` schon fuehrt.
 */
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

vi.mock("./_lib/zugang", () => ({ viewerOderNull: vi.fn(), istRadioAdmin: vi.fn() }));

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
import { viewerOderNull, istRadioAdmin } from "./_lib/zugang";
import RadioGatePage, { dynamic } from "./page";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

const VIEWER = { sub: "u-1", name: "Anna", groups: ["radio-admins"] };

beforeEach(() => {
  kopfzeilen = new Headers({ host: HOST, "cf-connecting-ip": ABSENDER });
  umleitungen.length = 0;
  vi.mocked(ausleihZugangOderNull).mockResolvedValue(null);
  vi.mocked(gateGesperrt).mockReturnValue(null);
  vi.mocked(viewerOderNull).mockResolvedValue(null);
  vi.mocked(istRadioAdmin).mockReturnValue(false);
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

  it("zeigt den admin-Link bei istRadioAdmin, und als Link statt als Redirect", async () => {
    /*
     * §3.6.3 Punkt 3 und 4 (Spec:2914-2924), NS-Z6. Spec §1.2.1 Zeile 277 sagt „ein
     * radio-admin wird nach `/admin` geleitet"; Punkt 3 sticht: „Ein `radio`-Admin bekommt
     * ueber `weg: "suite"` Zugang zur Ausleihe — nicht als Admin." Ein Redirect wuerfe eine
     * Person, die gerade ein Funkgeraet ausleihen will, aus der Ausleihe heraus.
     *
     * ⛔ UND ER HAENGT AM PRAEDIKAT: `istRadioAdmin(await viewerOderNull())`, nie
     * `requireRadioAdmin()` — der werfende Riegel schickte jeden anonymen Scan nach
     * `/login`.
     */
    vi.mocked(viewerOderNull).mockResolvedValue(VIEWER);
    vi.mocked(istRadioAdmin).mockReturnValue(true);

    await rendere();

    const link = query<HTMLAnchorElement>('[data-rolle="gate-admin"]');
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/admin");
    expect(umleitungen).toEqual([]);
    // Das Codefeld bleibt stehen — die Ausleihe ist auch fuer eine verwaltende Person der
    // Regelfall dieser Seite.
    expect(exists('[data-rolle="gate-formular"]')).toBe(true);
    expect(vi.mocked(istRadioAdmin)).toHaveBeenCalledWith(VIEWER);
  });

  it("zeigt den admin-Link NICHT ohne istRadioAdmin", async () => {
    /*
     * DIE ZWEITE HAELFTE, und ohne sie waere der Fall darueber halb-gruen: eine Seite, die
     * den Link IMMER zeigt, bestuende ihn. Spec:2917-2918 („zeigt nie einen Verwaltungsweg
     * an eine Person ohne `istRadioAdmin`").
     */
    vi.mocked(viewerOderNull).mockResolvedValue(VIEWER);
    vi.mocked(istRadioAdmin).mockReturnValue(false);

    await rendere();

    expect(exists('[data-rolle="gate-admin"]')).toBe(false);
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
     * ⛔ `?returnTo=` GEHOERT AUF DIESE SEITE: `t/[code]/route.ts:76-84` schreibt ihn auf
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
