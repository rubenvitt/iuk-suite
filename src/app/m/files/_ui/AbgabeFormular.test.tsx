// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { click, exists, mount, query, queryAll, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { AbgabeFormular } from "./AbgabeFormular";
import { FILES_CHUNK_BYTES, FILES_HINWEIS_MAX_ZEICHEN } from "../_lib/grenzen";
import { SCHREIBBARE_KATEGORIEN } from "../_lib/kategorien";

/**
 * DAS ABGABEFORMULAR AUF EINEM FREMDEN HANDY (Spec §8.1–§8.3, Plan T38).
 *
 * Diese Datei besitzt vier Aussagen, die weder `pnpm build` noch `typecheck`
 * noch ein e2e-Lauf billig hätte:
 *
 * 1. **Das Drahtformat von T31**, Parameter für Parameter. `name`, `kategorie`
 *    und `hinweis` liest `eroeffne()` NUR beim ersten Chunk (ohne `id`), `typ`
 *    liest `schliesseAb()` NUR beim letzten (`ende=1`) — und `typ` steht in der
 *    QUERY, nicht im `Content-Type`-Kopf. Ein Formular, das die Deklaration
 *    weglässt, lädt PNG, JPEG und PDF anstandslos hoch (die haben Signaturen)
 *    und bekommt für `.txt` und die drei Office-Formate ein 415: für
 *    `text/plain` ist die Deklaration das einzige Positivsignal
 *    (`_lib/mime.ts`). Die Lücke fällt also genau bei den vier Typen auf, die
 *    niemand zuerst probiert.
 * 2. **Der Hinweis wird in CODE POINTS gezählt** (§8.3). Ein Test mit
 *    ASCII-Text ginge gegen eine `.length`-Prüfung durch — 300 Emoji sind 600
 *    UTF-16-Einheiten und müssen ANGENOMMEN werden.
 * 3. **Jeder Fehler steht am Dateieintrag**, nicht über dem Formular. Bei
 *    mehreren Dateien wäre ein Sammelfehler nicht zuzuordnen; die Prüfungen
 *    unten suchen deshalb IM Eintrag und zählen die Vorkommen im ganzen Baum.
 * 4. **Eine gescheiterte Datei hält die übrigen nicht auf.**
 * 5. **Der nächste `ab` ist der Stand des SERVERS.** Ein Stub, der `empfangen`
 *    genau auf das Ende des geschickten Abschnitts setzt, kann das nicht messen
 *    — beide Zählungen stimmen dann per Konstruktion überein, und `stand.ab =
 *    bis` bliebe grün. Der Fall, der ihn trennt, ist der teuerste des Moduls:
 *    hält der Server nach einem Abriss weniger Bytes, überspringt eine
 *    Fortsetzung einen Bereich, und der Blob ist still beschädigt.
 * 6. **Der Absende-Knopf ist ein Einstiegspunkt und muss es bleiben** — er darf
 *    weder endgültig Abgelehntes erneut schicken noch stumm ins Leere fallen,
 *    und die Riegel davor dürfen den letzten Ausweg nicht mitverschließen.
 *
 * DIE VIER ANTWORTEN STELLT DIESER TEST SELBST HER (gestubbtes `fetch`). Dass
 * T50 den 429-Weg in derselben Stufe baut, erzeugt deshalb keine
 * Abhängigkeitskante: das Formular bildet auf STATUSCODES ab, nicht auf T50s
 * Code.
 *
 * WAS DIESE DATEI NICHT BESITZT: jsdom wertet weder Media Queries noch die
 * native Pfeiltastenauswahl einer Radiogruppe aus. Die Radiogruppe wird deshalb
 * STRUKTURELL geprüft (ein `name`, kein `tabindex`, `fieldset` + `legend`) —
 * genau die Bauform, aus der der Browser den einen Tabstop und die
 * Pfeiltastenauswahl selbst ableitet. Ein Test, der `ArrowDown` schickt, prüfte
 * jsdom und triebe den Code in einen eigenen Tastenhandler, den die Regel
 * gerade verhindern soll.
 */

const TOKEN = "dz-2345-6789-abcd";

/** Alle Anfragen des gestubbten `fetch`, in Reihenfolge. */
let aufrufe: string[] = [];
/** Was der Stub auf den n-ten Aufruf antwortet. */
type Antwort = { status: number; koerper?: unknown; werfen?: unknown };
let antwortGeber: (url: string, nr: number) => Antwort;

/**
 * Eine Datei mit echten Bytes — `Blob.slice` muss darauf arbeiten können, sonst
 * misst der Chunk-Test nichts. `typ` ist Pflichtparameter und nicht vorbelegt:
 * genau seine Abwesenheit ist der Defekt, den Punkt 1 oben beschreibt.
 */
function datei(name: string, typ: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type: typ });
}

/**
 * Setzt `input.files`. `DataTransfer` ist in jsdom nicht vollständig, und die
 * Zuweisung an `files` ist im echten Browser gesperrt — deshalb der
 * Eigenschafts-Umweg. Danach ein echtes `change`-Ereignis, damit React seinen
 * Handler wirklich läuft und der Test nicht am Zustand vorbei arbeitet.
 */
async function waehle(dateien: File[]): Promise<void> {
  const feld = query<HTMLInputElement>("#abgabe-dateien");
  const liste = {
    length: dateien.length,
    item: (i: number) => dateien[i] ?? null,
    ...Object.fromEntries(dateien.map((d, i) => [i, d])),
    [Symbol.iterator]: function* () {
      yield* dateien;
    },
  };
  Object.defineProperty(feld, "files", { value: liste, configurable: true });
  await act(async () => {
    feld.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Der Textbereich, über den Prototyp-Setter (React trackt den Wert). */
async function tippeHinweis(text: string): Promise<void> {
  const feld = query<HTMLTextAreaElement>("#abgabe-hinweis");
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  setter!.call(feld, text);
  await act(async () => {
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * Über den Prototyp-Setter, aus demselben Grund wie `fill` im Harness: React
 * hängt an `checked` einen eigenen Tracker, und eine direkte Zuweisung liest er
 * als „unverändert" — `onChange` bliebe aus und die Kategorie wäre im Test
 * still leer (nachgemessen: `kategorie` fehlte in der Anfrage).
 */
async function waehleKategorie(wert: string): Promise<void> {
  const feld = query<HTMLInputElement>(`input[type="radio"][value="${wert}"]`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "checked")?.set;
  setter!.call(feld, true);
  await act(async () => {
    feld.dispatchEvent(new Event("click", { bubbles: true }));
    feld.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * Direkt am Formular ausgelöst und nicht über den Knopf — dieselbe Begründung
 * wie im Harness: ein deaktivierter Knopf verschluckte das Ereignis, und genau
 * dann muss der Absende-Guard im Code greifen (etwa die Hinweis-Grenze, die vor
 * dem ersten Byte gilt).
 */
async function abgeben(): Promise<void> {
  await submitForm('[data-testid="abgabe-formular"]');
}

function eintrag(name: string): HTMLElement {
  return query(`[data-testid="abgabe-eintrag"][data-datei="${name}"]`);
}

/** Hat GENAU diese Datei einen Wiederholen-Knopf? */
function hatWiederholenAn(name: string): boolean {
  return eintrag(name).querySelector('[data-testid="eintrag-wiederholen"]') !== null;
}

/** Wie oft ein Text im GANZEN gemounteten Baum steht — der Riegel gegen Sammelfehler. */
function vorkommen(text: string): number {
  const gesamt = query('[data-testid="abgabe-formular"]').textContent ?? "";
  return gesamt.split(text).length - 1;
}

const parameter = (url: string): URLSearchParams =>
  new URL(url, "http://drop.localtest.me").searchParams;

/**
 * Der Erfolgsfall des Servers, aus der URL abgeleitet: der letzte Chunk meldet
 * die Gesamtgröße und `fertig: true`, jeder andere den erreichten Stand. So
 * bleibt der Stub für ein- und mehrteilige Dateien derselbe.
 */
function erfolgAus(groessen: Record<string, number>): (url: string) => Antwort {
  const namen = new Map<string, string>();
  let zaehler = 0;
  return (url) => {
    const p = parameter(url);
    let id = p.get("id");
    if (id === null) {
      id = `inbox-${++zaehler}`;
      namen.set(id, p.get("name") ?? "");
    }
    const name = namen.get(id) ?? "";
    const gesamt = groessen[name] ?? 0;
    const ab = Number(p.get("ab"));
    const ende = p.get("ende") === "1";
    return {
      status: 200,
      koerper: {
        id,
        empfangen: ende ? gesamt : Math.min(ab + FILES_CHUNK_BYTES, gesamt),
        fertig: ende,
      },
    };
  };
}

beforeEach(() => {
  aufrufe = [];
  antwortGeber = () => ({ status: 200, koerper: { id: "x", empfangen: 0, fertig: true } });
  vi.stubGlobal("fetch", (eingabe: unknown) => {
    const url = String(eingabe);
    aufrufe.push(url);
    const a = antwortGeber(url, aufrufe.length);
    if (a.werfen !== undefined) return Promise.reject(a.werfen);
    // Kein `new Response(…)`: in der jsdom-Umgebung ist die Klasse nicht
    // zugesichert. Das Formular liest genau diese drei Glieder.
    return Promise.resolve({
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      json: async () => a.koerper ?? {},
    });
  });
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe("AbgabeFormular — Aufbau", () => {
  it("nennt in einem `<noscript>`-Block den Weg ohne JavaScript", async () => {
    await mount(<AbgabeFormular token={TOKEN} />);
    // In jsdom ist der Inhalt eines `<noscript>` ein roher Textknoten und kein
    // DOM — deshalb `textContent` und kein verschachtelter Selektor.
    const text = query("noscript").textContent ?? "";
    expect(text).toMatch(/JavaScript/);
    expect(text.length).toBeGreaterThan(40);
  });

  it("bietet die Kategorien als echte Radiogruppe an — ein Name, kein `tabindex`, `fieldset` mit `legend`", async () => {
    await mount(<AbgabeFormular token={TOKEN} />);

    const gruppe = query('[data-testid="abgabe-kategorie"]');
    expect(gruppe.tagName).toBe("FIELDSET");
    expect(gruppe.querySelector("legend")).not.toBeNull();

    const radios = queryAll<HTMLInputElement>('[data-testid="abgabe-kategorie"] input');
    // Die WERTE kommen aus `_lib/kategorien.ts`, nicht aus Literalen im
    // Formular: `istSchreibbareKategorie` vergleicht exakt, ein Tippfehler wäre
    // ein 400 „kategorie" — und den sähe ein gestubbter `fetch` nie.
    expect(radios.map((r) => r.value)).toEqual(SCHREIBBARE_KATEGORIEN.map((k) => k.wert));
    for (const r of radios) {
      expect(r.type).toBe("radio");
      // EIN Name für alle: daraus leitet der Browser den einen Tabstop und die
      // Pfeiltastenauswahl ab. Verschiedene Namen ergäben drei Tabstops und
      // erlaubten Mehrfachauswahl.
      expect(r.name).toBe(radios[0].name);
      expect(r.hasAttribute("tabindex")).toBe(false);
      // KEINE Vorauswahl: „ohne Kategorie" ist ein zulässiger Zustand (NULL in
      // der Spalte). Eine Vorbelegung hängte jeder Abgabe eine Kategorie an,
      // die niemand gewählt hat.
      expect(r.checked).toBe(false);
    }
  });

  it("nimmt mehrere Dateien an und schneidet den Hinweis nirgends ab", async () => {
    await mount(<AbgabeFormular token={TOKEN} />);
    const feld = query<HTMLInputElement>("#abgabe-dateien");
    expect(feld.multiple).toBe(true);
    // `webkitdirectory` wäre Ordnerauswahl statt Dateiauswahl (§8.2).
    expect(feld.hasAttribute("webkitdirectory")).toBe(false);

    // KEIN `maxlength`: die Grenze wird GEMELDET, nicht erzwungen. Ein
    // `maxlength` schnitte still ab — und zwar in UTF-16-Einheiten, also bei
    // Emoji mitten in einem Zeichen.
    const hinweis = query<HTMLTextAreaElement>("#abgabe-hinweis");
    expect(hinweis.hasAttribute("maxlength")).toBe(false);
  });
});

describe("AbgabeFormular — Hinweis in Code Points (§8.3)", () => {
  it("nimmt 300 Emoji an — 600 UTF-16-Einheiten sind 300 Code Points", async () => {
    antwortGeber = erfolgAus({ "notiz.txt": 5 });
    await mount(<AbgabeFormular token={TOKEN} />);

    const text = "🚒".repeat(300);
    // Die Probe auf die Probe: mit `.length` wäre dieser Text „zu lang".
    expect(text.length).toBe(600);
    expect(Array.from(text).length).toBe(300);

    await tippeHinweis(text);
    await waehle([datei("notiz.txt", "text/plain", 5)]);
    await abgeben();

    expect(aufrufe).toHaveLength(1);
    expect(parameter(aufrufe[0]).get("hinweis")).toBe(text);
  });

  it("nimmt GENAU 500 Code Points an — die Grenze selbst ist erlaubt", async () => {
    antwortGeber = erfolgAus({ "notiz.txt": 5 });
    await mount(<AbgabeFormular token={TOKEN} />);

    // Der Grenzwert SELBST, nicht 300 und nicht 501: aus `>` versehentlich `>=`
    // zu machen wiese genau die Abgabe ab, die die Grenze einhält — und der
    // Client stünde gegen den Server verschoben, der ebenfalls `>` prüft
    // (`api/u/[token]/upload/route.ts`, `eroeffne()`).
    const text = "🚒".repeat(FILES_HINWEIS_MAX_ZEICHEN);
    await tippeHinweis(text);
    await waehle([datei("notiz.txt", "text/plain", 5)]);
    await abgeben();

    expect(exists('[data-testid="hinweis-fehler"]')).toBe(false);
    expect(aufrufe).toHaveLength(1);
    expect(parameter(aufrufe[0]).get("hinweis")).toBe(text);
  });

  it("meldet 501 Code Points AM FELD, ohne zu senden und ohne zu kürzen", async () => {
    await mount(<AbgabeFormular token={TOKEN} />);

    const text = "🚒".repeat(FILES_HINWEIS_MAX_ZEICHEN + 1);
    await tippeHinweis(text);
    await waehle([datei("notiz.txt", "text/plain", 5)]);
    await abgeben();

    const meldung = query('[data-testid="hinweis-fehler"]').textContent ?? "";
    expect(meldung).toMatch(new RegExp(String(FILES_HINWEIS_MAX_ZEICHEN)));
    // NICHT abgeschnitten: der eingetippte Text steht unverändert im Feld.
    expect(query<HTMLTextAreaElement>("#abgabe-hinweis").value).toBe(text);
    // Und nichts ist unterwegs — die Grenze gilt vor dem ersten Byte.
    expect(aufrufe).toHaveLength(0);
  });
});

describe("AbgabeFormular — das Drahtformat aus T31", () => {
  it("schickt Name, Kategorie und Hinweis im ERSTEN Chunk und die Typdeklaration im LETZTEN", async () => {
    const gross = FILES_CHUNK_BYTES + 1024;
    antwortGeber = erfolgAus({ "Übung_Größe.pdf": gross });
    await mount(<AbgabeFormular token={TOKEN} />);

    await tippeHinweis("Lage Nord");
    await waehleKategorie("dokumente");
    await waehle([datei("Übung_Größe.pdf", "application/pdf", gross)]);
    await abgeben();

    expect(aufrufe).toHaveLength(2);

    const erster = parameter(aufrufe[0]);
    expect(erster.get("ab")).toBe("0");
    expect(erster.get("id")).toBeNull();
    expect(erster.get("name")).toBe("Übung_Größe.pdf");
    expect(erster.get("kategorie")).toBe("dokumente");
    expect(erster.get("hinweis")).toBe("Lage Nord");
    // Die Deklaration gehört NICHT hierher: `schliesseAb()` liest sie beim
    // letzten Chunk, hier stünde sie folgenlos.
    expect(erster.get("ende")).toBeNull();

    const zweiter = parameter(aufrufe[1]);
    expect(zweiter.get("ab")).toBe(String(FILES_CHUNK_BYTES));
    expect(zweiter.get("id")).toBe("inbox-1");
    expect(zweiter.get("ende")).toBe("1");
    expect(zweiter.get("typ")).toBe("application/pdf");
    // Metadaten NUR im ersten Chunk: `eroeffne()` läuft nur ohne `id`, hier
    // wären sie stumm — und der Hinweis einer 5-MiB-Datei ginge verloren.
    expect(zweiter.get("name")).toBeNull();
    expect(zweiter.get("hinweis")).toBeNull();
  });

  it("schickt `typ=text/plain` mit — ohne die Deklaration lehnt der Server jede `.txt` ab", async () => {
    antwortGeber = erfolgAus({ "lage.txt": 12 });
    await mount(<AbgabeFormular token={TOKEN} />);

    await waehle([datei("lage.txt", "text/plain", 12)]);
    await abgeben();

    expect(aufrufe).toHaveLength(1);
    const p = parameter(aufrufe[0]);
    expect(p.get("ende")).toBe("1");
    // `text/plain` ist der EINZIGE Allowlist-Typ ohne Signatur (`_lib/mime.ts`):
    // ohne diese Zeile gäbe es 415 statt einer Quittung.
    expect(p.get("typ")).toBe("text/plain");
  });

  /**
   * Die Zusage aus Punkt 3 des Dateikopfes: der nächste `ab` ist der Stand, den
   * der SERVER meldet, nicht der selbst mitgezählte.
   *
   * DER STUB MUSS DAFÜR ABWEICHEN. Antwortet er `empfangen` = das Ende des
   * gerade geschickten Abschnitts (so wie `erfolgAus`), stimmen beide Zählungen
   * per Konstruktion überein und die Aussage ist unsichtbar — nachgemessen:
   * `stand.ab = bis` ließ die Suite vollständig grün.
   *
   * Der Fall ist nicht konstruiert: nach einem Verbindungsabriss hält der Server
   * regelmäßig weniger Bytes, als der Client geschickt zu haben glaubt. Wer dann
   * die eigene Rechnung fortschreibt, überspringt einen Bereich; der Blob ist
   * still beschädigt, und die Magic-Byte-Prüfung liest nur den Kopf.
   */
  it("setzt den nächsten Abschnitt auf den Stand des SERVERS, nicht auf die eigene Rechnung", async () => {
    const gesamt = 2 * FILES_CHUNK_BYTES;
    const FEHLBETRAG = 4096;
    antwortGeber = (url, nr) => {
      // Notbremse: ohne sie liefe eine defekte Offsetlogik in `for(;;)` und der
      // Test hinge, statt fehlzuschlagen.
      if (nr > 6) throw new Error("Die Übertragung dreht sich im Kreis");
      const p = parameter(url);
      const bis = Math.min(Number(p.get("ab")) + FILES_CHUNK_BYTES, gesamt);
      return {
        status: 200,
        koerper: {
          id: "inbox-1",
          // Nur der erste Abschnitt kam unvollständig an.
          empfangen: nr === 1 ? bis - FEHLBETRAG : bis,
          fertig: p.get("ende") === "1",
        },
      };
    };
    await mount(<AbgabeFormular token={TOKEN} />);

    await waehle([datei("video.mp4", "video/mp4", gesamt)]);
    await abgeben();

    // Der zweite Abschnitt setzt bei dem an, was der Server hält — nicht bei
    // `FILES_CHUNK_BYTES`.
    expect(parameter(aufrufe[1]).get("ab")).toBe(String(FILES_CHUNK_BYTES - FEHLBETRAG));
    // Und deshalb braucht die Datei DREI Abschnitte statt zwei: die fehlenden
    // Bytes werden nachgeholt, nicht übersprungen.
    expect(aufrufe).toHaveLength(3);
    expect(parameter(aufrufe[2]).get("ende")).toBe("1");
    expect(eintrag("video.mp4").querySelector('[data-testid="eintrag-quittung"]')).not.toBeNull();
  });

  /**
   * 409 ist der Fall „unsere Stände sind auseinandergelaufen". Der Server nennt
   * in `erwartetesAb`, wo er wirklich steht (`route.ts`, `fortschritt(ziel)` und
   * der EEXIST-Zweig). Ohne die Übernahme setzte jede Wiederholung wieder am
   * alten Offset an und liefe erneut in 409 — für den Melder ein Formular, das
   * hängt.
   */
  it("übernimmt bei 409 den Stand des Servers, damit Wiederholen eine FORTSETZUNG wird", async () => {
    const gesamt = 2 * FILES_CHUNK_BYTES;
    const ERWARTET = 4096;
    antwortGeber = (url, nr) => {
      if (nr > 6) throw new Error("Die Übertragung dreht sich im Kreis");
      if (nr === 2) {
        return {
          status: 409,
          koerper: {
            code: "offset",
            fehler: `Dieser Abschnitt passt nicht: erwartet wurde Byte ${ERWARTET}.`,
            erwartetesAb: ERWARTET,
          },
        };
      }
      const p = parameter(url);
      return {
        status: 200,
        koerper: {
          id: "inbox-1",
          empfangen: Math.min(Number(p.get("ab")) + FILES_CHUNK_BYTES, gesamt),
          fertig: p.get("ende") === "1",
        },
      };
    };
    await mount(<AbgabeFormular token={TOKEN} />);

    await waehle([datei("video.mp4", "video/mp4", gesamt)]);
    await abgeben();

    expect(aufrufe).toHaveLength(2);
    const bisher = aufrufe.length;
    await click(
      '[data-testid="abgabe-eintrag"][data-datei="video.mp4"] [data-testid="eintrag-wiederholen"]',
    );

    const fortsetzung = parameter(aufrufe[bisher]);
    expect(fortsetzung.get("ab")).toBe(String(ERWARTET));
    // FORTSETZUNG und nicht zweiter Anfang: dieselbe Zeile, kein `eroeffne()`.
    // Ein `ab` allein erfüllte auch ein Client, der eine neue Abgabe beginnt —
    // und der hinterließe eine Waise im Posteingang.
    expect(fortsetzung.get("id")).toBe("inbox-1");
    expect(fortsetzung.get("name")).toBeNull();
  });

  it("adressiert den Abgabeweg des eigenen Tokens", async () => {
    antwortGeber = erfolgAus({ "a.txt": 3 });
    await mount(<AbgabeFormular token={TOKEN} />);
    await waehle([datei("a.txt", "text/plain", 3)]);
    await abgeben();

    expect(aufrufe[0].startsWith(`/api/u/${TOKEN}/upload?`)).toBe(true);
  });
});

describe("AbgabeFormular — Fortschritt und Quittung je Datei", () => {
  it("führt für jede Datei einen eigenen Fortschritt und eine eigene Quittung", async () => {
    antwortGeber = erfolgAus({ "eins.txt": 10, "zwei.png": 20 });
    await mount(<AbgabeFormular token={TOKEN} />);

    await waehle([datei("eins.txt", "text/plain", 10), datei("zwei.png", "image/png", 20)]);
    // Beide Einträge stehen schon VOR dem Absenden — wer nichts sieht, weiß
    // nicht, ob die Auswahl angekommen ist.
    expect(queryAll('[data-testid="abgabe-eintrag"]')).toHaveLength(2);

    await abgeben();

    for (const [name, groesse] of [
      ["eins.txt", 10],
      ["zwei.png", 20],
    ] as const) {
      const zeile = eintrag(name);
      const balken = zeile.querySelector<HTMLProgressElement>(
        '[data-testid="eintrag-fortschritt"]',
      );
      expect(balken, `${name}: kein eigener Fortschritt`).not.toBeNull();
      expect(balken!.max).toBe(groesse);
      expect(balken!.value).toBe(groesse);
      // Text, nicht nur Balken (`docs/design/README.md:133-137`).
      expect(zeile.querySelector('[data-testid="eintrag-quittung"]')?.textContent ?? "").toMatch(
        /\S/,
      );
    }
    // Zwei Quittungen, nicht eine Sammelmeldung.
    expect(queryAll('[data-testid="eintrag-quittung"]')).toHaveLength(2);
  });
});

describe("AbgabeFormular — die vier Fehlerzustände der §10.1-Matrix, je Datei einzeln", () => {
  /**
   * Immer zwei Dateien: die erste scheitert, die zweite muss durchlaufen. Ein
   * Formular, das beim ersten Fehler abbricht, ist mit EINER Datei nicht von
   * einem richtigen zu unterscheiden.
   */
  async function ersteScheitertAn(antwort: Antwort): Promise<void> {
    const erfolg = erfolgAus({ "gut.png": 20 });
    antwortGeber = (url, nr) => (nr === 1 ? antwort : erfolg(url));
    await mount(<AbgabeFormular token={TOKEN} />);
    await waehle([datei("schlecht.bin", "application/octet-stream", 8), datei("gut.png", "image/png", 20)]);
    await abgeben();
  }

  function fehlertext(name: string): string {
    return eintrag(name).querySelector('[data-testid="eintrag-fehler"]')?.textContent ?? "";
  }

  const hatWiederholen = hatWiederholenAn;

  it("(a) zu groß — 413 steht am Eintrag, nicht über dem Formular", async () => {
    await ersteScheitertAn({
      status: 413,
      koerper: { code: "zu-gross", fehler: "Die Datei ist größer als erlaubt (Grenze: 12582912 Bytes)." },
    });

    expect(fehlertext("schlecht.bin")).toMatch(/zu groß/i);
    // Der Servertext trägt die konkrete Zahl und steht als Zusatz daneben.
    expect(fehlertext("schlecht.bin")).toMatch(/12582912/);
    // Nur EINMAL im ganzen Baum: ein zusätzlicher Sammelfehler über dem
    // Formular wäre bei mehreren Dateien nicht zuzuordnen.
    expect(vorkommen("zu groß")).toBe(1);
    // Endgültig — Wiederholen würde dieselbe Datei wieder zu groß machen.
    expect(hatWiederholen("schlecht.bin")).toBe(false);
    // Und die zweite Datei ist trotzdem durch.
    expect(eintrag("gut.png").querySelector('[data-testid="eintrag-quittung"]')).not.toBeNull();
  });

  it("(b) Typ nicht erlaubt — 415 steht am Eintrag, ohne Wiederholen", async () => {
    await ersteScheitertAn({ status: 415, koerper: { code: "typ-nicht-erlaubt" } });

    expect(fehlertext("schlecht.bin")).toMatch(/Dateityp/i);
    expect(hatWiederholen("schlecht.bin")).toBe(false);
    expect(eintrag("gut.png").querySelector('[data-testid="eintrag-quittung"]')).not.toBeNull();
  });

  it("(c) Kontingent erschöpft — 429 mit `code: \"kontingent\"` steht am Eintrag", async () => {
    await ersteScheitertAn({ status: 429, koerper: { code: "kontingent" } });

    expect(fehlertext("schlecht.bin")).toMatch(/Kontingent/i);
    // Ein erschöpftes Kontingent wird durch Wiederholen nicht größer.
    expect(hatWiederholen("schlecht.bin")).toBe(false);
    expect(eintrag("gut.png").querySelector('[data-testid="eintrag-quittung"]')).not.toBeNull();
  });

  it("(c') 429 aus dem Fehlversuchszähler ist ein ANDERER Zustand als das Kontingent", async () => {
    await ersteScheitertAn({ status: 429, koerper: { code: "zu-viele-fehlversuche" } });

    expect(fehlertext("schlecht.bin")).toMatch(/Fehlversuche/i);
    // Der Zähler läuft nach einer Minute ab — hier ist Wiederholen der Weg.
    expect(hatWiederholen("schlecht.bin")).toBe(true);
  });

  it("(d) Netzfehler — Wiederholen sitzt an GENAU dieser Datei und setzt nur sie fort", async () => {
    await ersteScheitertAn({ status: 0, werfen: new TypeError("Failed to fetch") });

    expect(fehlertext("schlecht.bin")).toMatch(/unterbrochen/i);
    expect(hatWiederholen("schlecht.bin")).toBe(true);
    // An der erfolgreichen Datei gibt es nichts zu wiederholen.
    expect(hatWiederholen("gut.png")).toBe(false);

    const bisher = aufrufe.length;
    antwortGeber = erfolgAus({ "schlecht.bin": 8 });
    await click(
      '[data-testid="abgabe-eintrag"][data-datei="schlecht.bin"] [data-testid="eintrag-wiederholen"]',
    );

    // GENAU eine neue Anfrage: die zweite Datei wird nicht noch einmal
    // hochgeladen — das wäre eine Dublette im Posteingang.
    expect(aufrufe).toHaveLength(bisher + 1);
    expect(parameter(aufrufe[bisher]).get("name")).toBe("schlecht.bin");
    expect(eintrag("schlecht.bin").querySelector('[data-testid="eintrag-quittung"]')).not.toBeNull();
    expect(eintrag("schlecht.bin").querySelector('[data-testid="eintrag-fehler"]')).toBeNull();
  });

  it("(e) ungültiger Abgabelink — 401 nennt den Zustand am Eintrag statt einer Fehlerseite", async () => {
    await ersteScheitertAn({ status: 401, koerper: { code: "token" } });

    expect(fehlertext("schlecht.bin")).toMatch(/nicht \(mehr\) gültig/i);
    expect(hatWiederholen("schlecht.bin")).toBe(false);
  });
});

/**
 * DER ABSENDE-KNOPF IST DER EINSTIEGSPUNKT — und er darf weder in einen Weg
 * führen, den der Code selbst als geschlossen führt, noch stumm ins Leere
 * (`docs/design/README.md`, Prüffrage nach dem Einstiegspunkt).
 *
 * Beides hängt an EINER Größe: welche Einträge heute noch offen sind. „Offen"
 * heißt `wartet` ODER ein Fehler, den Wiederholen behebt — ein 413, ein 415 und
 * ein erschöpftes Kontingent gehören NICHT dazu (§10.1). Ohne diese Grenze wäre
 * ein zweiter Klick genau die Schleife, die `meldungZu` am Eintrag verweigert,
 * nur eine Ebene höher: bei einer mehrteiligen Datei hat der Server nach 415 und
 * nach Kontingent bereits `verwirf(ziel, zeile.id)` gerufen, die Wiederholung
 * schickt die gemerkte `id` mit, und der Melder liest statt des Grundes „Diese
 * Abgabe ist nicht mehr offen. Bitte neu beginnen." — eine Aufforderung zu einem
 * Weg, der nie ans Ziel führt.
 */
describe("AbgabeFormular — der Absende-Knopf als Einstiegspunkt", () => {
  function knopf(): HTMLButtonElement {
    return query<HTMLButtonElement>('[data-testid="abgabe-absenden"]');
  }

  /** Erste Datei endgültig abgelehnt, zweite durch — der gemischte Endzustand. */
  async function ersteEndgueltigAbgelehnt(): Promise<void> {
    const erfolg = erfolgAus({ "gut.png": 20 });
    antwortGeber = (url, nr) =>
      nr === 1 ? { status: 413, koerper: { code: "zu-gross" } } : erfolg(url);
    await mount(<AbgabeFormular token={TOKEN} />);
    await waehle([
      datei("schlecht.bin", "application/octet-stream", 8),
      datei("gut.png", "image/png", 20),
    ]);
    await abgeben();
  }

  it("schickt beim ZWEITEN Absenden nichts erneut, was endgültig abgelehnt ist", async () => {
    await ersteEndgueltigAbgelehnt();
    expect(hatWiederholenAn("schlecht.bin")).toBe(false);

    const bisher = aufrufe.length;
    await abgeben();

    // Kein Rundlauf, der nur verlieren kann: die Datei wird durch Wiederholen
    // nicht kleiner, und bei einer mehrteiligen wäre die Antwort ein 404 auf die
    // verworfene Zeile.
    expect(aufrufe).toHaveLength(bisher);
    // Der Knopf sagt das auch — ein aktiver Knopf, der nichts auslöst, ist auf
    // einem fremden Handy von „hat nicht reagiert" nicht zu unterscheiden.
    expect(knopf().disabled).toBe(true);
  });

  it("ist nach einem vollständigen Lauf deaktiviert und heißt „Alles abgegeben“", async () => {
    antwortGeber = erfolgAus({ "eins.txt": 10, "zwei.png": 20 });
    await mount(<AbgabeFormular token={TOKEN} />);
    await waehle([datei("eins.txt", "text/plain", 10), datei("zwei.png", "image/png", 20)]);

    expect(knopf().disabled).toBe(false);
    await abgeben();

    expect(knopf().disabled).toBe(true);
    expect(knopf().textContent).toMatch(/Alles abgegeben/);
  });

  it("heißt bei einer abgelehnten Datei NICHT „Alles abgegeben“", async () => {
    await ersteEndgueltigAbgelehnt();
    // Die Beschriftung ist eine Aussage über den Vorgang. Neben einer
    // zurückgewiesenen Datei wäre sie unwahr; den Grund trägt der Eintrag.
    expect(knopf().textContent).not.toMatch(/Alles abgegeben/);
  });

  it("wird durch eine neue Dateiauswahl wieder bedienbar", async () => {
    await ersteEndgueltigAbgelehnt();
    expect(knopf().disabled).toBe(true);

    // Der Weg nach vorn, der den deaktivierten Knopf erst zulässig macht: andere
    // Dateien wählen. Ohne ihn wäre die Seite nach einer Ablehnung tot.
    antwortGeber = erfolgAus({ "neu.png": 12 });
    await waehle([datei("neu.png", "image/png", 12)]);
    expect(knopf().disabled).toBe(false);

    await abgeben();
    expect(eintrag("neu.png").querySelector('[data-testid="eintrag-quittung"]')).not.toBeNull();
  });

  /**
   * Die Hinweis-Grenze gilt für BEIDE Wege. Läge sie nur im Absende-Handler,
   * schickte „Wiederholen" einen zu langen Hinweis an den Server; der antwortet
   * 400 `hinweis`, und das ist `wiederholbar: false` — die Datei hätte danach
   * weder einen Wiederholen-Knopf noch (nach der Verschärfung oben) einen Weg
   * über den Absende-Knopf. Ein Tippfehler im Hinweis kostete die schon
   * übertragenen Bytes.
   */
  it("prüft die Hinweis-Grenze auch auf dem Wiederholen-Weg und lässt den Weg offen", async () => {
    antwortGeber = () => ({ status: 0, werfen: new TypeError("Failed to fetch") });
    await mount(<AbgabeFormular token={TOKEN} />);
    await waehle([datei("lage.txt", "text/plain", 12)]);
    await abgeben();
    expect(hatWiederholenAn("lage.txt")).toBe(true);

    await tippeHinweis("🚒".repeat(FILES_HINWEIS_MAX_ZEICHEN + 1));
    const bisher = aufrufe.length;
    await click(
      '[data-testid="abgabe-eintrag"][data-datei="lage.txt"] [data-testid="eintrag-wiederholen"]',
    );

    expect(aufrufe).toHaveLength(bisher);
    expect(query('[data-testid="hinweis-fehler"]').textContent ?? "").toMatch(
      new RegExp(String(FILES_HINWEIS_MAX_ZEICHEN)),
    );
    // UND der Weg bleibt offen: nach dem Kürzen ist die Datei weiter zu
    // wiederholen. Ein Riegel, der den einzigen Ausgang mitverschließt, wäre
    // schlimmer als der ungeprüfte Weg.
    expect(hatWiederholenAn("lage.txt")).toBe(true);
  });
});
