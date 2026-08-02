import { describe, expect, it } from "vitest";
import {
  FILES_CHUNK_BYTES,
  FILES_FEHLVERSUCHE_PRO_MIN,
  FILES_HINWEIS_MAX_ZEICHEN,
  GrenzenUngueltig,
  ZAHL_NAMEN,
  grenzen,
  grenzenFehler,
} from "./grenzen";

/*
 * Die Zusage dieser Datei ist eine Abwehr, nicht eine Zahl (Spec §9.1, Analyse
 * Falle 22): beide Alt-Apps erzwingen heute gemessen dieselbe Grenze
 * (524.288.000 Byte, also 500 MiB), tragen sie aber unter Namen mit
 * VERSCHIEDENER Einheit — `MAX_FILE_SIZE` in Byte, `MAX_FILE_SIZE_MB` in MB.
 * Ueberlebt der eine Name mit dem anderen Wert, ist die Grenze entweder
 * praktisch aufgehoben oder 500 Byte. Beide Werte sind `number`, beide
 * Zuweisungen typkorrekt — Build, Typecheck und jeder Test, der nur „ist eine
 * Zahl" prueft, sehen den Unterschied NICHT.
 *
 * Deshalb prueft dieser Test vier Dinge, die kein Werkzeug prueft:
 *  1. die drei Pflichtvariablen haben KEINE Vorbelegung, und ihre Fehlmeldung
 *     nennt Name UND Einheit (eine erfundene Vorbelegung waere genau der
 *     Kommentar „# 500 MB" neben einem MiB-Wert),
 *  2. die Kette `FILES_CHUNK_BYTES < FILES_MAX_DATEI_BYTES ≤ FILES_AV_MAX_BYTES`
 *     in BEIDE Richtungen, mit dem Unterschied zwischen `<` und `≤`,
 *  3. die Bedingtheit: ein Modul ohne Prod-Host nimmt beim Boot `portal`, `qr`
 *     und `feedback` nicht mit,
 *  4. JEDE Zeile der Tabelle aus §9.3 einzeln: ihr Einheitenwort in der Meldung
 *     und ihr Mindestwert. Stichproben genuegen hier nicht — eine Zeile mit dem
 *     falschen Einheitenwort ist genau der Fall, gegen den die ganze Datei
 *     antritt, und sie ist typkorrekt (`Einheit` ist eine Union aus acht
 *     Woertern, jedes passt an jede Zeile).
 *
 * ALLE BYTE-ZAHLEN STEHEN HIER ALS GANZE ZAHLEN, nie als MiB-Rechnung. Das ist
 * keine Stilfrage: die Abnahme von T8 ist ein Grep nach der MiB-Multiplikation
 * ueber `src/app/m/files` mit genau EINEM Treffer (`_lib/grenzen.ts`). Eine
 * Rechnung in dieser Datei waere ein zweiter Treffer — und damit eine zweite
 * Stelle, an der eine Einheit entsteht. Auch dieser Kommentar schreibt sie
 * deshalb nicht aus.
 */

/** Zwei Hosts = das Modul ist erreichbar = die Zahlenpflicht greift (Spec §9.3). */
const HOSTS = { SUITE_HOST_FILES: "files.localtest.me,drop.localtest.me" };

/**
 * Die Dev-/E2E-Werte aus §9.3, wortgleich: 12 MiB, weil sie ueber der
 * 4-MiB-Chunk-Konstante (Pruefung 2) UND ueber den 10 MiB des Next-Proxys
 * liegen muessen; `FILES_AV_MAX_BYTES` gleich gross, weil Pruefung 3
 * Gleichheit erlaubt.
 */
const GUELTIG = {
  ...HOSTS,
  FILES_MAX_DATEI_BYTES: "12582912",
  FILES_AV_MAX_BYTES: "12582912",
  FILES_MAX_ABLAUF_TAGE: "7",
};

/** 4 MiB — der Wert der Konstante `FILES_CHUNK_BYTES`, als Zahl. */
const CHUNK = 4194304;

/**
 * Die E2E-Tabelle aus §9.3, vollstaendig — zehn Zeilen, ELF Variablen
 * (`FILES_AV_HOST` und `FILES_AV_PORT` teilen eine Zeile), plus
 * `SUITE_HOST_FILES`.
 *
 * WARUM SIE HIER STEHT, obwohl T14 sie nach `.env.example` und
 * `playwright.config.ts` traegt: dort ist eine ungueltige Kombination kein
 * roter Test, sondern ein `webServer`, der nie hochkommt — der Boot bricht ab,
 * bevor ein einziger E2E-Test laeuft, und der Befund sieht wie ein
 * Playwright-Problem aus. Diese Zusage gehoert deshalb dorthin, wo die Kette
 * definiert ist.
 */
const E2E = {
  SUITE_HOST_FILES: "files.localtest.me,drop.localtest.me",
  FILES_MAX_DATEI_BYTES: "12582912",
  FILES_AV_MAX_BYTES: "12582912",
  FILES_MAX_ABLAUF_TAGE: "7",
  FILES_AV_HOST: "127.0.0.1",
  FILES_AV_PORT: "3310",
  FILES_AV_TIMEOUT_MS: "2000",
  FILES_AV_VERSUCHE: "2",
  FILES_AV_WIEDERHOLUNG_SEKUNDEN: "1",
  FILES_AV_PARALLEL: "1",
  FILES_LOESCH_KARENZ_STUNDEN: "0",
  FILES_AUFRAEUMEN_TAKT_MINUTEN: "60",
};

function nennt(fehler: string[], teil: string): boolean {
  return fehler.some((z) => z.includes(teil));
}

describe("Pruefung 1 — die drei Pflichtvariablen haben keine Vorbelegung", () => {
  it("vollstaendig gesetzte Werte ergeben eine leere Pruefliste", () => {
    expect(grenzenFehler(GUELTIG)).toEqual([]);
  });

  // Die Einheit steht im NAMEN und muss zusaetzlich in der MELDUNG stehen:
  // `FILES_MAX_DATEI_BYTES` traegt „BYTES", die Meldung muss „Bytes" tragen.
  // Der Vergleich ist deshalb GROSS-/KLEINSCHREIBUNGSGENAU — eine
  // Regex mit `/i` wuerde auch dann bestehen, wenn das Einheitenwort in der
  // Meldung voellig fehlt, und der Test besaesse seine Aussage nicht.
  it.each([
    ["FILES_MAX_DATEI_BYTES", "Bytes"],
    ["FILES_AV_MAX_BYTES", "Bytes"],
    ["FILES_MAX_ABLAUF_TAGE", "Tage"],
  ])("%s fehlt: genau eine Meldung, sie nennt Name und Einheit „%s\"", (name, einheit) => {
    const env: Record<string, string | undefined> = { ...GUELTIG };
    delete env[name];

    const fehler = grenzenFehler(env);
    // Genau eine: eine fehlende Zahl darf nicht zusaetzlich als
    // Kettenverletzung gemeldet werden („NaN ist kleiner als …") — sonst ist
    // nicht mehr ablesbar, was zu tun ist.
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain(name);
    expect(fehler[0]).toContain(einheit);
  });

  it("eine LEER gesetzte Pflichtvariable gilt wie eine fehlende", () => {
    // `FILES_MAX_ABLAUF_TAGE=` in der .env ist der haeufigere Fall als das
    // Fehlen der Zeile. `Number("")` ist 0 — ohne diesen Zweig waere eine
    // leere Zeile eine stille 0-Tage-Grenze.
    const fehler = grenzenFehler({ ...GUELTIG, FILES_MAX_ABLAUF_TAGE: "" });
    expect(fehler).toHaveLength(1);
    // „Pflichtangabe in Tage" pinnt den ZWEIG und die Einheit in EINER
    // Zeichenkette. Nur den Namen zu pruefen genuegt nicht: faellt der
    // Leer-Zweig weg, laeuft der leere Wert in den GANZZAHL-Zweig, dessen
    // Meldung denselben Namen und dieselbe Einheit nennt („… ist keine ganze
    // Zahl in Tage.") — der Test bestuende dann aus dem falschen Grund.
    expect(fehler[0]).toContain("FILES_MAX_ABLAUF_TAGE");
    expect(fehler[0]).toContain("Pflichtangabe in Tage");
  });

  it("fehlen alle drei, nennt die Pruefliste alle drei", () => {
    const fehler = grenzenFehler(HOSTS);
    expect(fehler).toHaveLength(3);
    expect(nennt(fehler, "FILES_MAX_DATEI_BYTES")).toBe(true);
    expect(nennt(fehler, "FILES_AV_MAX_BYTES")).toBe(true);
    expect(nennt(fehler, "FILES_MAX_ABLAUF_TAGE")).toBe(true);
  });
});

/*
 * Der Leer-Zweig traegt DREI Aussagen, eine je Vorbelegungsart — die
 * Pflicht-Aussage steht oben, die beiden anderen hier. Sie sind das
 * gefaehrlichere Paar: faellt der Zweig weg, laufen leere Werte in den
 * GANZZAHL-Zweig, und aus einer Vorbelegung wird ein BOOT-ABBRUCH. Das Symptom
 * traegt dann T14 — der E2E-`webServer` kommt nie hoch, und der Befund sieht wie
 * ein Playwright-Problem aus (siehe den Kommentar an `E2E` weiter unten). Eine
 * leere Zeile in der .env ist zudem der haeufigere Fall als die fehlende Zeile:
 * `FILES_LOESCH_KARENZ_STUNDEN=` entsteht bei jedem halb ausgefuellten Kommentar.
 */
describe("Leer gesetzt heisst nicht gesetzt — auch fuer die beiden anderen Vorbelegungsarten", () => {
  it("eine leer gesetzte OPTIONALE Zahl faellt auf ihre Vorbelegung zurueck", () => {
    expect(grenzenFehler({ ...GUELTIG, FILES_LOESCH_KARENZ_STUNDEN: "" })).toEqual([]);
    expect(grenzen({ ...GUELTIG, FILES_LOESCH_KARENZ_STUNDEN: "" }).loeschKarenzStunden).toBe(24);
  });

  it("eine leer gesetzte Zahl OHNE Vorbelegung bleibt „keine Frist\"", () => {
    // `FILES_INBOX_AUFBEWAHRUNG_TAGE=` sagt dasselbe wie die fehlende Zeile:
    // keine Frist. Eine 0 waere „sofort loeschen" und ist deshalb ein Fehler.
    expect(grenzenFehler({ ...GUELTIG, FILES_INBOX_AUFBEWAHRUNG_TAGE: "" })).toEqual([]);
    expect(
      grenzen({ ...GUELTIG, FILES_INBOX_AUFBEWAHRUNG_TAGE: "" }).inboxAufbewahrungTage,
    ).toBeNull();
  });

  it("reiner Leerraum zaehlt als leer, nicht als kaputte Zahl", () => {
    // Ein Wert, der aus einem kopierten Kommentar nur ein Leerzeichen behaelt,
    // darf nicht anders wirken als eine leere Zeile.
    expect(grenzen({ ...GUELTIG, FILES_LOESCH_KARENZ_STUNDEN: "   " }).loeschKarenzStunden).toBe(24);
  });
});

/**
 * Die Tabelle aus §9.3, hier ZUM ZWEITEN MAL ausgeschrieben — und das ist
 * Absicht, nicht ein Versehen.
 *
 * Die Erwartungswerte muessen aus einer anderen Quelle kommen als der Code, den
 * sie pruefen. Wuerde dieser Test `einheit` und `min` aus `ZAHLEN` lesen, waere
 * er eine Tautologie: jede Verwechslung der Einheitenwoerter — der Fall, gegen
 * den die ganze Datei antritt — bliebe gruen, weil beide Seiten mitwandern.
 * Deshalb exportiert `grenzen.ts` NUR die Namen (`ZAHL_NAMEN`) und nicht die
 * Tabelle: die Vollstaendigkeit ist pruefbar, die Erwartungswerte sind es nicht
 * abschreibbar.
 *
 * Die Werte stehen also in §9.3 und hier. Wer eine Zeile in `ZAHLEN` aendert,
 * muss diese Liste anfassen — und genau dabei fiele auf, wenn die Aenderung
 * nicht zur Spec passt.
 */
const TABELLE: ReadonlyArray<{
  readonly name: string;
  readonly einheit: string;
  readonly min: number;
  readonly max?: number;
}> = [
  { name: "FILES_MAX_DATEI_BYTES", einheit: "Bytes", min: 1 },
  { name: "FILES_AV_MAX_BYTES", einheit: "Bytes", min: 1 },
  { name: "FILES_MAX_ABLAUF_TAGE", einheit: "Tage", min: 1 },
  { name: "FILES_MAX_DATEIEN_PRO_SHARE", einheit: "Anzahl", min: 1 },
  { name: "FILES_VORSCHAU_MAX_BYTES", einheit: "Bytes", min: 1 },
  { name: "FILES_LOESCH_KARENZ_STUNDEN", einheit: "Stunden", min: 0 },
  { name: "FILES_UPLOAD_VERFALL_STUNDEN", einheit: "Stunden", min: 1 },
  { name: "FILES_LOG_AUFBEWAHRUNG_TAGE", einheit: "Tage", min: 1 },
  { name: "FILES_INBOX_AUFBEWAHRUNG_TAGE", einheit: "Tage", min: 1 },
  { name: "FILES_INBOX_BUDGET_DATEIEN", einheit: "Anzahl", min: 1 },
  { name: "FILES_INBOX_BUDGET_BYTES", einheit: "Bytes", min: 1 },
  // §9.3 nennt hier „Anzahl/10 min", nicht „Anzahl": ohne den Bezugszeitraum
  // sagte die Meldung „600 Anfragen" und liesse offen, woran gemessen.
  { name: "FILES_IP_ANFRAGEN_PRO_10MIN", einheit: "Anzahl/10 min", min: 1 },
  { name: "FILES_AV_PORT", einheit: "Port", min: 1, max: 65535 },
  { name: "FILES_AV_TIMEOUT_MS", einheit: "Millisekunden", min: 1 },
  { name: "FILES_AV_VERSUCHE", einheit: "Anzahl", min: 1 },
  { name: "FILES_AV_WIEDERHOLUNG_SEKUNDEN", einheit: "Sekunden", min: 0 },
  { name: "FILES_AV_PARALLEL", einheit: "Anzahl", min: 1 },
  { name: "FILES_AUFRAEUMEN_TAKT_MINUTEN", einheit: "Minuten", min: 1 },
];

/**
 * Die Meldungen werden MIT ihrem Abschlusszeichen gesucht (`in Bytes.`,
 * `(Einheit: Bytes)`), nie als bloszes Wort. Ein Wort allein ist ein Praefix
 * eines anderen: `"Anzahl/10 min".includes("Anzahl")` ist wahr, und
 * `"Millisekunden"` enthaelt `sekunden`. Eine Vertauschung in dieser Richtung
 * bliebe damit gruen — also genau die Verwechslung, die diese Datei verhindern
 * soll.
 */
function nenntEinheitUnlesbar(fehler: string[], name: string, einheit: string): boolean {
  return fehler.some((z) => z.includes(name) && z.includes(`in ${einheit}.`));
}

function nenntEinheitGrenze(
  fehler: string[],
  name: string,
  einheit: string,
  grenzwort: string,
): boolean {
  return fehler.some(
    (z) => z.includes(name) && z.includes(grenzwort) && z.includes(`(Einheit: ${einheit})`),
  );
}

/**
 * Auf `Mindestwert`/`Hoechstwert` gefiltert, nicht auf „die Liste ist leer":
 * ein Randwert wie `FILES_MAX_DATEI_BYTES=1` verletzt zugleich Pruefung 2, und
 * diese Zeile prueft nicht die Kette, sondern die Randgrenze der einen Zeile.
 */
function grenzmeldungen(fehler: string[], grenzwort: string): string[] {
  return fehler.filter((z) => z.includes(grenzwort));
}

describe("§9.3 Zeile fuer Zeile — Einheitenwort und Randwerte jeder einzelnen Variable", () => {
  it("die Liste hier deckt jede Zeile von ZAHLEN ab, und keine mehr", () => {
    // Ohne diese Zusage waere eine neue Zeile in `ZAHLEN` ungeprueft: sie
    // koennte mit dem falschen Einheitenwort ankommen, und alles blieb gruen.
    expect([...ZAHL_NAMEN].sort()).toEqual(TABELLE.map((z) => z.name).sort());
  });

  it.each(TABELLE)(
    "$name — Meldungen nennen „$einheit\", Mindestwert $min",
    ({ name, einheit, min, max }) => {
      const unlesbar = grenzenFehler({ ...GUELTIG, [name]: "abc" });
      expect(nenntEinheitUnlesbar(unlesbar, name, einheit)).toBe(true);

      const zuKlein = grenzenFehler({ ...GUELTIG, [name]: String(min - 1) });
      expect(nenntEinheitGrenze(zuKlein, name, einheit, "Mindestwert")).toBe(true);

      const randwert = grenzenFehler({ ...GUELTIG, [name]: String(min) });
      expect(grenzmeldungen(randwert, "Mindestwert")).toEqual([]);

      if (max === undefined) {
        // Ohne Obergrenze ist eine sehr grosse Zahl kein Fehler. Bekommt diese
        // Zeile eine Obergrenze, wird diese Zusage rot — und die Liste hier
        // muss sie nachtragen.
        expect(grenzmeldungen(grenzenFehler({ ...GUELTIG, [name]: "999999999999" }), "Hoechstwert")).toEqual([]);
        return;
      }
      // Der Randwert der Obergrenze wird ANGENOMMEN: eine Grenze, die ihren
      // eigenen Hoechstwert abweist, ist um eins verschoben und faellt sonst
      // erst dem Betreiber auf (`FILES_AV_PORT=65535` ist ein zulaessiger Port).
      expect(grenzmeldungen(grenzenFehler({ ...GUELTIG, [name]: String(max) }), "Hoechstwert")).toEqual([]);
      const zuGross = grenzenFehler({ ...GUELTIG, [name]: String(max + 1) });
      expect(nenntEinheitGrenze(zuGross, name, einheit, "Hoechstwert")).toBe(true);
    },
  );
});

describe("Pruefung 2 — FILES_CHUNK_BYTES < FILES_MAX_DATEI_BYTES, in beide Richtungen", () => {
  it("Gleichheit ist NICHT erlaubt: genau ein Chunk waere kein Upload", () => {
    // Das diskriminierende Paar zu Pruefung 3: hier ist Gleichheit ein Fehler,
    // dort ist sie erlaubt. Ohne diesen Fall ist `<` von `<=` nicht zu
    // unterscheiden.
    const fehler = grenzenFehler({
      ...GUELTIG,
      FILES_MAX_DATEI_BYTES: "4194304",
      FILES_AV_MAX_BYTES: "4194304",
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("FILES_CHUNK_BYTES");
    expect(fehler[0]).toContain("FILES_MAX_DATEI_BYTES");
  });

  it("unterhalb der Chunk-Groesse: Fehler", () => {
    const fehler = grenzenFehler({
      ...GUELTIG,
      FILES_MAX_DATEI_BYTES: "4194303",
      FILES_AV_MAX_BYTES: "4194303",
    });
    expect(nennt(fehler, "FILES_CHUNK_BYTES")).toBe(true);
  });

  it("ein Byte oberhalb der Chunk-Groesse: kein Fehler", () => {
    expect(
      grenzenFehler({ ...GUELTIG, FILES_MAX_DATEI_BYTES: "4194305" }),
    ).toEqual([]);
  });

  it("die Kette liest die KONSTANTE, nicht eine gleichnamige Env-Variable", () => {
    // `FILES_CHUNK_BYTES` ist eine Konstante (§9.3): sie ist die Untergrenze
    // gegen den Next-Default `proxyClientMaxBodySize` = 10 MiB. Waere sie per
    // Env herabsetzbar, koennte ein Betreiber die Pruefung genau dort
    // ausschalten, wo sie traegt.
    const fehler = grenzenFehler({
      ...GUELTIG,
      FILES_CHUNK_BYTES: "999",
      FILES_MAX_DATEI_BYTES: "4194304",
      FILES_AV_MAX_BYTES: "4194304",
    });
    expect(nennt(fehler, "FILES_CHUNK_BYTES")).toBe(true);
  });
});

describe("Pruefung 3 — FILES_MAX_DATEI_BYTES ≤ FILES_AV_MAX_BYTES, Gleichheit erlaubt", () => {
  it("Gleichheit ist erlaubt", () => {
    expect(
      grenzenFehler({
        ...GUELTIG,
        FILES_MAX_DATEI_BYTES: "12582912",
        FILES_AV_MAX_BYTES: "12582912",
      }),
    ).toEqual([]);
  });

  it("ein Byte darueber: Fehler, und die Meldung nennt BEIDE Namen", () => {
    // Ohne diese Kette aeussert sich die Verletzung nicht als „Datei zu gross",
    // sondern als AV-Fehler — und der Betreiber sucht in der falschen Schicht
    // (Spec §6.6).
    const fehler = grenzenFehler({
      ...GUELTIG,
      FILES_MAX_DATEI_BYTES: "12582913",
      FILES_AV_MAX_BYTES: "12582912",
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("FILES_MAX_DATEI_BYTES");
    expect(fehler[0]).toContain("FILES_AV_MAX_BYTES");
  });

  it("darunter: kein Fehler", () => {
    expect(
      grenzenFehler({
        ...GUELTIG,
        FILES_MAX_DATEI_BYTES: "12582911",
        FILES_AV_MAX_BYTES: "12582912",
      }),
    ).toEqual([]);
  });
});

describe("Pruefung 4 — die fuenf Mindestwerte", () => {
  it.each([
    ["FILES_LOESCH_KARENZ_STUNDEN", "0"],
    ["FILES_MAX_ABLAUF_TAGE", "1"],
    ["FILES_MAX_DATEIEN_PRO_SHARE", "1"],
    ["FILES_AV_VERSUCHE", "1"],
    ["FILES_AV_WIEDERHOLUNG_SEKUNDEN", "0"],
  ])("%s = %s ist der erlaubte Randwert", (name, wert) => {
    expect(grenzenFehler({ ...GUELTIG, [name]: wert })).toEqual([]);
  });

  it.each([
    ["FILES_LOESCH_KARENZ_STUNDEN", "-1", "Stunden"],
    ["FILES_MAX_ABLAUF_TAGE", "0", "Tage"],
    ["FILES_MAX_DATEIEN_PRO_SHARE", "0", "Anzahl"],
    ["FILES_AV_VERSUCHE", "0", "Anzahl"],
    ["FILES_AV_WIEDERHOLUNG_SEKUNDEN", "-1", "Sekunden"],
  ])("%s = %s liegt unter dem Mindestwert und nennt die Einheit „%s\"", (name, wert, einheit) => {
    const fehler = grenzenFehler({ ...GUELTIG, [name]: wert });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain(name);
    expect(fehler[0]).toContain(einheit);
  });
});

describe("Ganzzahligkeit und Vorzeichen", () => {
  it.each(["12.5", "1e7", "0x10", "abc", "12 MiB", "-12582912", " "])(
    "FILES_MAX_DATEI_BYTES=%s wird abgewiesen",
    (roh) => {
      const fehler = grenzenFehler({ ...GUELTIG, FILES_MAX_DATEI_BYTES: roh });
      expect(fehler.length).toBeGreaterThan(0);
      expect(nennt(fehler, "FILES_MAX_DATEI_BYTES")).toBe(true);
    },
  );

  it("`0x10` wird nicht still als 16 gelesen", () => {
    // `Number("0x10") === 16` und `Number.isInteger(16)` ist wahr — eine
    // Pruefung ueber `Number` allein liesse Hex durch und die Grenze waere
    // eine andere als die, die in der .env steht.
    const fehler = grenzenFehler({
      ...GUELTIG,
      FILES_MAX_DATEIEN_PRO_SHARE: "0x10",
    });
    expect(nennt(fehler, "FILES_MAX_DATEIEN_PRO_SHARE")).toBe(true);
  });

  it("eine ungueltige OPTIONALE Zahl faellt genauso auf wie eine Pflichtzahl", () => {
    const fehler = grenzenFehler({ ...GUELTIG, FILES_AV_TIMEOUT_MS: "60s" });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("FILES_AV_TIMEOUT_MS");
    expect(fehler[0]).toContain("Millisekunden");
  });
});

describe("Bedingtheit — ohne Prod-Host keine Zahlenpflicht", () => {
  it("null Hosts, keine einzige Variable gesetzt: die Pruefliste ist leer", () => {
    // `assertHostConfig()` laeuft aus `instrumentation.ts` fuer die GANZE
    // Suite, vor den Migrationen aller Module. Eine unbedingte Pflicht hiesse:
    // sobald ein Image mit `files` auf dem Server landet, startet `portal`,
    // `qr` und `feedback` nicht mehr, bis die .env ergaenzt ist (Spec §9.3).
    expect(grenzenFehler({})).toEqual([]);
  });

  it("null Hosts, aber KAPUTTE Werte: die Pruefliste bleibt leer", () => {
    // Kein Host zeigt auf das Modul, also kann keine Anfrage eine dieser
    // Zahlen brauchen. Der Schalter ist DIESELBE Variable, die das Modul
    // einschaltet — es gibt keinen zweiten, den jemand vergessen kann.
    expect(grenzenFehler({ FILES_MAX_DATEI_BYTES: "-1", FILES_AV_MAX_BYTES: "x" })).toEqual([]);
  });

  it("LEER gesetztes SUITE_HOST_FILES heisst „keine Prod-Hosts\" und schaltet die Pflicht aus", () => {
    // `hosts.ts:33-38`: eine leer gesetzte Variable ist bewusst „keine
    // Prod-Hosts" — so laesst sich ein Cutover zuruecknehmen, ohne die
    // Variable zu entfernen. Dann darf auch die Zahlenpflicht nicht greifen.
    expect(grenzenFehler({ SUITE_HOST_FILES: "" })).toEqual([]);
  });

  it("EIN Host genuegt schon: die Pflicht greift", () => {
    // Die Gegenprobe zum Gate. Ohne sie waere „immer leer" gruen.
    expect(grenzenFehler({ SUITE_HOST_FILES: "files.localtest.me" })).toHaveLength(3);
  });
});

describe("grenzen() — Werte, Vorbelegungen und der Wurf", () => {
  it("liefert die Vorbelegungen aus §9.3, jede mit ihrer Einheit im Feldnamen", () => {
    expect(grenzen(GUELTIG)).toEqual({
      maxDateiBytes: 12582912,
      avMaxBytes: 12582912,
      maxAblaufTage: 7,
      maxDateienProShare: 200,
      vorschauMaxBytes: 5242880,
      loeschKarenzStunden: 24,
      uploadVerfallStunden: 24,
      logAufbewahrungTage: 90,
      inboxAufbewahrungTage: null,
      inboxBudgetDateien: 100,
      inboxBudgetBytes: 2147483648,
      ipAnfragenPro10Min: 600,
      avHost: "clamav",
      avPort: 3310,
      avTimeoutMs: 60000,
      avVersuche: 5,
      avWiederholungSekunden: 60,
      avParallel: 2,
      aufraeumenTaktMinuten: 60,
      aufraeumenTrockenlauf: false,
    });
  });

  it("fehlende FILES_INBOX_AUFBEWAHRUNG_TAGE heisst „keine Frist\", nicht 0 Tage", () => {
    // Das heutige Verhalten von `drop`: der Posteingang hat keine Frist. `0`
    // waere „sofort loeschen" — die Abwesenheit drueckt „keine Frist" aus,
    // eine 0 waere ein zweiter Ausdruck fuer etwas anderes.
    expect(grenzen(GUELTIG).inboxAufbewahrungTage).toBeNull();
    expect(grenzen({ ...GUELTIG, FILES_INBOX_AUFBEWAHRUNG_TAGE: "30" }).inboxAufbewahrungTage).toBe(
      30,
    );
    expect(nennt(grenzenFehler({ ...GUELTIG, FILES_INBOX_AUFBEWAHRUNG_TAGE: "0" }), "FILES_INBOX_AUFBEWAHRUNG_TAGE")).toBe(true);
  });

  // Ohne diesen Block waere ein Tippfehler IM VARIABLENNAMEN unsichtbar: die
  // Vorbelegung kaeme weiter an, der Test darueber blieb gruen, und der
  // Betreiber setzte eine Zeile, die niemand liest — dieselbe Klasse wie
  // `SUITE_HOST_QRR` (`hosts.ts:14-17`). Die Liste ist zugleich die, gegen die
  // T14 `.env.example` und `playwright.config.ts` scannt.
  it.each([
    ["FILES_MAX_DATEI_BYTES", "maxDateiBytes", "8388608"],
    // Ueber der Basis-Annahmegrenze, sonst verletzt das Fixture selbst
    // Pruefung 3 — die Zeile prueft den NAMEN, nicht die Kette.
    ["FILES_AV_MAX_BYTES", "avMaxBytes", "16777216"],
    ["FILES_MAX_ABLAUF_TAGE", "maxAblaufTage", "14"],
    ["FILES_MAX_DATEIEN_PRO_SHARE", "maxDateienProShare", "25"],
    ["FILES_VORSCHAU_MAX_BYTES", "vorschauMaxBytes", "131072"],
    ["FILES_LOESCH_KARENZ_STUNDEN", "loeschKarenzStunden", "48"],
    ["FILES_UPLOAD_VERFALL_STUNDEN", "uploadVerfallStunden", "12"],
    ["FILES_LOG_AUFBEWAHRUNG_TAGE", "logAufbewahrungTage", "180"],
    ["FILES_INBOX_AUFBEWAHRUNG_TAGE", "inboxAufbewahrungTage", "60"],
    ["FILES_INBOX_BUDGET_DATEIEN", "inboxBudgetDateien", "42"],
    ["FILES_INBOX_BUDGET_BYTES", "inboxBudgetBytes", "1048576"],
    ["FILES_IP_ANFRAGEN_PRO_10MIN", "ipAnfragenPro10Min", "90"],
    ["FILES_AV_PORT", "avPort", "13310"],
    ["FILES_AV_TIMEOUT_MS", "avTimeoutMs", "2000"],
    ["FILES_AV_VERSUCHE", "avVersuche", "2"],
    ["FILES_AV_WIEDERHOLUNG_SEKUNDEN", "avWiederholungSekunden", "1"],
    ["FILES_AV_PARALLEL", "avParallel", "1"],
    ["FILES_AUFRAEUMEN_TAKT_MINUTEN", "aufraeumenTaktMinuten", "5"],
  ])("%s wird unter genau diesem Namen gelesen und landet in `%s`", (name, feld, roh) => {
    const g = grenzen({ ...GUELTIG, [name]: roh });
    expect(g[feld as keyof typeof g]).toBe(Number(roh));
  });

  it("Env-Werte gewinnen gegen die Vorbelegung", () => {
    const g = grenzen({
      ...GUELTIG,
      FILES_MAX_DATEIEN_PRO_SHARE: "25",
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: "3310",
      FILES_AV_TIMEOUT_MS: "2000",
      FILES_AV_VERSUCHE: "2",
      FILES_AV_WIEDERHOLUNG_SEKUNDEN: "1",
      FILES_AV_PARALLEL: "1",
      FILES_LOESCH_KARENZ_STUNDEN: "0",
    });
    expect(g.maxDateienProShare).toBe(25);
    expect(g.avHost).toBe("127.0.0.1");
    expect(g.avTimeoutMs).toBe(2000);
    expect(g.avVersuche).toBe(2);
    expect(g.avWiederholungSekunden).toBe(1);
    expect(g.avParallel).toBe(1);
    expect(g.loeschKarenzStunden).toBe(0);
  });

  it("wirft bei einer fehlenden Pflichtzahl — und zwar UNABHAENGIG von der Hostliste", () => {
    // `grenzenFehler` ist bedingt, `grenzen` ist es NICHT: `moduleForHost`
    // trifft `files.localtest.me` unabhaengig von `prodHosts`
    // (`registry.ts:141-148`). Ein Entwickler ohne `SUITE_HOST_FILES` bekommt
    // deshalb hier einen BENANNTEN Fehler statt einer still vorbelegten
    // Grenze — und die Meldung sagt, welche Zeile in der .env fehlt.
    expect(() => grenzen({})).toThrow(GrenzenUngueltig);
    expect(() => grenzen({})).toThrow(/FILES_MAX_DATEI_BYTES/);
  });

  it("wirft bei einer verletzten Kette", () => {
    expect(() =>
      grenzen({ ...GUELTIG, FILES_MAX_DATEI_BYTES: "12582913", FILES_AV_MAX_BYTES: "12582912" }),
    ).toThrow(GrenzenUngueltig);
  });
});

describe("FILES_AUFRAEUMEN_TROCKENLAUF — ein Schalter, kein Freitext", () => {
  it.each([
    ["1", true],
    ["true", true],
    ["0", false],
    ["false", false],
    ["", false],
  ])("%s ergibt %s", (roh, erwartet) => {
    expect(grenzen({ ...GUELTIG, FILES_AUFRAEUMEN_TROCKENLAUF: roh }).aufraeumenTrockenlauf).toBe(
      erwartet,
    );
  });

  it("ein unbekannter Wert ist ein Fehler, kein stilles „aus\"", () => {
    // Ein Schalter, der `ja` als „aus" liest, ist genau die Klasse, gegen die
    // §9.3 antritt: der Betreiber sieht in der .env „an" und die Anwendung
    // meint „aus". Ein Trockenlauf, der still zu einem echten Loeschlauf
    // wird, ist der teuerste denkbare Fall dieses Moduls.
    const fehler = grenzenFehler({ ...GUELTIG, FILES_AUFRAEUMEN_TROCKENLAUF: "ja" });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("FILES_AUFRAEUMEN_TROCKENLAUF");
  });
});

describe("FILES_AV_HOST — eine Adresse, kein Host:Port", () => {
  it("die Vorbelegung ist der Compose-Servicename", () => {
    // `clamav`/3310 wie im Alt-System (`drop/.env.example:21-25`), damit
    // Servicename und Vorbelegung uebereinstimmen (Spec §6.8).
    expect(grenzen(GUELTIG).avHost).toBe("clamav");
    expect(grenzen(GUELTIG).avPort).toBe(3310);
  });

  it("ein Port im Hostwert ist ein Fehler", () => {
    // Dieselbe Linie wie `validateHostConfig` (`hosts.ts:78-86`). Ohne sie
    // waere `clamav:3310` ein Hostname, den kein DNS aufloest — und der
    // Befund lautete `ECONNREFUSED` statt „Tippfehler in der .env".
    const fehler = grenzenFehler({ ...GUELTIG, FILES_AV_HOST: "clamav:3310" });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("FILES_AV_HOST");
    expect(fehler[0]).toContain("FILES_AV_PORT");
  });

  it("ein Port ausserhalb 1..65535 ist ein Fehler", () => {
    expect(nennt(grenzenFehler({ ...GUELTIG, FILES_AV_PORT: "70000" }), "FILES_AV_PORT")).toBe(true);
    expect(nennt(grenzenFehler({ ...GUELTIG, FILES_AV_PORT: "0" }), "FILES_AV_PORT")).toBe(true);
  });
});

describe("Der E2E-Satz aus §9.3 ist mit dieser Kette vertraeglich", () => {
  it("die zwoelf Zeilen ergeben eine leere Pruefliste", () => {
    // Waere eine davon unvertraeglich, braeche der E2E-Server beim Boot ab —
    // und zwar in Welle 3 (T14), nicht hier.
    expect(grenzenFehler(E2E)).toEqual([]);
  });

  it("12 MiB liegt ueber der Chunk-Konstante UND ueber den 10 MiB des Next-Proxys", () => {
    // Beide Bedingungen aus §9.3 an einer Stelle: die erste ist Pruefung 2,
    // die zweite ist der Grund, warum §11.5 eine Datei ueber 10 MiB verlangt
    // (der Proxy-Kappen-Test). Eine kleinere Zahl erfuellte eine und riss die
    // andere, ohne dass ein Gate es sieht.
    const g = grenzen(E2E);
    expect(g.maxDateiBytes).toBeGreaterThan(FILES_CHUNK_BYTES);
    expect(g.maxDateiBytes).toBeGreaterThan(10485760);
  });

  it("die kleinen AV-Zahlen halten den fail-closed-Weg im Playwright-Budget", () => {
    // `FILES_AV_TIMEOUT_MS` 60 000 x `FILES_AV_VERSUCHE` 5 waeren fuenf Minuten
    // gegen `timeout: 90_000` (`playwright.config.ts:32`): die Zusage
    // „fail-closed ist erreichbar" liefe in einen Playwright-Timeout, sobald
    // der Fake-Scanner HAENGT statt abzulehnen (Spec §9.3).
    const g = grenzen(E2E);
    const gesamtMs = g.avVersuche * g.avTimeoutMs + g.avVersuche * g.avWiederholungSekunden * 1000;
    expect(gesamtMs).toBeLessThan(30_000);
  });
});

describe("Die drei Konstanten", () => {
  it("FILES_CHUNK_BYTES ist 4 MiB — die Untergrenze gegen proxyClientMaxBodySize", () => {
    // 4 MiB liegt unter dem Next-Default von 10 MiB
    // (`next/dist/server/config-shared.js:260`); `cloneBodyStream` bricht
    // oberhalb ab, schiebt `null` in beide Streams und gibt NUR ein
    // `console.warn` aus (`server/body-streams.js:85-101`). Diese Zahl kennen
    // wir ohne Server — deshalb ist sie eine Konstante und keine Frage.
    expect(FILES_CHUNK_BYTES).toBe(CHUNK);
    expect(FILES_CHUNK_BYTES).toBeLessThan(10485760);
  });

  it("FILES_HINWEIS_MAX_ZEICHEN und FILES_FEHLVERSUCHE_PRO_MIN stehen fest", () => {
    expect(FILES_HINWEIS_MAX_ZEICHEN).toBe(500);
    expect(FILES_FEHLVERSUCHE_PRO_MIN).toBe(10);
  });
});
