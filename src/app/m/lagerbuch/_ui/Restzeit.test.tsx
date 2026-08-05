// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";
import { Restzeit } from "./Restzeit";

const QUELLE = "src/app/m/lagerbuch/_ui/Restzeit.tsx";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 der Regeldatei
 * fuer Teil 4, K-2/K-3). Die beiden Quelltext-Scans unten laesen sonst den Rohtext
 * INKLUSIVE Kommentaren — und `Restzeit.tsx` traegt beide gesuchten Zeichenfolgen
 * woertlich in seiner eigenen Begruendung: „kein `toLocaleTimeString`, kein
 * `Intl`" und die Aufzaehlung „getHours/getMinutes/getFullYear/getMonth/getDate"
 * stehen beide im Kopfkommentar der Komponente. Ohne diese Funktion waere jeder
 * der beiden Scans auf genau der Begruendung rot, die er konservieren soll.
 * `bauform.test.ts` exportiert sie nicht, und dies ist ein anderer Testkoerper —
 * deshalb die lokale Kopie statt eines Re-Exports, genau wie `_lib/pwaIcons.test.ts`
 * (T65) und `_lib/schreibpfade/tokenEinloesung.test.ts` (T66) es halten.
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

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("Restzeit — die Anzeige", () => {
  it("zeigt die vom SERVER gelieferte Uhrzeit, unveraendert", async () => {
    // Der Browser einer Helferin steht nicht zwingend auf Europe/Berlin. Eine
    // im Client formatierte Zeit waere eine ZWEITE Zonenquelle neben der einen,
    // die §4.5 festlegt.
    await mount(
      <Restzeit uhrzeit="19:00" laeuftAb={new Date(Date.now() + 6 * 3600_000)} warntInitial={false} />,
    );
    expect(query("[data-rolle='restzeit']").textContent).toContain("19:00");
  });

  it("warntInitial=false rendert den Hinweis NICHT", async () => {
    await mount(
      <Restzeit uhrzeit="19:00" laeuftAb={new Date(Date.now() + 6 * 3600_000)} warntInitial={false} />,
    );
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(false);
  });

  it("warntInitial=true rendert den Hinweis MIT der Server-Uhrzeit — auch wenn die eigene Rechnung anders entschiede", async () => {
    // ⚠️ `laeuftAb` steht bewusst bei 6 STUNDEN, weit ueber der 30-Minuten-
    // Schwelle: eine Fixture unter der Schwelle (wie im Plan abgedruckt, 10 min)
    // haette diese Zusicherung NICHT getragen. `useEffect` prueft naemlich sofort
    // beim ersten Rendern nach (`pruefen()` VOR dem Intervall) — bei einer
    // Restlaufzeit unter der Schwelle waere der Hinweis auch dann erschienen,
    // wenn `warntInitial` STILL IGNORIERT und mit `false` vorbelegt wuerde. Nur
    // eine Restlaufzeit UEBER der Schwelle trennt die beiden Wege: dann kann der
    // Hinweis ausschliesslich aus `warntInitial` selbst stammen (`if (warnt)
    // return;` verhindert die eigene Nachrechnung, sobald der Zustand schon
    // `true` ist). Per Mutation belegt (Bericht, Mutation A).
    await mount(
      <Restzeit
        uhrzeit="19:00"
        laeuftAb={new Date(Date.now() + 6 * 3600_000)}
        warntInitial={true}
      />,
    );
    const w = query("[data-rolle='restzeit-warnung']");
    expect(w.textContent).toBe("Dein Zugang läuft um 19:00 ab — Kärtchen bereithalten.");
  });
});

describe("Restzeit — die eigentliche Zusage aus §3.4.3 Punkt 1", () => {
  it("der Hinweis erscheint OHNE Navigation, sobald 30 Minuten unterschritten sind", async () => {
    // DAS ist der Grund, warum die Insel ueberhaupt existiert. Ein
    // serverseitig gerechneter Schwellenwert bliebe ohne diesen Test gruen und
    // fiele im Betrieb genau bei dem Menschen aus, fuer den er geschrieben ist:
    // bei dem, der mit 35 Minuten Restlaufzeit anfaengt zu zaehlen.
    vi.useFakeTimers();
    const jetzt = new Date("2026-08-04T18:25:00.000Z");
    vi.setSystemTime(jetzt);
    const laeuftAb = new Date(jetzt.getTime() + 35 * 60_000);

    await mount(<Restzeit uhrzeit="19:00" laeuftAb={laeuftAb} warntInitial={false} />);
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(false);

    // Sechs Minuten weiter: Restlaufzeit 29 Minuten, Schwelle unterschritten.
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(true);
  });

  /**
   * DIE BEIDEN FOLGENDEN TESTS NAGELN DIE SCHWELLE SELBST FEST — der Test darueber
   * tut das NICHT. Er sagt nur: bei 35 min nicht, bei 29 min doch. Daraus folgt
   * zwingend, dass JEDER Schwellenwert im Intervall [29 min, 35 min) gruen bliebe
   * (34 Minuten genauso wie 30) und dass `<=` → `<` ebenfalls gruen bliebe, weil
   * 29 min echt kleiner als 30 min ist. Der Wert „30 Minuten" und die INKLUSIVE
   * Semantik von „ab 30 Minuten" (§3.4.3 Punkt 1) waeren damit nirgends zugesichert
   * — ausgerechnet die eine Regel, derentwegen diese Insel ueberhaupt existiert.
   *
   * Die beiden Tests sind KEINE Kopien voneinander (Regel 4); jeder haelt einen
   * anderen Fall allein:
   *   - auf der Schwelle (30:00) haelt allein `<=` und jedes T < 30 min,
   *     ausserdem allein die SOFORTIGE erste `pruefen()`-Pruefung vor dem Intervall;
   *   - knapp darueber (30:01) haelt allein jedes T > 30 min — z. B. 34 Minuten —
   *     und danach, nach einem Takt, wieder die Nachrechnung im Minutentakt.
   * Per Mutation belegt (Bericht, Fix-Runde 1, Mutationen H, I, J).
   *
   * Kollidiert nicht mit K-3: dort isoliert `warntInitial={true}` UEBER der Schwelle
   * das Server-Prop, hier isoliert `warntInitial={false}` AUF der Schwelle die
   * eigene Rechnung des Clients.
   */
  it("warnt bei EXAKT 30 Minuten Restlaufzeit — „ab 30 Minuten“ ist inklusiv", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T18:25:00.000Z"));
    await mount(
      <Restzeit
        uhrzeit="19:00"
        laeuftAb={new Date(Date.now() + 30 * 60_000)}
        warntInitial={false}
      />,
    );
    // Direkt nach dem Mount, ohne einen einzigen Takt: das kann nur die sofortige
    // erste Pruefung sein — und nur mit `<=` und einer Schwelle von 30 Minuten.
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(true);
  });

  it("warnt bei 30 Minuten + 1 Sekunde noch NICHT — eine Minute spaeter schon", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T18:25:00.000Z"));
    await mount(
      <Restzeit
        uhrzeit="19:00"
        laeuftAb={new Date(Date.now() + 30 * 60_000 + 1000)}
        warntInitial={false}
      />,
    );
    // Eine Sekunde ueber der Schwelle: noch nicht. Eine zu grosse Schwelle (34 min)
    // wuerde hier schon warnen.
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(false);

    // Ein Takt weiter: Restlaufzeit 29:01, Schwelle unterschritten.
    // In `act(...)` wie in `_ui/KopierZeile.test.tsx` (Feedback-Modul): bei einem
    // EINZIGEN Taktschlag liegt der von React eingeplante Renderdurchlauf sonst
    // hinter einem MessageChannel, den die Fake-Timer nicht bewegen — die
    // Zusicherung waere dann rot, obwohl die Komponente richtig rechnet
    // (empirisch eingetreten, siehe Bericht Fix-Runde 1).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(true);
  });

  it("raeumt seinen Takt beim Abbau auf", async () => {
    // Ein weiterlaufendes `setInterval` nach dem Unmount setzt Zustand auf einem
    // abgebauten Baum — React warnt, und in einem langen Check laeuft der Takt
    // pro Navigation ein weiteres Mal.
    vi.useFakeTimers();
    const spion = vi.spyOn(globalThis, "clearInterval");
    await mount(
      <Restzeit uhrzeit="19:00" laeuftAb={new Date(Date.now() + 60 * 60_000)} warntInitial={false} />,
    );
    await unmount();
    expect(spion).toHaveBeenCalled();
    spion.mockRestore();
  });
});

describe("Restzeit — Bauform", () => {
  it("formatiert NIE selbst: kein `toLocaleTimeString`, kein `Intl` in dieser Datei", () => {
    // Der Quelltext-Scan aus §3.8.2 deckt das nicht ab — dieser Test schon.
    // Eine im Client formatierte Uhrzeit waere eine zweite Zonenquelle.
    // Gelesen wird OHNE Kommentare (Regel 1, K-2): die Komponente traegt
    // genau diese Zeichenfolge woertlich in ihrer eigenen Begruendung.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/toLocaleTimeString|toLocaleString|\bIntl\b/);
  });

  it("benutzt `getTime`, aber KEINE zonenabhaengige Date-Methode", () => {
    // §4.5/§5.16: reine ms-Arithmetik ist zonenunabhaengig und gehoert deshalb
    // ausdruecklich NICHT nach _lib/zeit.ts. `getHours` & Co. waeren der Bruch.
    // Gelesen wird OHNE Kommentare (Regel 1, K-2): der Kopfkommentar der
    // Komponente zaehlt genau diese verbotenen Methodennamen woertlich auf.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/\.getTime\(\)/);
    expect(q).not.toMatch(/getHours|getMinutes|getFullYear|getMonth|getDate\(/);
  });

  it("ist eine Client-Insel", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/^"use client";/m);
  });
});
