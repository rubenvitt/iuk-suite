// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists, fill, submitForm } from "@/app/m/qr/_lib/test-dom";
import type { GateZustand } from "../_actions/gate";

/*
 * Die Action liegt hinter `"use server"` und zieht `next/headers`, die Schranke
 * und die Datenbank nach. Hier interessiert ausschliesslich, WAS DIE INSEL AUS
 * IHRER ANTWORT MACHT — Erfolg (Redirect), Abweisung, Verbindungsabbruch.
 */
vi.mock("../_actions/gate", () => ({ einloesenAmGate: vi.fn() }));
import { einloesenAmGate } from "../_actions/gate";

import { Gate } from "./Gate";

const QUELLE = "src/app/m/lagerbuch/_ui/Gate.tsx";

/*
 * ⚠️ NICHT der im Plan abgedruckte Prod-Host (B-1 der Regeldatei). Der
 * Dev-Login der Suite nimmt einen absoluten `callbackUrl` nur an, wenn er die
 * EIGENE Origin trifft; `lagerbuch.iuk-ue.de` ist weder Prod-Host (in
 * `core/registry.ts:103-105` bewusst leer) noch der E2E-Host. Das hier ist der
 * ERSTE Zweig von `verwaltungsZiel` (`_lib/zugang.ts:205-213`) unter den
 * Bedingungen, unter denen T87 tatsaechlich faehrt: `lagerbuch.localtest.me`
 * (`e2e/helpers/lagerbuch.ts:17`) auf Port 3100 (`playwright.config.ts:108`).
 */
const LOGIN = "/login?callbackUrl=http%3A%2F%2Flagerbuch.localtest.me%3A3100%2Fverwaltung";

/*
 * Der ZWEITE Zweig derselben Funktion: kein Prod-Host UND kein Lagerbuch-Host,
 * also der innere Pfad `/m/lagerbuch/verwaltung` (`_lib/zugang.ts:209`). Er
 * steht hier, damit der Durchreich-Test zwei ECHTE Formen vergleicht statt einer
 * willkuerlichen zweiten Zeichenkette.
 */
const LOGIN_INNEN = "/login?callbackUrl=%2Fm%2Flagerbuch%2Fverwaltung";

/*
 * ⚠️ URSACHENNEUTRAL, und das ist die Zusage (Review-Befund 1, Fix-Runde 1). Das
 * `catch` der Insel faengt DREI Lagen — Verbindungsabbruch, Host-Wurf und jede
 * echte Serverausnahme (fehlendes `LAGERBUCH_HELFER_SITZUNG_SECRET`,
 * `SQLITE_READONLY`). Eine Netzdiagnose waere fuer zwei davon die falsche
 * Auskunft. Der Satz steht hier AUSGESCHRIEBEN und wird NICHT aus der Insel
 * importiert: sonst waere die Zusicherung gegen ein selbstgebautes Literal
 * gerichtet und koennte konstruktiv nie fehlschlagen.
 */
const AUSNAHME_SATZ =
  "Der Code konnte nicht geprüft werden. Bitte noch einmal auf Weiter tippen — " +
  "bleibt es dabei, wende dich an die Leitung.";
const URL_SATZ = "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). Ohne sie waeren die Negativ-Scans unten auf ihrer
 * EIGENEN Begruendung rot: `Gate.tsx` nennt in seinem Kopfkommentar woertlich
 * `signIn("oidc", …)`, `core/auth/devLogin.ts:14` und `callbackUrl`, weil genau
 * das die Begruendung der Datei ist (Befund 1 des Preflight-Scans nennt beide
 * Fundstellen namentlich fuer T77). `bauform.test.ts` exportiert die Funktion
 * nicht, und dies ist ein anderer Testkoerper — deshalb die lokale Kopie statt
 * eines Re-Exports, wie schon in `_lib/pwaIcons.test.ts`,
 * `_lib/schreibpfade/tokenEinloesung.test.ts` und `_ui/HelferChip.test.ts`.
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
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/** Der Quelltext OHNE Kommentare — jeder Scan dieser Datei liest ihn. */
const gefiltert = () => ohneKommentare(readFileSync(QUELLE, "utf8"));

const aktion = vi.mocked(einloesenAmGate);

beforeEach(() => {
  aktion.mockReset();
});

afterEach(async () => {
  await unmount();
});

describe("Gate — die FERTIGE Meldung", () => {
  it("zeigt sie, wenn sie da ist", async () => {
    // Der Prop ist der Rueckgabewert von `gateMeldung` (Teil 2, T18). Die vier
    // Texte stehen in §3.9 und nirgends sonst.
    await mount(<Gate meldung={URL_SATZ} returnTo="" verwaltungsLink={LOGIN} />);
    expect(query("[data-rolle='gate-fehler']").textContent).toBe(URL_SATZ);
  });

  it("zeigt NICHTS, wenn sie null ist", async () => {
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    expect(exists("[data-rolle='gate-fehler']")).toBe(false);
  });

  it("hat GENAU EINEN Fehlerort, und der frischere Rueckgabewert der Action gewinnt", async () => {
    /*
     * ⚠️ BEIDE Quellen sind hier GLEICHZEITIG gesetzt — anders traegt der Test
     * seine Zusage nicht: mit nur einer Quelle bliebe er auch dann gruen, wenn
     * die Insel zwei Fehlerorte haette (der zweite waere schlicht leer) oder
     * wenn sie die Meldung aus der URL ueber die Antwort der Action stellte.
     */
    aktion.mockResolvedValue({ fehler: "Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen." });
    await mount(<Gate meldung={URL_SATZ} returnTo="" verwaltungsLink={LOGIN} />);
    await submitForm();
    const orte = queryAll("[data-rolle='gate-fehler']");
    expect(orte.length).toBe(1);
    expect(orte[0].textContent).toBe("Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.");
  });

  it("meldet den Fehlerort als `role=alert` — er erscheint jetzt auch NACHTRAEGLICH", async () => {
    // Mit dem Netzfall (Befund 19) ist der Fehlerort nicht mehr nur beim
    // Seitenaufbau da: er kann nach einem Antippen entstehen. Ohne `role`
    // bemerkt eine Bildschirmleserin genau diesen Fall nicht.
    await mount(<Gate meldung={URL_SATZ} returnTo="" verwaltungsLink={LOGIN} />);
    expect(query("[data-rolle='gate-fehler']").getAttribute("role")).toBe("alert");
  });
});

describe("Gate — der Ausnahmeweg des `catch` (Global Constraint 11, Befund 19)", () => {
  it("faengt den VERBINDUNGSABBRUCH ab und zeigt den Ausnahme-Satz am EINEN Fehlerort", async () => {
    /*
     * Ohne das `try/catch` in der Insel lehnt der Aufruf ab, React verwirft in
     * die naechste Error Boundary — genau der Zustand, den Falle 66 verbietet.
     * Gemessen: ohne den Catch wirft schon `submitForm()` (der Wurf steigt
     * durch `act` hoch), und der Baum ist danach ausgehaengt.
     */
    aktion.mockRejectedValue(new TypeError("Failed to fetch"));
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    await submitForm();
    const orte = queryAll("[data-rolle='gate-fehler']");
    expect(orte.length).toBe(1);
    expect(orte[0].textContent).toBe(AUSNAHME_SATZ);
    /*
     * §2.12: der Satz ENTSTEHT NIE SERVERSEITIG. Der Beleg steht in derselben
     * Messung: der einzige Ausgang der Action war eine ABLEHNUNG — der Satz
     * oben kann also nur aus der Insel stammen.
     */
    expect(aktion.mock.settledResults.map((r) => r.type)).toEqual(["rejected"]);
  });

  it("beantwortet auch eine ECHTE SERVERAUSNAHME nicht mit einer Netzdiagnose", async () => {
    /*
     * ⚠️ DER FALL, DEN DIE ALTE FASSUNG FALSCH BEANTWORTETE (Review-Befund 1).
     * Ein serverseitig geworfener Fehler erreicht den Client als `Error` MIT
     * `digest` — nicht als abgerissene Verbindung. N-1 der Regeldatei nennt den
     * Ausloeser woertlich: fehlt `LAGERBUCH_HELFER_SITZUNG_SECRET`, wirft
     * `createHelferSitzung` in JEDEM Trefferpfad, den der Gate-Weg ueber
     * `redeemToken` erreicht; `getDb()`/`SQLITE_READONLY` genauso. Dann
     * beantwortete das Gate JEDE KORREKTE Code-Eingabe mit „Keine Verbindung",
     * und die Person suchte den Fehler bei ihrem Empfang.
     *
     * ⚠️ KEINE KOPIE des Tests darueber (Regel 4): der haelt den Abbruch, dieser
     * die zweite Ursache. Belegt durch die Mutation MF2 des Fix-Berichts — ein
     * `catch`, das auf `digest` verzweigt, laesst den Abbruch-Test GRUEN und
     * diesen hier ROT.
     */
    aktion.mockRejectedValue(Object.assign(new Error("boom"), { digest: "3141592653" }));
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    await submitForm();
    const orte = queryAll("[data-rolle='gate-fehler']");
    expect(orte.length).toBe(1);
    expect(orte[0].textContent).toBe(AUSNAHME_SATZ);
    expect(orte[0].textContent).not.toMatch(/Verbindung/);
  });

  it("verschluckt KEINE echte Antwort der Action", async () => {
    // Ein `catch`, das jeden Ausgang auf den Ausnahme-Satz zoege, waere die
    // teuerste Reparatur: die Abweisung („Code unbekannt") verschwaende hinter
    // einer falschen Diagnose.
    aktion.mockResolvedValue({ fehler: URL_SATZ });
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    await submitForm();
    expect(query("[data-rolle='gate-fehler']").textContent).toBe(URL_SATZ);
  });

  it("ueberlebt den ERFOLGSFALL, in dem die Action mit `undefined` aufloest", async () => {
    /*
     * ⚠️ DER PFAD, DER IN PRODUKTION ZAEHLT. `einloesenAmGate` endet im Erfolg
     * mit `redirect()` (`_actions/gate.ts:99`). Der Client-Aufruf lehnt dafuer
     * NICHT ab — Next transportiert den Redirect in der Antwort
     * (`src/app/m/feedback/f/[slugSecret]/Zettel.tsx:647-650`) —, er loest mit
     * `undefined` auf.
     * Gemessen unter react-dom 19.2: React rendert danach noch einmal, und ein
     * ungeschuetztes `zustand.fehler` wirft dabei
     * „Cannot read properties of undefined" und reisst den Baum ab.
     */
    aktion.mockResolvedValue(undefined as unknown as GateZustand);
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    await submitForm();
    expect(exists("[data-rolle='gate-fehler']")).toBe(false);
    // Der Baum steht noch: das Feld ist da, nicht abgeraeumt.
    expect(exists("input[name='code']")).toBe(true);
  });
});

describe("Gate — das Zahlenfeld (§7.2.4)", () => {
  it("traegt inputmode, maxlength, pattern, aria-label — und KEIN aria-describedby", async () => {
    // inputMode/maxlength/pattern sind zusammen die billigste Massnahme gegen
    // Fehleingaben am GEMEINSAMEN Rate-Limit-Eimer (Falle 24): alle Helferinnen
    // hinter demselben Uplink teilen sich fuenf Fehlversuche pro Minute.
    //
    // ⚠️ DER SICHTBARE FORMATHINWEIS UNTER DEM FELD IST ENTFALLEN (Betreiber-
    // wunsch), und mit ihm `aria-describedby="codehinweis"`. Die frueher hier
    // benachbarte Zusage („der beschriebene Hinweis existiert wirklich") hatte
    // genau EINE Prämisse — ein lebendes `aria-describedby` — und ist deshalb
    // geloescht statt abgeschwaecht worden. WAS BLEIBT, ist ihr eigentlicher
    // Zweck: ein Verweis, der ins Leere zeigt, ist fuer eine Bildschirmleserin
    // schlechter als keiner, weil sie dann gar nichts sagt und es niemandem
    // auffaellt. Diese Zeile haelt genau das in der neuen Form fest — kein
    // halber Rueckbau, der das Attribut stehen laesst und das Ziel entfernt.
    // Das Format traegt weiterhin `placeholder="000-000"` samt `pattern`.
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    const f = query<HTMLInputElement>("input[name='code']");
    expect(f.getAttribute("inputmode")).toBe("numeric");
    expect(f.getAttribute("maxlength")).toBe("7");
    expect(f.getAttribute("pattern")).toBe("[0-9]{3}-?[0-9]{3}");
    expect(f.getAttribute("placeholder")).toBe("000-000");
    expect(f.getAttribute("aria-label")).toBe("Zugangs-Code");
    expect(f.getAttribute("aria-describedby")).toBeNull();
    expect(f.getAttribute("autocomplete")).toBe("off");
  });

  it("reicht `returnTo` als verstecktes Feld durch", async () => {
    await mount(<Gate meldung={null} returnTo="/a/art-9" verwaltungsLink={LOGIN} />);
    const feld = query<HTMLInputElement>("input[name='returnTo']");
    expect(feld.value).toBe("/a/art-9");
    expect(feld.getAttribute("type")).toBe("hidden");
  });

  it("schickt Code UND returnTo an die Action — nicht nur ins Markup", async () => {
    /*
     * Die Zusage ist nicht „das Feld steht da", sondern „der Wert erreicht
     * `einloesenAmGate`". Ein Feld ausserhalb des `<form>` saehe im Markup
     * identisch aus und kaeme nie an.
     */
    aktion.mockResolvedValue({});
    await mount(<Gate meldung={null} returnTo="/a/art-9" verwaltungsLink={LOGIN} />);
    await fill("input[name='code']", "482-137");
    await submitForm();
    expect(aktion).toHaveBeenCalledTimes(1);
    const daten = aktion.mock.calls[0][1];
    expect(daten.get("code")).toBe("482-137");
    expect(daten.get("returnTo")).toBe("/a/art-9");
  });
});

describe("Gate — die Verwaltungskarte", () => {
  it("ist ein LINK auf das Suite-/login, KEIN signIn()-Aufruf", async () => {
    // §3.6.6, Entscheidung 15 (a): „der Verwaltungs-Knopf fuehrt auf das
    // Suite-/login". Ein aus dem Bestand uebernommenes `signIn("oidc", …)`
    // liefe ins Leere — die Suite kennt den Anbieter als "pocket-id"
    // (core/auth/pocketId.ts:28), und Auth.js meldet einen unbekannten
    // Anbieter erst zur LAUFZEIT.
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    const a = query<HTMLAnchorElement>("[data-rolle='gate-verwaltung']");
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe(LOGIN);
  });

  it("reicht den Link UNVERAENDERT durch — er wird serverseitig gebaut", async () => {
    // Der Server kennt `verwaltungsZiel()` (Teil 2, T23) und `returnTo`; die
    // Insel entscheidet daran nichts. Ein zweites Zusammensetzen hier waere
    // eine zweite Stelle, an der der Cutover-Fall „kein SUITE_HOST_LAGERBUCH"
    // falsch entschieden werden kann — und genau die Stelle, an der B-1 zum
    // zweiten Mal auflaufen wuerde.
    await mount(<Gate meldung={null} returnTo="/a/art-9" verwaltungsLink={LOGIN_INNEN} />);
    expect(query<HTMLAnchorElement>("[data-rolle='gate-verwaltung']").getAttribute("href"))
      .toBe(LOGIN_INNEN);
  });

  it("das Zeichen im Knopf ist ein lokales Inline-SVG NEBEN Text", async () => {
    // Querschnittsregel des Plans (E3): `aria-hidden`, `focusable="false"`,
    // immer neben Text. Ein Zeichen ohne Text braeuchte ein `aria-label` am
    // Knopf — die einzige zugelassene Ausnahme ist der Taschenlampenschalter
    // (N-7), und das hier ist nicht sie.
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    const knopf = query("[data-rolle='gate-verwaltung']");
    const zeichen = query("[data-rolle='gate-verwaltung'] svg");
    expect(zeichen.getAttribute("aria-hidden")).toBe("true");
    expect(zeichen.getAttribute("focusable")).toBe("false");
    expect((knopf.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("die Karte BLEIBT — sie ist der einzige sichtbare Verwaltungseinstieg", async () => {
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    expect(queryAll("h2").map((h) => h.textContent)).toEqual(["Im Dienst", "Verwaltung"]);
  });
});

describe("Gate — Bauform", () => {
  it("ist eine Client-Insel wegen `useActionState`", () => {
    const q = gefiltert();
    expect(q).toMatch(/^"use client";/m);
    expect(q).toMatch(/useActionState<GateZustand, FormData>/);
  });

  it("hat KEINEN Demo-Login-Knopf mehr", () => {
    // Die Suite-Anmeldeseite bietet ihn selbst, wenn AUTH_DEV_LOGIN gesetzt ist.
    // Ein zweiter Knopf im Modul waere ein zweiter Pfad in dieselbe Sitzung, in
    // Produktion nur durch eine Bedingung stillgelegt.
    expect(gefiltert()).not.toMatch(/dev-login|devLogin|Demo-Login/);
  });

  it("importiert `next-auth/react` NICHT und ruft kein `signIn`", () => {
    // §3.6.6: der Weg fuehrt ueber das Suite-/login. Die naheliegende
    // Uebernahme aus dem Bestand waere in der Suite falsch, und der Fehler
    // kaeme erst zur Laufzeit.
    expect(gefiltert()).not.toMatch(/next-auth|signIn\(/);
  });

  it("baut den Anmeldelink NICHT selbst zusammen (B-1)", () => {
    /*
     * Die einzige Stelle, an der T77 die Betreiberentscheidung B-1 mechanisch
     * halten kann: weder ein `/login?`-Selbstbau noch ein literaler Prod-Host
     * gehoeren in die Insel. Beides waere eine zweite Entscheidung ueber den
     * Cutover-Fall — und die erste, die T87 ins Leere laufen liesse.
     */
    const q = gefiltert();
    expect(q).not.toMatch(/callbackUrl/);
    expect(q).not.toMatch(/\/login\?/);
    expect(q).not.toMatch(/iuk-ue\.de/);
  });

  it("liest die Markennamen aus `_lib/marke.ts`, nicht aus Env-Variablen (§10.2)", () => {
    const q = gefiltert();
    expect(q).toMatch(/from "\.\.\/_lib\/marke"/);
    expect(q).not.toMatch(/process\.env/);
  });

  it("importiert kein antd, kein lucide, und benutzt keine `--ant-`-Variable", () => {
    const q = gefiltert();
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
    expect(q).not.toMatch(/--ant-/);
  });
});
