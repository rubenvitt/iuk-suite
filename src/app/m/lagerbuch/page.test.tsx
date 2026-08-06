// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const QUELLE = "src/app/m/lagerbuch/page.tsx";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). `bauform.test.ts` exportiert sie nicht, und dies ist
 * ein anderer Testkoerper — deshalb die zeichengleiche lokale Kopie statt eines
 * Re-Exports, genau wie `_lib/pwaIcons.test.ts`,
 * `_lib/schreibpfade/tokenEinloesung.test.ts`, `_ui/rahmen.test.tsx` und
 * `_ui/Gate.test.tsx` es halten.
 *
 * ⚠️ OHNE SIE IST DER SCAN „benutzt `istLagerbuchAdmin`, NICHT
 * `requireLagerbuchAdmin`" DETERMINISTISCH ROT (Befund 45 des Preflight-Scans).
 * `page.tsx` schreibt den Satz „`requireLagerbuchAdmin()` waere hier falsch" in
 * ihren Begruendungskommentar, weil §3.2.1 genau das konserviert haben will. Die
 * naheliegende „Reparatur" waere, den Kommentar zu loeschen — also genau die
 * Begruendung, um die es geht.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/*
 * ⚠️ NICHT der im Plan abgedruckte Prod-Host (B-1 der Regeldatei, Befund 14).
 * `lagerbuch.iuk-ue.de` ist weder Prod-Host (`core/registry.ts:103-105` ist
 * bewusst leer) noch der E2E-Host, und der reparierte Dev-Login weist einen
 * absoluten `callbackUrl` ab, der nicht die eigene Origin trifft. Die Form hier
 * ist die, unter der T87 tatsaechlich faehrt: `lagerbuch.localtest.me`
 * (`e2e/helpers/lagerbuch.ts:17`) auf Port 3100 (`playwright.config.ts:108`) —
 * dieselbe Konstante, die `_ui/Gate.test.tsx` (T77) schon fuehrt.
 */
const HOST = "lagerbuch.localtest.me:3100";
const LOGIN_VERWALTUNG =
  "/login?callbackUrl=http%3A%2F%2Flagerbuch.localtest.me%3A3100%2Fverwaltung";
const LOGIN_ARTIKEL =
  "/login?callbackUrl=http%3A%2F%2Flagerbuch.localtest.me%3A3100%2Fa%2Fart-9";

/*
 * Die vier Saetze stehen hier AUSGESCHRIEBEN und werden NICHT aus
 * `_lib/gateTexte.ts` importiert: sonst waere die Zusicherung gegen ein
 * selbstgebautes Literal gerichtet und koennte konstruktiv nie fehlschlagen.
 */
const SATZ_CODE = "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.";
const SATZ_ZUVIELE_42 = "Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.";
const SATZ_ZUVIELE_OFFEN = "Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.";

const VIEWER = { sub: "u1", groups: [] as string[], name: null, email: null };

let kopfzeilen = new Headers({ host: HOST });
const umleitungen: string[] = [];

vi.mock("next/headers", () => ({ headers: async () => kopfzeilen }));
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { umleitungen.push(ziel); throw new Error("NEXT_REDIRECT"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

/*
 * `_lib/zugang.ts` zieht `@/core/auth` und `../_db/client` nach — beides gehoert
 * nicht in diese Aussage. GEMOCKT WIRD ES VOLLSTAENDIG, mit einer Ausnahme von
 * der Bequemlichkeit: `verwaltungsZiel` bekommt eine Attrappe, die ihr Ergebnis
 * AUS DEN KOPFZEILEN ableitet — genau wie die eingecheckte Funktion
 * (`_lib/zugang.ts:205-213`). Ein Aufruf ohne Argument (so druckt der Plan ihn
 * ab, Befund 25) liefe hier in einen TypeError statt still an der Attrappe
 * vorbei.
 *
 * ⚠️ `gateFehlversuchBuchen` WIRFT: die Gate-Seite liest nur. Der Wurf ist die
 * laute Absicherung, `not.toHaveBeenCalled()` unten die leise.
 */
vi.mock("./_lib/zugang", () => ({
  viewerOderNull: vi.fn(),
  istLagerbuchAdmin: vi.fn(),
  adminLandingPfad: vi.fn(),
  verwaltungsZiel: vi.fn(),
}));
vi.mock("./_lib/gateSchranke", () => ({
  gateGesperrt: vi.fn(),
  gateFehlversuchBuchen: vi.fn(() => { throw new Error("Die Gate-SEITE darf NICHT buchen"); }),
}));

/*
 * Die Insel wird durch eine Attrappe ersetzt, die ihre drei Props als Attribute
 * an den GERENDERTEN Baum haengt (N-8: eine Zusage ueber das gerenderte Ergebnis
 * gehoert an den Baum, nicht an den Dateitext). `_ui/OeffentlicherRahmen.tsx`
 * bleibt ECHT — nur so ist pruefbar, dass die Insel INNERHALB von `.rahmen`
 * haengt, dem Traeger aller `--lb-*`-Variablen.
 */
vi.mock("./_ui/Gate", () => ({
  Gate: (p: { meldung: string | null; returnTo: string; verwaltungsLink: string }) => (
    <div
      data-rolle="gate"
      data-meldung={p.meldung ?? ""}
      data-returnto={p.returnTo}
      data-verwaltung={p.verwaltungsLink}
    />
  ),
}));

import {
  viewerOderNull, istLagerbuchAdmin, adminLandingPfad, verwaltungsZiel,
} from "./_lib/zugang";
import { gateGesperrt, gateFehlversuchBuchen } from "./_lib/gateSchranke";
import GatePage from "./page";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";

beforeEach(() => {
  kopfzeilen = new Headers({ host: HOST });
  umleitungen.length = 0;
  vi.mocked(viewerOderNull).mockResolvedValue(null);
  vi.mocked(istLagerbuchAdmin).mockReturnValue(false);
  vi.mocked(adminLandingPfad).mockImplementation((r) => (r ? `ADMIN:${r}` : "ADMIN:/verwaltung"));
  vi.mocked(verwaltungsZiel).mockImplementation((h) => `http://${h.get("host")}/verwaltung`);
  vi.mocked(gateGesperrt).mockReturnValue(null);
});
afterEach(async () => { await unmount(); vi.clearAllMocks(); });

async function rendere(sp: Record<string, string> = {}): Promise<void> {
  await mount(await GatePage({ searchParams: Promise.resolve(sp) }));
}

describe("Gate-Seite — die bindende Reihenfolge (§7.2.4)", () => {
  it("Schritt 1: der Host-Riegel ist die ERSTE Anweisung", async () => {
    kopfzeilen = new Headers({ host: "feedback.localtest.me" });
    await expect(GatePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    // Weder die Sitzung noch die Schranke wurden gefragt. Ohne diese beiden
    // Zeilen bliebe der Test auch dann gruen, wenn der Riegel als LETZTE
    // Anweisung stuende — er wuerfe ja weiterhin.
    expect(viewerOderNull).not.toHaveBeenCalled();
    expect(gateGesperrt).not.toHaveBeenCalled();
  });

  it("Schritt 2: ein Admin wird umgeleitet — mit `returnTo`, und VOR der Schranke", async () => {
    vi.mocked(viewerOderNull).mockResolvedValue(VIEWER);
    vi.mocked(istLagerbuchAdmin).mockReturnValue(true);
    await expect(GatePage({ searchParams: Promise.resolve({ returnTo: "/a/art-9" }) }))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["ADMIN:/a/art-9"]);
    // Das Ziel kommt aus `adminLandingPfad` und wird NICHT hier gebaut (§3.6.6):
    // ein festverdrahtetes "/verwaltung" verloere das gescannte Regaletikett.
    expect(adminLandingPfad).toHaveBeenCalledWith("/a/art-9");
    // Das Praedikat bekommt den Viewer aus `viewerOderNull` — nicht `undefined`.
    expect(istLagerbuchAdmin).toHaveBeenCalledWith(VIEWER);
    // Die Weiche steht VOR der Schranke: ein Admin verbraucht keinen Lookup.
    expect(gateGesperrt).not.toHaveBeenCalled();
  });

  it("eine Person OHNE Sitzung wird NICHT nach /login geworfen — Praedikat, kein Riegel", async () => {
    // `requireLagerbuchAdmin()` waere hier falsch: es wuerfe genau die
    // Helferin weg, fuer die diese Seite gebaut ist (§3.2.1). Drei gueltige
    // Faelle, nicht einer.
    await rendere();
    expect(umleitungen).toEqual([]);
    expect(query("[data-rolle='gate']")).toBeTruthy();
  });

  it("angemeldet OHNE Lagerbuch-Gruppe bleibt stehen und sieht BEIDE Karten", async () => {
    // Der hingenommene Preis aus §11.7.
    vi.mocked(viewerOderNull).mockResolvedValue(VIEWER);
    vi.mocked(istLagerbuchAdmin).mockReturnValue(false);
    await rendere();
    expect(umleitungen).toEqual([]);
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung")).toBe(LOGIN_VERWALTUNG);
  });

  it("die Insel haengt INNERHALB von `.rahmen` — dem Traeger aller `--lb-*`", async () => {
    // Saesse sie auf einem Geschwister, faenden die CSS-Variablen sie nicht, und
    // der Fehler waere STILL: eine nicht aufloesbare Variable ist gueltiges CSS
    // und faellt auf `transparent` zurueck (Falle 2).
    await rendere();
    const rahmen = query("div");
    expect(rahmen.className).toMatch(/rahmen/);
    expect(rahmen.contains(query("[data-rolle='gate']"))).toBe(true);
  });
});

describe("Gate-Seite — der Verwaltungslink wird SERVERSEITIG gebaut (§3.6.6)", () => {
  it("reicht `verwaltungsZiel` die KOPFZEILEN — die eingecheckte Signatur verlangt sie", async () => {
    // Befund 25: der Plan ruft `verwaltungsZiel()` ohne Argument; die Funktion
    // (`_lib/zugang.ts:205`) verlangt `headers: Headers` und leitet Protokoll,
    // Host und Port daraus ab.
    await rendere();
    expect(verwaltungsZiel).toHaveBeenCalledWith(kopfzeilen);
  });

  it("ohne `returnTo`: /login mit dem absoluten `verwaltungsZiel(kopf)`", async () => {
    // Das Ziel MUSS absolut und auf einen der Suite bekannten Host zeigen: ein
    // relatives `/m/lagerbuch/verwaltung` setzte die verwaltende Person auf dem
    // PORTAL-Host ab, weil AUTH_URL suiteweit derselbe Wert ist
    // (core/auth/redirect.ts:8-18).
    await rendere();
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung")).toBe(LOGIN_VERWALTUNG);
  });

  it("mit `returnTo`: das Rueckziel liegt auf DEMSELBEN Host — auch bei `http:`", async () => {
    /*
     * ⚠️ DER TEST, DER BEFUND 26 TRAEGT. Die im Plan abgedruckte Weiche fragt
     * `ziel.startsWith("https://")` und faellt sonst auf `/m/lagerbuch${sauber}`
     * zurueck. `verwaltungsZiel` liefert in Dev und E2E ein `http:`-Ziel
     * (`zugang.test.ts:265`), also griffe der Rueckfall AUCH DANN, wenn ein
     * gueltiger aeusserer Host bekannt ist — und schriebe den INNEREN Pfad in
     * den `callbackUrl`, waehrend der Browser auf dem Modul-Host steht.
     * `zugang.ts:176-179` hat genau diesen Rueckfall gestrichen.
     */
    await rendere({ returnTo: "/a/art-9" });
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung")).toBe(LOGIN_ARTIKEL);
  });

  it("und ebenso bei einem `https:`-Ziel — die Weiche ist protokollneutral", async () => {
    // Die Gegenprobe zum Test darueber: DER haelt den Dev-/E2E-Fall (`http:`),
    // DIESER den Zustand nach dem Cutover. Zusammen zeigen sie, dass die Weiche
    // an der ABSOLUTHEIT haengt und nicht an einem Protokollnamen.
    vi.mocked(verwaltungsZiel).mockReturnValue("https://lagerbuch.localtest.me/verwaltung");
    await rendere({ returnTo: "/a/art-9" });
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung"))
      .toBe("/login?callbackUrl=https%3A%2F%2Flagerbuch.localtest.me%2Fa%2Fart-9");
  });

  it("ein NICHT absolutes Ziel bleibt UNVERAENDERT — kein handgebauter innerer Pfad", async () => {
    /*
     * Der zweite Zweig von `verwaltungsZiel` (`_lib/zugang.ts:209`): weder
     * Prod-Host noch Lagerbuch-Host, also `/m/lagerbuch/verwaltung`. Hinter
     * `requireLagerbuchHost` ist der Zustand unerreichbar und ausdruecklich „der
     * DEFINIERTE, kein funktionierender Rueckweg". Die Seite baut daraus NICHTS
     * Eigenes: ein `/m/lagerbuch/a/art-9` waere genau der relative Rueckfall,
     * den `zugang.ts:176-179` gestrichen hat („KEIN RELATIVER RUECKFALL MEHR —
     * er trug nicht"), hier an einer zweiten Stelle neu erfunden.
     */
    vi.mocked(verwaltungsZiel).mockReturnValue("/m/lagerbuch/verwaltung");
    await rendere({ returnTo: "/a/art-9" });
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung"))
      .toBe("/login?callbackUrl=%2Fm%2Flagerbuch%2Fverwaltung");
  });

  it("ein feindliches `returnTo` faellt auf das Verwaltungsziel zurueck", async () => {
    await rendere({ returnTo: "//boese.example/x" });
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung")).toBe(LOGIN_VERWALTUNG);
  });

  it("nennt NIE einen literalen Prod-Host — das Ziel kommt aus den Kopfzeilen", async () => {
    // B-1 der Regeldatei: der im Plan abgedruckte
    // `https%3A%2F%2Flagerbuch.iuk-ue.de%2Fverwaltung` wird vom reparierten
    // Dev-Login abgewiesen und liesse T87 ins Leere laufen.
    kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
    await rendere();
    const link = query("[data-rolle='gate']").getAttribute("data-verwaltung") ?? "";
    expect(link).toBe("/login?callbackUrl=http%3A%2F%2Flagerbuch.localtest.me%2Fverwaltung");
    expect(link).not.toContain("iuk-ue.de");
  });
});

describe("Gate-Seite — der gelesene Fehlerparameter (Falle 60)", () => {
  it("`?grund=code` wird zum fertigen Satz", async () => {
    await rendere({ grund: "code" });
    expect(query("[data-rolle='gate']").getAttribute("data-meldung")).toBe(SATZ_CODE);
  });

  it("`?grund=zuviele` liest die Sekundenzahl SELBST aus der Schranke", async () => {
    // Sie steht NICHT in der URL: eine Zahl dort ist beim ersten Neuladen
    // gelogen, ein searchParams-Wert ist Nutzereingabe, und diese Seite hat
    // DIESELBEN Absender-Kopfzeilen wie die eben abgewiesene Anfrage.
    vi.mocked(gateGesperrt).mockReturnValue(42);
    await rendere({ grund: "zuviele" });
    expect(query("[data-rolle='gate']").getAttribute("data-meldung")).toBe(SATZ_ZUVIELE_42);
  });

  it("fragt die Schranke mit DEM Absenderschluessel aus den Kopfzeilen", async () => {
    // `absenderAus(kopf)` und kein Literal: mit einem festen Schluessel fragte
    // die Seite einen anderen Eimer als die Stelle, die die Sperre gesetzt hat,
    // und der Satz truege eine fremde Zahl.
    kopfzeilen = new Headers({ host: HOST, "cf-connecting-ip": "203.0.113.9" });
    vi.mocked(gateGesperrt).mockReturnValue(7);
    await rendere({ grund: "zuviele" });
    expect(gateGesperrt).toHaveBeenCalledWith("cf:203.0.113.9");
    expect(query("[data-rolle='gate']").getAttribute("data-meldung"))
      .toBe("Zu viele Fehlversuche. Bitte in 7 Sekunden erneut versuchen.");
  });

  it("ist die Sperre inzwischen abgelaufen, kommt der Satz OHNE Zahl", async () => {
    vi.mocked(gateGesperrt).mockReturnValue(null);
    await rendere({ grund: "zuviele" });
    expect(query("[data-rolle='gate']").getAttribute("data-meldung")).toBe(SATZ_ZUVIELE_OFFEN);
  });

  it("ein UNBEKANNTER Wert wird ignoriert, die Seite rendert normal", async () => {
    await rendere({ grund: "<script>" });
    expect(query("[data-rolle='gate']").getAttribute("data-meldung")).toBe("");
    expect(query("[data-rolle='gate']")).toBeTruthy();
  });

  it("die Seite BUCHT nichts — sie liest nur", async () => {
    // Ein Aufruf von `gateFehlversuchBuchen` machte das Neuladen des Gates zu
    // einem Fehlversuch, und eine gesperrte Person kaeme durch blosses Warten
    // nie wieder herein.
    await rendere({ grund: "zuviele" });
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
    expect(gateGesperrt).toHaveBeenCalledTimes(1);
  });
});

describe("Gate-Seite — returnTo", () => {
  it("wird sanitiert durchgereicht", async () => {
    await rendere({ returnTo: "/a/art-9" });
    expect(query("[data-rolle='gate']").getAttribute("data-returnto")).toBe("/a/art-9");
  });

  it("ein feindliches `returnTo` kommt als leerer String an", async () => {
    await rendere({ returnTo: "//boese.example/x" });
    expect(query("[data-rolle='gate']").getAttribute("data-returnto")).toBe("");
  });

  it("fehlt `returnTo` ganz, kommt ebenfalls der leere String an", async () => {
    await rendere();
    expect(query("[data-rolle='gate']").getAttribute("data-returnto")).toBe("");
  });
});

describe("Bauform", () => {
  /*
   * ⚠️ ALLE SCANS HIER LAUFEN UEBER `ohneKommentare()` (Regel 1, Befund 1 und
   * Befund 45). Der Rohtext von `page.tsx` enthaelt in seinen
   * Begruendungskommentaren woertlich `requireLagerbuchAdmin()`, `viewport` und
   * `process.env` — genau die Saetze, die §3.2.1 und §3.6.6 konservieren wollen.
   */
  const quelle = () => ohneKommentare(readFileSync(QUELLE, "utf8"));

  it("exportiert NUR `default` und `dynamic`", () => {
    const namen = [...quelle().matchAll(/^export (?:const|async function|function) (\w+)/gm)]
      .map((m) => m[1]);
    expect(namen).toEqual(["dynamic"]);
    expect(quelle()).toMatch(/^export default async function/m);
  });

  it("ist `force-dynamic` — sie liest Kopfzeilen und die Sitzung", () => {
    expect(quelle()).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("benutzt `istLagerbuchAdmin`, NICHT `requireLagerbuchAdmin`", () => {
    expect(quelle()).toMatch(/istLagerbuchAdmin/);
    expect(quelle()).not.toMatch(/requireLagerbuchAdmin|moduleAdminPageOrNotFound|isModuleAdmin/);
  });

  it("traegt KEINEN `viewport`-Export — der gehoert der Suite", () => {
    expect(quelle()).not.toMatch(/export const viewport/);
  });

  it("liest KEINE Env-Variable — der Host kommt aus `verwaltungsZiel(kopf)`", () => {
    // Ein `process.env.POCKET_ID_ISSUER` oder ein geratener Host waere eine
    // ZWEITE Antwort auf eine Frage, die `verwaltungsZiel()` (Teil 2, T23) und
    // die Suite-Anmeldeseite schon beantworten.
    expect(quelle()).not.toMatch(/process\.env/);
  });
});
