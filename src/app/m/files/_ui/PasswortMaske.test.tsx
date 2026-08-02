// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { mount, unmount, query, exists, fill, submitForm } from "../../qr/_lib/test-dom";
import { PasswortMaske } from "./PasswortMaske";

/**
 * DIE PASSWORTMASKE VON `/s/<id>` — die Client-Insel des serverseitigen Gates
 * (Spec §7.4, Plan T40).
 *
 * ═══ WAS HIER GEPRUEFT WIRD ══════════════════════════════════════════════════
 *
 * Genau vier Dinge, und alle vier haben eine Fehlerform, die still ist:
 *
 * 1. **Das Drahtformat.** `POST /api/s/<id>/verify` mit `{"password": …}` als
 *    JSON. Der Handler liest `req.json()` und `roh.password`; ein
 *    `application/x-www-form-urlencoded`-Rumpf (also ein nacktes
 *    `<form method="post">`) kaeme dort als leeres Passwort an — die Maske
 *    antwortete „Passwort falsch." auf JEDES richtige Passwort.
 * 2. **Der Erfolgsweg laeuft GENAU EINMAL** und nur bei 200. Er ist als Prop
 *    hereingereicht, damit er ueberhaupt pruefbar ist: der Vorgabewert laedt
 *    die Seite neu, und `location.reload()` gibt es in jsdom nicht.
 * 3. **429 sagt etwas anderes als 401.** Die Notbremse (10 Versuche / 10 min)
 *    ist keine falsche Eingabe — wer sie fuer eine haelt, tippt weiter und
 *    verlaengert die Sperre.
 * 4. **401 sagt IMMER dasselbe.** Der Handler haelt sein Orakel geschlossen
 *    („existiert nicht", „hat kein Passwort", „falsch" sind ununterscheidbar);
 *    eine Insel, die den Fehlertext des Servers durchreicht, oeffnete es
 *    wieder — von aussen sichtbar, ohne dass am Server etwas geaendert waere.
 *
 * ═══ WAS HIER NICHT GEPRUEFT WIRD ════════════════════════════════════════════
 *
 * Dass vor dem Entsperren kein Dateiname im Payload steht: das entscheidet die
 * SEITE (sie ruft die Liste gar nicht erst ab), nicht diese Insel — und die
 * Wirkung im echten RSC-Payload sieht nur `e2e/files-fileshare.spec.ts`.
 */

const ABRUFE: { url: string; init: RequestInit }[] = [];

/** Antwortet auf den naechsten Aufruf mit diesem Status. */
let antwortStatus = 200;
/** Wirft statt zu antworten — der Netzfehler. */
let wirftNetzfehler = false;

beforeEach(() => {
  ABRUFE.length = 0;
  antwortStatus = 200;
  wirftNetzfehler = false;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    ABRUFE.push({ url, init });
    if (wirftNetzfehler) return Promise.reject(new Error("Netz weg"));
    return Promise.resolve(
      new Response(antwortStatus === 200 ? '{"ok":true}' : '{"fehler":"…"}', {
        status: antwortStatus,
        headers: { "content-type": "application/json" },
      }),
    );
  });
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

async function tippeUndSende(passwort: string): Promise<void> {
  await fill('input[type="password"]', passwort);
  await submitForm("form");
}

describe("Das Drahtformat gegen `POST /api/s/<id>/verify`", () => {
  it("schickt JSON mit dem Feld `password` an die Adresse DIESES Shares", async () => {
    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={() => {}} />);
    await tippeUndSende("geheimes-passwort");

    expect(ABRUFE).toHaveLength(1);
    expect(ABRUFE[0].url).toBe("/api/s/shAbcdefgh/verify");
    expect(ABRUFE[0].init.method).toBe("POST");
    expect(
      new Headers(ABRUFE[0].init.headers).get("content-type"),
      "der Handler liest `req.json()`; ein Formular-Rumpf kaeme als leeres Passwort an",
    ).toMatch(/application\/json/);
    expect(JSON.parse(String(ABRUFE[0].init.body))).toEqual({ password: "geheimes-passwort" });
  });

  it("schickt gar nichts ab, solange das Feld leer ist", async () => {
    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={() => {}} />);
    await submitForm("form");

    // Ein leeres Passwort ist beim Handler ein Fehlversuch und zaehlt gegen die
    // Notbremse — zehn Leerklicks sperrten den Share fuer zehn Minuten.
    expect(ABRUFE).toHaveLength(0);
  });
});

describe("Die drei Antworten des Handlers, drei Verhalten", () => {
  it("200 → der Erfolgsweg läuft GENAU EINMAL, und keine Fehlermeldung bleibt stehen", async () => {
    const nachErfolg = vi.fn();
    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={nachErfolg} />);
    await tippeUndSende("geheimes-passwort");

    expect(nachErfolg).toHaveBeenCalledTimes(1);
    expect(exists('[data-testid="files-passwort-fehler"]')).toBe(false);
  });

  it("401 → benannte Ablehnung, und der Erfolgsweg läuft NICHT", async () => {
    const nachErfolg = vi.fn();
    antwortStatus = 401;
    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={nachErfolg} />);
    await tippeUndSende("falsch");

    expect(nachErfolg).not.toHaveBeenCalled();
    expect(query('[data-testid="files-passwort-fehler"]').textContent).toContain("Passwort");
  });

  it("429 → sagt etwas ANDERES als 401 (die Notbremse ist keine falsche Eingabe)", async () => {
    antwortStatus = 401;
    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={() => {}} />);
    await tippeUndSende("falsch");
    const bei401 = query('[data-testid="files-passwort-fehler"]').textContent;

    antwortStatus = 429;
    await tippeUndSende("falsch");
    const bei429 = query('[data-testid="files-passwort-fehler"]').textContent;

    expect(bei429).not.toBe(bei401);
    expect(bei429).toMatch(/Versuche/);
  });

  it("ein Netzfehler ist als solcher benannt und lässt erneut versuchen", async () => {
    wirftNetzfehler = true;
    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={() => {}} />);
    await tippeUndSende("geheimes-passwort");

    expect(query('[data-testid="files-passwort-fehler"]').textContent).toMatch(/Verbindung/);
    // Der Knopf ist wieder bedienbar — sonst haengt die Maske nach einem
    // Funkloch dauerhaft auf „wird geprüft".
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false);
  });

  it("die Ablehnung trägt NIE den Text des Servers — das Orakel bleibt geschlossen", async () => {
    /*
     * Der Handler antwortet auf „unbekannter Share", „Share ohne Passwort" und
     * „falsches Passwort" mit demselben 401 und demselben Rumpf. Wuerde die
     * Insel den Rumpf anzeigen, waere jede kuenftige Verfeinerung des
     * Serverrumpfes SOFORT ein Orakel — ohne dass jemand die Insel anfasst.
     */
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response('{"fehler":"Diese Freigabe existiert nicht."}', {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={() => {}} />);
    await tippeUndSende("falsch");

    expect(query('[data-testid="files-passwort-fehler"]').textContent).not.toContain("existiert");
  });
});

describe("Bedienbarkeit", () => {
  it("ist ein echtes `<form>` mit einem Passwortfeld — Enter sendet, der Passwortspeicher trägt", async () => {
    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={() => {}} />);

    const feld = query<HTMLInputElement>('input[type="password"]');
    expect(feld.autocomplete).toBe("current-password");
    expect(feld.getAttribute("name")).toBe("password");
    // Ein `<label for>` — die Beschriftung darf nicht bloss danebenstehen.
    expect(query(`label[for="${feld.id}"]`)).toBeTruthy();
  });

  it("sperrt gegen den Doppelklick: zwei Absenden hintereinander ergeben EINEN Aufruf", async () => {
    /*
     * Jeder Aufruf rechnet serverseitig bcrypt mit cost 12 und zaehlt gegen die
     * Notbremse. Ein doppelt ausgeloestes Absenden verbraeuchte zwei von zehn
     * Versuchen fuer eine Eingabe.
     */
    // Ein HALTER statt eines `let`: TypeScript verfolgt eine Zuweisung, die
    // erst in einem Rueckruf geschieht, nicht — die Variable bliebe fuer den
    // Typechecker `null` und `aufloesen?.()` unaufrufbar.
    const halter: { aufloesen: (() => void) | null } = { aufloesen: null };
    vi.stubGlobal("fetch", () => {
      ABRUFE.push({ url: "", init: {} });
      return new Promise<Response>((res) => {
        halter.aufloesen = () => res(new Response("{}", { status: 401 }));
      });
    });

    await mount(<PasswortMaske shareId="shAbcdefgh" nachErfolg={() => {}} />);
    await fill('input[type="password"]', "geheimes-passwort");
    await submitForm("form");
    await submitForm("form");

    expect(ABRUFE).toHaveLength(1);
    halter.aufloesen?.();
  });
});
