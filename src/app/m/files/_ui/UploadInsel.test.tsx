// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";

/**
 * DIE UPLOAD-INSEL VON `/shares/neu` (Spec §7.1, §7.2; Plan T35).
 *
 * DIE ZUSAGE, DIE DIESE DATEI TRAEGT: eine Datei ueber `FILES_CHUNK_BYTES` wird
 * in mehreren `PUT`s uebertragen, der Fortschritt steigt STRENG monoton, ein
 * Abbruch ruft `DELETE /api/upload/<fileId>` und stoppt die laufende Schleife,
 * und ein Wiederholen setzt an der bereits uebertragenen Byte-Zahl auf — nur
 * fuer die eine fehlgeschlagene Datei.
 *
 * WARUM JEDE DIESER ZUSAGEN EINEN AUFBAU BRAUCHT, DER SIE FALSIFIZIEREN KANN:
 *
 * - „Der Fortschritt steigt monoton" ist LEER, wenn der Test den ganzen Upload
 *   abwartet und danach EINEN Wert liest. Deshalb bleibt hier jeder Chunk in
 *   der Luft (`warte()`), bis der Test ihn einzeln beantwortet — und die
 *   Zusicherung lautet STRENG steigend, sonst waere eine Insel, die je Chunk
 *   `gesendetBytes = stueck` statt `+= stueck` schreibt, gruen (die Folge
 *   waere 4 MiB, 4 MiB, 1 KiB).
 * - „Abbrechen entfernt den Eintrag" ist die schwaechere Haelfte. Die
 *   tragende ist: NACH dem `DELETE` kommt KEIN weiterer `PUT` mehr. Ein
 *   `AbortController` allein leistet das nicht — die Schleife rechnet den
 *   naechsten Ausschnitt trotzdem aus. Geprueft wird deshalb die beobachtete
 *   Aufruffolge, nicht das Verschwinden (Plan T35, Punkt „ueber den
 *   beobachteten Request, nicht ueber das Verschwinden allein").
 * - „Wiederholen setzt nur die fehlgeschlagene Datei fort" waere auch bei
 *   einem Neubeginn ab Byte 0 gruen. Zugesichert wird deshalb der WIEDERAUF-
 *   SETZPUNKT: der erste `PUT` des Wiederholens traegt `ab=<bereits
 *   uebertragen>`.
 *
 * WAS DIESER TEST STRUKTURELL NICHT KANN: die Falle „ein WERT aus einem
 * `"use client"`-Modul kommt in einer Server Component nicht an". Unter Vitest
 * sind beide Module normale ES-Module, `"use client"` ist ein wirkungsloser
 * String (`docs/design/README.md:87-103`). Dafuer gibt es unten einen
 * QUELLTEXT-Scan — die ehrliche Ebene fuer „diese Bauform ist eingehalten".
 */

const { useActionStateMock, anlegenActionMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  anlegenActionMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

// `anlegenAction` liegt hinter `"use server"` und zieht Datenbank, `next/cache`
// und bcrypt nach. Hier interessiert nur, DASS die Insel sie an
// `useActionState` reicht — der Rumpf gehoert T26 und `actions.test.ts`.
vi.mock("../(verwaltung)/actions", () => ({ anlegenAction: anlegenActionMock }));

import type { AnlegenErgebnis } from "../(verwaltung)/actions";
import { FILES_CHUNK_BYTES } from "../_lib/grenzen";
import { UploadInsel } from "./UploadInsel";
import { click, mount, query, queryAll, rerender, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

// --- Der beobachtete `fetch` -----------------------------------------------

interface Aufruf {
  readonly method: string;
  readonly pfad: string;
  readonly ab: string | null;
  readonly ende: boolean;
  readonly fileId: string;
  readonly inhaltstyp: string | null;
  readonly bytes: number;
}

interface AntwortWunsch {
  status: number;
  koerper?: unknown;
  /**
   * `Response.redirected` — WAHR, wenn `fetch` einer Weiterleitung GEFOLGT ist.
   * Das Feld steht hier, weil genau dieser Fall sonst nicht darstellbar waere:
   * eine gefolgte Weiterleitung hat `ok === true` und `status === 200`, ist aber
   * die Antwort einer FREMDEN Adresse (der Anmeldeseite) und nicht die des
   * Handlers.
   */
  redirected?: boolean;
}

/** `"warten"` heisst: der Aufruf bleibt in der Luft, bis der Test ihn beantwortet. */
type Regie = (aufruf: Aufruf) => AntwortWunsch | "warten";

let aufrufe: Aufruf[] = [];
let offen: { aufruf: Aufruf; erfuellen: (wunsch: AntwortWunsch) => void }[] = [];
let regie: Regie = () => ({ status: 200, koerper: {} });

function alsAntwort(wunsch: AntwortWunsch): Response {
  const { status, koerper = {}, redirected = false } = wunsch;
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected,
    json: async () => koerper,
  } as unknown as Response;
}

function zerlege(eingabe: string, init: RequestInit | undefined): Aufruf {
  const url = new URL(eingabe, "http://files.localtest.me");
  const kopf = (init?.headers ?? {}) as Record<string, string>;
  const koerper = init?.body as Blob | undefined;
  return {
    method: init?.method ?? "GET",
    pfad: url.pathname,
    ab: url.searchParams.get("ab"),
    ende: url.searchParams.get("ende") === "1",
    fileId: url.pathname.split("/").pop() ?? "",
    inhaltstyp: kopf["content-type"] ?? null,
    bytes: koerper?.size ?? 0,
  };
}

function stelleFetch(): void {
  aufrufe = [];
  offen = [];
  globalThis.fetch = ((eingabe: string, init?: RequestInit) => {
    const aufruf = zerlege(eingabe, init);
    aufrufe.push(aufruf);
    const wunsch = regie(aufruf);
    if (wunsch !== "warten") return Promise.resolve(alsAntwort(wunsch));
    return new Promise<Response>((aufloesen) => {
      offen.push({ aufruf, erfuellen: (w) => aufloesen(alsAntwort(w)) });
    });
  }) as unknown as typeof fetch;
}

/**
 * Beantwortet den AELTESTEN noch offenen Aufruf und laesst React die daraus
 * folgenden Zustandsaenderungen einspielen. Die Fortsetzung der wartenden
 * `async`-Schleife ist ein Microtask — ohne `act` liefe die Zusicherung
 * dagegen an.
 */
async function beantworte(wunsch: AntwortWunsch = { status: 200 }): Promise<void> {
  const naechster = offen.shift();
  if (!naechster) throw new Error("Kein offener fetch-Aufruf");
  await act(async () => {
    naechster.erfuellen(wunsch);
  });
}

// --- Dateien und Zustaende --------------------------------------------------

const CHUNK = FILES_CHUNK_BYTES;
const REST = 1024;

/**
 * Eine echte `File` und kein Attrappen-Objekt: die Insel ruft `slice()` und
 * reicht das Ergebnis als `body` weiter — nur an einem echten `Blob` ist
 * `size` die Zahl, die auch der Browser schickte.
 */
function datei(name: string, groesse: number, typ: string): File {
  return new File([new Uint8Array(groesse)], name, { type: typ });
}

const GROSS = () => datei("bericht.png", CHUNK * 2 + REST, "image/png");

const START: AnlegenErgebnis = { ok: false, feldFehler: {}, werte: {} };

function erfolg(shareId: string, dateien: { fileId: string; name: string }[]): AnlegenErgebnis {
  return { ok: true, shareId, dateien };
}

let zustand: AnlegenErgebnis = START;

const insel = () => <UploadInsel maxAblaufTage={7} maxDateienProShare={200} maxDateiBytes={12_582_912} />;

/**
 * Dateien in ein `<input type="file">` zu legen kann `fill()` aus dem Harness
 * nicht — `files` ist keine `value`-Eigenschaft. Das hier ist deshalb KEIN
 * zweites Harness, sondern die eine Zeile, die jsdom fuer Dateiwahl braucht;
 * sie bleibt in dieser Datei (`CLAUDE.md:92-93`).
 */
async function waehle(...dateien: File[]): Promise<void> {
  const feld = query<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(feld, "files", { value: dateien, configurable: true });
  await act(async () => {
    feld.dispatchEvent(new Event("input", { bubbles: true }));
    feld.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Formular abschicken und das Serverergebnis einspielen — der echte Uebergang. */
async function sendeUndAntworte(ergebnis: AnlegenErgebnis): Promise<void> {
  await submitForm();
  zustand = ergebnis;
  await rerender(insel());
}

const eintrag = (fileId: string) => query(`[data-file-id="${fileId}"]`);
const gesendet = (fileId: string) => Number(eintrag(fileId).dataset.gesendet);
const puts = () => aufrufe.filter((a) => a.method === "PUT");

beforeEach(() => {
  stelleFetch();
  regie = () => ({ status: 200, koerper: {} });
  zustand = START;
  useActionStateMock.mockReset();
  anlegenActionMock.mockReset();
  useActionStateMock.mockImplementation(() => [zustand, () => {}, false]);
});

afterEach(async () => {
  await unmount();
});

// ---------------------------------------------------------------------------

describe("Chunk-Aufteilung", () => {
  it("zerlegt eine Datei ueber FILES_CHUNK_BYTES in aufeinander aufbauende Byte-Offsets", async () => {
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));

    expect(puts()).toHaveLength(3);
    expect(puts().map((a) => a.ab)).toEqual(["0", String(CHUNK), String(CHUNK * 2)]);
    expect(puts().map((a) => a.bytes)).toEqual([CHUNK, CHUNK, REST]);
    // Die Summe der Ausschnitte IST die Datei — ein Chunk zu viel oder zu wenig
    // faellt hier auf, auch wenn die Offsets fuer sich stimmig aussehen.
    expect(puts().reduce((s, a) => s + a.bytes, 0)).toBe(CHUNK * 2 + REST);
    expect(puts().every((a) => a.pfad === "/api/upload/fi1234abcd")).toBe(true);
  });

  it("setzt `?ende=1` genau am LETZTEN Chunk", async () => {
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));

    expect(puts().map((a) => a.ende)).toEqual([false, false, true]);
  });

  /**
   * DER KOPF DES LETZTEN CHUNKS IST EINE ZUSAGE UND KEIN BEIWERK (Plan T35).
   * `T27` nimmt die Client-Deklaration als `Content-Type` des `?ende=1`-Chunks
   * entgegen. Fehlt sie, werden `.txt` und die drei Office-Formate ABGELEHNT:
   * fuer `text/plain` gibt es keine Signatur, die Deklaration ist dort das
   * einzige Positivsignal (§8.5 verlangt beide), und fuer ZIP-Container ist sie
   * die Verfeinerung. Alle Signaturformate gehen auch ohne durch — die Luecke
   * faellt also genau bei den vier Typen auf, die niemand zuerst probiert.
   */
  it("schickt `datei.type` als `Content-Type` des `?ende=1`-Chunks — und nur dort", async () => {
    await mount(insel());
    await waehle(datei("liste.txt", CHUNK + REST, "text/plain"));
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "liste.txt" }]));

    expect(puts()).toHaveLength(2);
    expect(puts()[0].inhaltstyp).toBeNull();
    expect(puts()[1].inhaltstyp).toBe("text/plain");
  });

  /**
   * DIE 0-BYTE-DATEI IST DER RAND DER SCHLEIFE, und sie ist auswaehlbar: ein
   * `<input type="file">` nimmt sie ohne Murren an. Zugesichert wird, dass sie
   * GENAU EINEN Aufruf bekommt und dieser `?ende=1` traegt — nur dann bekommt
   * die Person die benannte Ablehnung des Servers zu sehen, statt in einer
   * Schleife zu stehen, die nie einen letzten Chunk erreicht.
   *
   * Die Regie beantwortet einen Aufruf OHNE `ende` mit 500 und nicht mit 200:
   * eine Insel, die den letzten Chunk nicht als solchen erkennt, laeuft sonst
   * endlos, und ein haengender Test ist ein schlechterer Befund als ein roter.
   */
  it("schickt eine Datei mit 0 Bytes in GENAU EINEM Aufruf mit `?ende=1`", async () => {
    regie = (a) =>
      a.ende
        ? { status: 415, koerper: { fehler: "Der Inhalt gehört zu keinem der erlaubten Formate (…)." } }
        : { status: 500 };
    await mount(insel());
    await waehle(datei("leer.png", 0, "image/png"));
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "leer.png" }]));

    expect(puts()).toHaveLength(1);
    expect(puts()[0].ende).toBe(true);
    expect(puts()[0].ab).toBe("0");
    expect(eintrag("fi1234abcd").dataset.zustand).toBe("fehler");
    expect(eintrag("fi1234abcd").textContent).toContain("erlaubten Formate");
  });
});

describe("Fortschritt", () => {
  it("steigt STRENG monoton — je Chunk kumuliert, nicht je Chunk neu gesetzt", async () => {
    regie = () => "warten";
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));

    const stufen: number[] = [gesendet("fi1234abcd")];
    await beantworte({ status: 200, koerper: { empfangeneBytes: CHUNK } });
    stufen.push(gesendet("fi1234abcd"));
    await beantworte({ status: 200, koerper: { empfangeneBytes: CHUNK * 2 } });
    stufen.push(gesendet("fi1234abcd"));
    await beantworte({ status: 200, koerper: { fertig: true } });
    stufen.push(gesendet("fi1234abcd"));

    expect(stufen).toEqual([0, CHUNK, CHUNK * 2, CHUNK * 2 + REST]);
    for (let i = 1; i < stufen.length; i += 1) {
      expect(stufen[i], `Stufe ${i} ist nicht groesser als ${stufen[i - 1]}`).toBeGreaterThan(
        stufen[i - 1],
      );
    }
    expect(eintrag("fi1234abcd").dataset.zustand).toBe("fertig");
  });

  it("nennt den Zustand als TEXT, nicht nur als Balken", async () => {
    regie = () => "warten";
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));

    // Barrierefreiheit: Bedeutung nie allein ueber Farbe oder Geometrie
    // (`docs/design/README.md:133-137`).
    expect(eintrag("fi1234abcd").textContent).toMatch(/wird übertragen/i);
    await beantworte();
    await beantworte();
    await beantworte({ status: 200, koerper: { fertig: true } });
    expect(eintrag("fi1234abcd").textContent).toMatch(/vollständig übertragen/i);
  });
});

describe("Abbrechen", () => {
  it("ruft `DELETE /api/upload/<fileId>` und schickt DANACH keinen Chunk mehr", async () => {
    // Der `DELETE` wird sofort beantwortet, die Chunks bleiben in der Luft:
    // nur so faellt der Abbruch MITTEN in den Upload und nicht dahinter.
    regie = (a) => (a.method === "DELETE" ? { status: 204 } : "warten");
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));
    expect(puts()).toHaveLength(1);

    await click('[data-file-id="fi1234abcd"] [data-aktion="abbrechen"]');

    const geloescht = aufrufe.filter((a) => a.method === "DELETE");
    expect(geloescht).toHaveLength(1);
    expect(geloescht[0].pfad).toBe("/api/upload/fi1234abcd");

    // Der Chunk, der beim Abbruch flog, kommt jetzt erst zurueck. Genau hier
    // wuerde eine Schleife ohne Wache den naechsten Ausschnitt losschicken.
    await beantworte({ status: 200, koerper: { empfangeneBytes: CHUNK } });

    expect(puts(), "nach dem DELETE darf kein PUT mehr folgen").toHaveLength(1);
    expect(queryAll('[data-file-id="fi1234abcd"]')).toHaveLength(0);
  });
});

describe("Wiederholen", () => {
  it("setzt an der bereits uebertragenen Byte-Zahl auf und ruehrt die andere Datei nicht an", async () => {
    // Der ZWEITE Chunk der ersten Datei scheitert; alles andere gelingt.
    let putZaehler = 0;
    regie = (a) => {
      if (a.method !== "PUT") return { status: 204 };
      putZaehler += 1;
      if (a.fileId === "fiaaaaaaaa" && putZaehler === 2) return { status: 500 };
      return { status: 200, koerper: a.ende ? { fertig: true } : {} };
    };

    await mount(insel());
    await waehle(GROSS(), datei("zweite.png", REST, "image/png"));
    await sendeUndAntworte(
      erfolg("sh1234abcd", [
        { fileId: "fiaaaaaaaa", name: "bericht.png" },
        { fileId: "fibbbbbbbb", name: "zweite.png" },
      ]),
    );

    expect(eintrag("fiaaaaaaaa").dataset.zustand).toBe("fehler");
    expect(eintrag("fibbbbbbbb").dataset.zustand).toBe("fertig");
    expect(gesendet("fiaaaaaaaa")).toBe(CHUNK);

    const vorher = puts().length;
    await click('[data-file-id="fiaaaaaaaa"] [data-aktion="wiederholen"]');
    const danach = puts().slice(vorher);

    // NUR die fehlgeschlagene Datei — und ab dem Stand, nicht ab Null.
    expect(danach.every((a) => a.fileId === "fiaaaaaaaa")).toBe(true);
    expect(danach[0].ab).toBe(String(CHUNK));
    expect(danach.map((a) => a.ab)).toEqual([String(CHUNK), String(CHUNK * 2)]);
    expect(eintrag("fiaaaaaaaa").dataset.zustand).toBe("fertig");
  });

  /**
   * EIN KNOPF, DER NICHTS TUN KANN, DARF NICHT DASTEHEN. Meldet die Action mehr
   * Dateien zurueck, als noch ausgewaehlt sind (die Auswahl hat sich zwischen
   * Absenden und Antwort geaendert), traegt der Eintrag keine `File` — die
   * Schleife legt in diesem Zweig bewusst nichts in `dateienRef` ab. Ein
   * „Wiederholen" haette dort nichts zu wiederholen: der Klick liefe still ins
   * Leere, ohne Rueckmeldung. Der Weg steht in der Meldung des Eintrags.
   *
   * Die Gegenprobe („ein Fehler MIT Datei behaelt den Knopf") steht im Fall
   * darueber: der klickt ihn, und `query()` wirft, wenn er fehlt.
   */
  it("bietet KEIN Wiederholen an, wo die Datei nicht mehr ausgewaehlt ist", async () => {
    await mount(insel());
    await waehle(datei("eine.png", REST, "image/png"));
    await sendeUndAntworte(
      erfolg("sh1234abcd", [
        { fileId: "fiaaaaaaaa", name: "eine.png" },
        { fileId: "fibbbbbbbb", name: "verschwunden.png" },
      ]),
    );

    expect(eintrag("fibbbbbbbb").dataset.zustand).toBe("fehler");
    expect(eintrag("fibbbbbbbb").textContent).toContain("nicht mehr ausgewählt");
    expect(
      queryAll('[data-file-id="fibbbbbbbb"] [data-aktion="wiederholen"]'),
      "ein Wiederholen ohne Datei waere ein Knopf ohne Wirkung",
    ).toHaveLength(0);
    // Der Abbrechen-Weg bleibt: die Zeile ohne Bytes muss entfernbar sein.
    expect(queryAll('[data-file-id="fibbbbbbbb"] [data-aktion="abbrechen"]')).toHaveLength(1);
  });
});

describe("Sitzungsverlust mitten im Upload", () => {
  /**
   * DIE STILLE KLASSE: `requireFilesAccess()` antwortet auf eine abgelaufene
   * Sitzung mit `redirect("/login?…")`, Next macht daraus eine 307 — und `fetch`
   * FOLGT ihr (Vorgabe `redirect: "follow"`). Was ankommt, ist die Anmeldeseite:
   * HTTP 200, `text/html`, `ok === true`. Eine Schleife, die allein `ok` liest,
   * quittiert damit Chunks, von denen kein einziges Byte angekommen ist, und
   * meldet am Ende „Alle Dateien sind übertragen." Es gibt keinen Statuscode,
   * an dem das auffiele — nur `Response.redirected`.
   *
   * Die Weiterleitung faellt hier auf den ZWEITEN Chunk und nicht auf den
   * ersten: das ist der Fall, um den es geht (die Sitzung geht MITTEN im Upload
   * verloren), und nur so ist auch zusicherbar, dass der Offset NICHT
   * weiterrueckt — sonst waere die Fortsetzung, die die Meldung zusagt, um
   * einen Chunk daneben.
   */
  it("eine gefolgte Weiterleitung ist KEIN uebertragener Chunk", async () => {
    let n = 0;
    regie = (a) => {
      if (a.method !== "PUT") return { status: 204 };
      n += 1;
      // Die Antwort der Anmeldeseite: 200, aber von einer fremden Adresse.
      if (n === 2) return { status: 200, redirected: true };
      return { status: 200, koerper: {} };
    };
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));

    expect(puts(), "nach der Weiterleitung darf kein weiterer Chunk folgen").toHaveLength(2);
    expect(eintrag("fi1234abcd").dataset.zustand).toBe("fehler");
    expect(eintrag("fi1234abcd").textContent).toContain("Anmeldung ist abgelaufen");
    // Der Stand bleibt beim letzten WIRKLICH angekommenen Chunk.
    expect(gesendet("fi1234abcd")).toBe(CHUNK);
    // Und der Weg, den die Meldung zusagt, steht auch da: „Wiederholen" haengt
    // seit dieser Runde an der vorhandenen Datei, nicht mehr am Zustand allein.
    expect(
      queryAll('[data-file-id="fi1234abcd"] [data-aktion="wiederholen"]'),
      "die Meldung sagt eine Fortsetzung zu — der Knopf dafuer muss dastehen",
    ).toHaveLength(1);
    // Und die Erfolgsmeldung der ganzen Uebertragung bleibt aus.
    expect(query('[data-testid="files-upload-insel"]').textContent).not.toContain(
      "Alle Dateien sind übertragen",
    );
  });
});

describe("Wiederanstoss", () => {
  /**
   * NACH DEM ERFOLG BLEIBT DAS DATEIFELD BEDIENBAR (`disabled` steht nur am
   * Absende-Knopf), und `auswahl` ist Dependency desselben Effekts, der die
   * Bytes anstoesst. Ohne die Wache auf `state.shareId` setzte eine neue Auswahl
   * die Liste neu auf und lueden die bereits FERTIGEN Dateien der alten Freigabe
   * ab Byte 0 erneut hoch — der Server antwortete „bereits vollstaendig" (409),
   * und eine abgeschlossene Uebertragung stuende danach auf `fehler`.
   */
  it("eine neue Dateiauswahl stoesst die abgeschlossene Freigabe nicht erneut an", async () => {
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));
    expect(eintrag("fi1234abcd").dataset.zustand).toBe("fertig");

    const vorher = puts().length;
    await waehle(datei("nachtrag.png", REST, "image/png"));

    // Gezaehlt und nicht verglichen: ein erneut laufender Effekt schickte
    // dieselben `fileId`s noch einmal los — eine Pruefung auf Gleichheit der
    // Kennungen saehe das nicht.
    expect(puts().length, "eine neue Auswahl darf keinen Chunk ausloesen").toBe(vorher);
    expect(eintrag("fi1234abcd").dataset.zustand).toBe("fertig");
    expect(gesendet("fi1234abcd")).toBe(CHUNK * 2 + REST);
  });
});

describe("Die Statuscodes, auf die die Insel antworten muss", () => {
  it("415 kommt als Meldung AM Datei-Eintrag an, nicht als Seitenfehler", async () => {
    regie = (a) =>
      a.ende ? { status: 415, koerper: { fehler: "Der Inhalt gehört zu keinem der erlaubten Formate (…)." } } : { status: 200 };
    await mount(insel());
    await waehle(datei("bild.png", REST, "image/png"));
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bild.png" }]));

    expect(eintrag("fi1234abcd").dataset.zustand).toBe("fehler");
    expect(eintrag("fi1234abcd").textContent).toContain("erlaubten Formate");
  });

  it("413 traegt die GRENZE samt Einheit weiter, statt sie zu verschlucken", async () => {
    regie = () => ({
      status: 413,
      koerper: {
        fehler: "Die Datei ist zu groß. Erlaubt sind höchstens 12 MiB.",
        grenzeBytes: 12_582_912,
      },
    });
    await mount(insel());
    await waehle(datei("bild.png", REST, "image/png"));
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bild.png" }]));

    expect(eintrag("fi1234abcd").textContent).toContain(
      "Die Datei ist zu groß. Erlaubt sind höchstens 12 MiB.",
    );
  });

  /**
   * 409 ist der EINZIGE Statuscode, der kein Fehler ist, sondern eine Anweisung:
   * `erwartetesOffsetBytes` ist der Wiederaufsetzpunkt aus T27. Wer ihn als
   * Fehler behandelt, macht aus einem wiederaufnehmbaren Upload einen
   * abgebrochenen.
   */
  it("409 mit `erwartetesOffsetBytes` setzt an DIESEM Offset auf", async () => {
    let erster = true;
    regie = (a) => {
      if (a.method !== "PUT") return { status: 204 };
      if (erster) {
        erster = false;
        return { status: 409, koerper: { erwartetesOffsetBytes: CHUNK } };
      }
      return { status: 200, koerper: a.ende ? { fertig: true } : {} };
    };
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));

    expect(puts().map((a) => a.ab)).toEqual(["0", String(CHUNK), String(CHUNK * 2)]);
    expect(eintrag("fi1234abcd").dataset.zustand).toBe("fertig");
  });

  it("409 auf denselben Offset ist ein Fehler und keine Endlosschleife", async () => {
    regie = (a) =>
      a.method === "PUT" ? { status: 409, koerper: { erwartetesOffsetBytes: 0 } } : { status: 204 };
    await mount(insel());
    await waehle(GROSS());
    await sendeUndAntworte(erfolg("sh1234abcd", [{ fileId: "fi1234abcd", name: "bericht.png" }]));

    expect(puts()).toHaveLength(1);
    expect(eintrag("fi1234abcd").dataset.zustand).toBe("fehler");
  });
});

describe("Das Formular", () => {
  it("schickt die Dateinamen als Text, aber NIE die Bytes durch die Server Action", async () => {
    await mount(insel());
    await waehle(GROSS(), datei("zweite.png", REST, "image/png"));

    // Ein `name` am Dateifeld haenge die Bytes an die Server-Action-Nutzlast —
    // und die kappt bei 1 MB mit HTTP 413 (§7.1, Kappungsebene 3).
    expect(query<HTMLInputElement>('input[type="file"]').hasAttribute("name")).toBe(false);
    const namen = queryAll<HTMLInputElement>('input[type="hidden"][name="dateien"]');
    expect(namen.map((n) => n.value)).toEqual(["bericht.png", "zweite.png"]);
  });

  it("reicht `anlegenAction` an `useActionState` durch — der Wrapper ruft sie mit dem FormData", async () => {
    await mount(insel());
    const [schritt, anfang] = useActionStateMock.mock.calls[0] as [
      (bisher: AnlegenErgebnis, formData: FormData) => Promise<AnlegenErgebnis>,
      AnlegenErgebnis,
    ];
    expect(anfang).toEqual(START);

    const daten = new FormData();
    daten.set("title", "Lagebericht");
    anlegenActionMock.mockResolvedValue(erfolg("sh1234abcd", []));
    await schritt(START, daten);
    expect(anlegenActionMock).toHaveBeenCalledWith(daten);
  });

  it("meldet Feldfehler AM Feld und stellt die Eingaben wieder her", async () => {
    await mount(insel());
    zustand = {
      ok: false,
      feldFehler: { title: "Bitte einen Titel angeben.", expiryDays: "Laufzeit in ganzen Tagen, 1 bis 7." },
      werte: { title: "", description: "", expiryDays: "99", maxDownloads: "" },
    };
    await rerender(insel());

    const titel = query<HTMLInputElement>('input[name="title"]');
    expect(titel.getAttribute("aria-invalid")).toBe("true");
    expect(query(`#${titel.getAttribute("aria-describedby")}`).textContent).toContain(
      "Bitte einen Titel angeben.",
    );
    expect(query<HTMLInputElement>('input[name="expiryDays"]').value).toBe("99");
    // KEIN Passwortfeld in `werte` — es kaeme im RSC-Nutzlast derselben Antwort
    // zurueck und stuende als Attribut im Markup (`AnlegenErgebnis`).
    expect(query<HTMLInputElement>('input[name="password"]').value).toBe("");
  });

  it("setzt auf Bedienelementen kein `size` — `controlHeight` ist 56, `size=\"large\"` waeren 72px", () => {
    const quelle = readFileSync(join("src", "app", "m", "files", "_ui", "UploadInsel.tsx"), "utf8");
    expect(quelle.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/size="large"/);
  });
});

/**
 * DER QUELLTEXT-SCAN — die ehrliche Ebene fuer die beiden Fallen, die zur
 * Laufzeit HTTP 500 ergeben und die weder `pnpm build` noch ein Vitest sehen
 * kann (`docs/design/README.md:87-103`, `:39-44`).
 */
describe("Quelltext — die Naht zur Server Component", () => {
  const lies = (...teile: string[]) =>
    readFileSync(join("src", "app", "m", "files", ...teile), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );

  it("die Insel ist eine Client-Insel und die Seite ist es nicht", () => {
    expect(lies("_ui", "UploadInsel.tsx")).toMatch(/^"use client";/);
    expect(lies("(verwaltung)", "shares", "neu", "page.tsx")).not.toMatch(/"use client"/);
  });

  it("die Seite importiert aus der Insel NUR die Komponente, keine Konstante", () => {
    const seite = lies("(verwaltung)", "shares", "neu", "page.tsx");
    const einfuhr = [...seite.matchAll(/import\s+\{([^}]+)\}\s+from\s+"[^"]*UploadInsel"/g)].flatMap(
      (m) => m[1].split(",").map((s) => s.trim()),
    );
    expect(einfuhr.length, "die Seite importiert nichts aus der Insel").toBeGreaterThan(0);
    // Bei einem Upload-Modul ist `FILES_CHUNK_BYTES` der naheliegende Kandidat
    // (Analyse Falle 13) — er kaeme als Client-Referenz an, nicht als Zahl.
    expect(einfuhr).toEqual(["UploadInsel"]);
  });

  it("die Grenzen kommen aus `_lib/grenzen.ts`, das kein `\"use client\"` traegt", () => {
    expect(lies("_lib", "grenzen.ts")).not.toMatch(/"use client"/);
    expect(lies("_ui", "UploadInsel.tsx")).toMatch(/from "\.\.\/_lib\/grenzen"/);
    // `grenzen()` liest `process.env` und ist im Browser leer — die Insel darf
    // nur die KONSTANTE lesen, die Zahlen kommen als Props aus der Seite.
    expect(lies("_ui", "UploadInsel.tsx")).not.toMatch(/\bgrenzen\s*\(/);
  });

  it("verlinkt nicht auf Seiten, die es noch nicht gibt (kein Weg in ein `notFound()`)", () => {
    const beide = lies("_ui", "UploadInsel.tsx") + lies("(verwaltung)", "shares", "neu", "page.tsx");
    // `/shares/<id>` (T41) und `/s/<id>` (T40) entstehen erst in Welle 7.
    expect(beide).not.toMatch(/href=\{?["'`]\/s\//);
    expect(beide).not.toMatch(/\/shares\/\$\{/);
  });
});
