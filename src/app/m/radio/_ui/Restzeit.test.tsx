// @vitest-environment jsdom
// src/app/m/radio/_ui/Restzeit.test.tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { mount, hydrate, rerender, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";
import { Restzeit } from "./Restzeit";

const QUELLE = "src/app/m/radio/_ui/Restzeit.tsx";

/**
 * ⚠️ DIESE DATEI STEHT NICHT IN DER FILES-ZEILE DES BRIEFS, UND DAS IST ABSICHT.
 * `briefs/A16.md:3-4` gibt `_ui/Restzeit.tsx` ohne Testdatei aus, und der Vorabscan
 * fuehrt das als BENANNTE Auslassung (`VORABSCAN-A.md:316-322`, Fund F17): „der Hydrations-
 * Fehler ist ausdruecklich unbewacht". Was diese Datei schliesst, ist die HAELFTE, die
 * Vitest sehen kann — die RENDER-REINHEIT: dass die erste Darstellung den Serverwert
 * unveraendert nimmt und nicht selbst rechnet.
 * ⬜ WAS SIE NICHT SCHLIESST: die HYDRATIONS-GLEICHHEIT im Next-Betrieb. `mount()` in
 * jsdom hat ueberhaupt keinen Hydrationsschritt gegen einen echten Serverlauf, und
 * `pnpm build` rechnet nicht (`briefs/A16.md:17-22`). Eigentuemer bleibt der echte Abruf
 * vor dem Merge.
 */
const serverBaum = (html: string): HTMLElement => {
  const traeger = document.createElement("div");
  traeger.innerHTML = html;
  return traeger;
};

afterEach(async () => {
  // Erst abraeumen, dann die Uhr zurueckgeben — sonst laeuft jeder FOLGENDE Fall der
  // Datei auf einer stehengebliebenen Uhr weiter (`lagerbuch/_ui/Restzeit.test.tsx:44-47`).
  await unmount();
  vi.useRealTimers();
});

describe("radio-Restzeit: die Anzeige", () => {
  it("zeigt die vom SERVER gelieferte Uhrzeit, unveraendert", async () => {
    /*
     * Der Browser einer ausleihenden Person steht nicht zwingend auf Europe/Berlin. Die
     * Zone steht an GENAU EINER Stelle (`_lib/anzeige.ts:50`), und die Insel bekommt das
     * fertige Ergebnis. Eine hier gebaute Zeit waere eine ZWEITE Zonenquelle.
     *
     * Die Zeichenkette ist bewusst KEINE, die eine Rechnung zufaellig auch traefe.
     */
    await mount(
      <Restzeit
        uhrzeit="07:31"
        laeuftAb={new Date(Date.now() + 6 * 3600_000)}
        abgelaufenInitial={false}
      />,
    );
    expect(query("[data-rolle='radio-restzeit']").textContent).toContain("07:31");
  });

  it("das Server-HTML nimmt ein abgelaufenInitial=false UNVERAENDERT — auch gegen die eigene Rechnung", async () => {
    /*
     * ⛔ DER KERN DIESER DATEI. `hydrate` legt das SERVER-HTML an, bevor ein Effekt laeuft;
     * dort ist `abgelaufenInitial` die EINZIGE Quelle. Im gemounteten Baum waere dieser
     * Fall wertlos: der Effekt rechnet sofort nach, und ein Bauteil, das `Date.now()`
     * schon beim RENDERN befragte, saehe im DOM genauso aus.
     *
     * `laeuftAb` liegt hier in der VERGANGENHEIT und widerspricht dem Startwert. Genau das
     * ist der Fall, den Next im Betrieb als Hydrations-Fehlanpassung meldete
     * (`briefs/A16.md:17-22`).
     */
    let html = "";
    await hydrate(
      <Restzeit
        uhrzeit="07:31"
        laeuftAb={new Date(Date.now() - 60_000)}
        abgelaufenInitial={false}
      />,
      (wirt) => {
        html = wirt.innerHTML;
      },
    );
    expect(serverBaum(html).textContent).toContain("07:31");
    expect(serverBaum(html).querySelector("[data-rolle='radio-restzeit-abgelaufen']")).toBeNull();
  });

  it("das Server-HTML nimmt ein abgelaufenInitial=true UNVERAENDERT — auch gegen die eigene Rechnung", async () => {
    /*
     * Die Gegenrichtung, und keine Kopie des Falles darueber: dieser haelt allein ein
     * verdrahtetes `false` fest, jener allein ein verdrahtetes `true`. `laeuftAb` liegt
     * hier SECHS STUNDEN in der Zukunft — eine Rechnung beim Rendern zeigte die Uhrzeit.
     */
    let html = "";
    await hydrate(
      <Restzeit
        uhrzeit="07:31"
        laeuftAb={new Date(Date.now() + 6 * 3600_000)}
        abgelaufenInitial={true}
      />,
      (wirt) => {
        html = wirt.innerHTML;
      },
    );
    expect(serverBaum(html).querySelector("[data-rolle='radio-restzeit-abgelaufen']")).not.toBeNull();
  });

  it("der Ablaufsatz erscheint OHNE Navigation, sobald der Zeitpunkt vorbei ist", async () => {
    /*
     * WARUM DAS EINE INSEL IST und nicht drei Zeilen im Rahmen: eine Ausleihe ist ein
     * Formular mit eingetragenen Werten (`_actions/sitzung.ts` bei `erneuereSitzung`).
     * Serverseitig entschieden faellt der Hinweis genau bei der Person aus, fuer die er
     * geschrieben ist — bei der, die beim Ausfuellen ablaeuft.
     *
     * ⚠️ ER IST EINE ANZEIGE, KEIN RIEGEL. Der Riegel ist `requireAusleihSchreibend` in
     * der Action (`_lib/ausleihZugang.ts:262`).
     */
    vi.useFakeTimers();
    await mount(
      <Restzeit
        uhrzeit="07:31"
        laeuftAb={new Date(Date.now() + 10 * 60_000)}
        abgelaufenInitial={false}
      />,
    );
    expect(exists("[data-rolle='radio-restzeit-abgelaufen']")).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000 + 1000);
    });
    expect(exists("[data-rolle='radio-restzeit-abgelaufen']")).toBe(true);
  });

  it("nimmt eine ERNEUERTE Grenze an — der Ablaufsatz verschwindet wieder", async () => {
    /*
     * ⛔ ENTSCHEIDUNG E12 (`briefs/KOPF.md:675-703`, Zusage §3.10 Nr. 8): die
     * Inline-Erneuerung ist eine zweite Insel im SELBEN Formular — „ohne Navigation und
     * ohne die eingetragenen Werte zu verlieren". Der Rahmen bleibt gemountet, und diese
     * Insel bekommt eine neue Grenze als Prop.
     *
     * Vorher blieb der Ablaufsatz DAUERHAFT stehen (`useState` liest nur beim Mounten, und
     * der Effekt kehrte bei `abgelaufen === true` sofort zurueck) — und er fordert zum
     * erneuten Scannen des QR-Codes auf, obwohl gerade erneuert wurde.
     *
     * ⛔ `rerender` UND KEIN ZWEITES `mount`: ein frischer Baum uebersprang genau den
     * Uebergang, um den es geht (`_lib/test-dom.tsx` schreibt den Grund aus).
     * ⚠️ Geprueft wird ueber die Rolle, nicht ueber den Satz — Grep-Anker tragen keine
     * Umlaute.
     */
    vi.useFakeTimers();
    await mount(
      <Restzeit
        uhrzeit="07:31"
        laeuftAb={new Date(Date.now() + 10 * 60_000)}
        abgelaufenInitial={false}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000 + 1000);
    });
    expect(exists("[data-rolle='radio-restzeit-abgelaufen']"), "die Vorbedingung").toBe(true);

    await rerender(
      <Restzeit
        uhrzeit="19:31"
        laeuftAb={new Date(Date.now() + 12 * 3600_000)}
        abgelaufenInitial={false}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(exists("[data-rolle='radio-restzeit-abgelaufen']")).toBe(false);
    expect(query("[data-rolle='radio-restzeit']").textContent).toContain("19:31");
  });

  it("und die erneuerte Grenze laeuft ihrerseits ab — kein Zeitgeber geht verloren", async () => {
    /*
     * Die Gegenrichtung des Falles darueber, und keine Kopie: jener haelt allein das
     * ZURUECKschalten fest, dieser allein, dass die NEUE Grenze wieder taktet. Ohne ihn
     * bliebe „nimmt eine erneuerte Grenze an" auch dann gruen, wenn der Effekt nach der
     * Erneuerung ueberhaupt keinen Zeitgeber mehr setzte.
     */
    vi.useFakeTimers();
    await mount(
      <Restzeit
        uhrzeit="07:31"
        laeuftAb={new Date(Date.now() - 60_000)}
        abgelaufenInitial={true}
      />,
    );
    await rerender(
      <Restzeit
        uhrzeit="07:41"
        laeuftAb={new Date(Date.now() + 10 * 60_000)}
        abgelaufenInitial={true}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(exists("[data-rolle='radio-restzeit-abgelaufen']"), "die Vorbedingung").toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000 + 1000);
    });
    expect(exists("[data-rolle='radio-restzeit-abgelaufen']")).toBe(true);
  });

  it("raeumt seinen Zeitgeber beim Abbau auf", async () => {
    // Ohne das liefe je Navigation ein weiterer Zeitgeber weiter und schriebe in einen
    // abgebauten Baum.
    vi.useFakeTimers();
    await mount(
      <Restzeit
        uhrzeit="07:31"
        laeuftAb={new Date(Date.now() + 10 * 60_000)}
        abgelaufenInitial={false}
      />,
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("radio-Restzeit: die Bauform", () => {
  it("ist eine Client-Insel — und die EINZIGE des Rahmens", () => {
    // §4.2 (Spec:3380-3386): „alles Server, keine Ausnahme ausser der Restzeit".
    expect(readFileSync(QUELLE, "utf8").trimStart()).toMatch(/^["']use client["']/);
  });

  it("formatiert NIE selbst — kein Intl, kein toLocale, keine zonenabhaengige Date-Methode", () => {
    /*
     * Die Zone steht an genau einer Stelle (`_lib/anzeige.ts:50`). `getTime` ist reine
     * ms-Arithmetik und damit zonenunabhaengig — es steht aus gutem Grund NICHT in dieser
     * Liste.
     */
    const quelle = readFileSync(QUELLE, "utf8");
    expect(quelle).not.toMatch(/\bIntl\b/);
    expect(quelle).not.toMatch(/toLocale[A-Za-z]*\s*\(/);
    /*
     * ⛔ DIE LISTE IST VOLLZAEHLIG, NICHT BEISPIELHAFT. Sie fuehrte bis hierher fuenf
     * Namen; `getDay`, `getTimezoneOffset`, `getSeconds` und die zwei `to…String` kamen
     * durch — gemessen als Sonde P9 des Reviews, die `getDay()` UND `getTimezoneOffset()`
     * in den Render schrieb und alle 46 Faelle gruen liess. Ein Waechter, der weniger
     * abdeckt als sein eigener Name verspricht, ist die Fehlerklasse aus NT11.
     */
    expect(quelle).not.toMatch(
      /\bget(?:Hours|Minutes|Seconds|Milliseconds|FullYear|Month|Date|Day|TimezoneOffset)\s*\(/,
    );
    expect(quelle).not.toMatch(/\bto(?:Date|Time)String\s*\(/);
  });
});
