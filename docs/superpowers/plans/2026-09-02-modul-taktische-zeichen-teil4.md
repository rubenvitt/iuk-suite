# Taktische Zeichen — Plan Teil 4: Lernen, Offline, Tore

> Fortsetzung von Teil 1–3. **Globale Randbedingungen und Dateistruktur stehen in Teil 1.**
> **Spec:** `docs/superpowers/specs/2026-09-02-modul-taktische-zeichen-design.md`

Enthält: Aufgabe 8 (Lernen) · Aufgabe 9 (Offline) · Aufgabe 10 (e2e, PWA-Lauf, Handläufe).

## Korrekturblatt — verbindlich, vor der Umsetzung lesen

| Stelle | Statt | Richtig | Warum |
|---|---|---|---|
| **A10**, Vertragstabelle der Oberflächen-Griffe | `getByLabel("Zeichen suchen")` · `getByTestId("zeichen-treffer-eintrag")` · `treffer.first().getByRole("link")` | `getByTestId("zeichen-suche")` · `locator('[data-testid^="zeichen-kachel-"]')` · **Klick auf die Kachel** (kein Link), danach `getByTestId("zeichen-detailbereich")` | Aufgabe 6 vergibt `zeichen-suche`, `zeichen-raster` und `zeichen-kachel-<id>`; das Label des Suchfelds lautet „Suchen", und die Treffer sind `<button>`, keine `<a href>` — die Insel navigiert bewusst nicht. |
| **A10**, Fall „merken" | Merken auf `/katalog/[id]` auslösen · Knopftext „Nicht mehr merken" | Merken **auf `/katalog`** über den Detailbereich der Insel (`zeichen-kachel-<id>` klicken, dann `zeichen-merken`) · der zweite Zustand heißt **„Aus der Merkliste nehmen"** | Aufgabe 6 baut `/katalog/[id]` als reine Server Component **ohne jeden Knopf**. Der Test liefe sonst in `getByRole`-Timeouts, deren Meldung nach einer kaputten Detailseite klingt. |
| **A10**, RSC-Wächter | `expect(html).toContain('data-testid="zeichen-detail"')` | bleibt so — **die Korrektur sitzt in Aufgabe 6**: die Einzelseite trägt den Griff jetzt, der Detailbereich der Insel heißt `zeichen-detailbereich` (bereits eingearbeitet) | Daran hängt das einzige Tor, das einen RSC-Bruch nach einem Paketupgrade sähe. |
| **A10 Schritt 12**, Commit-Text | zweimal `<Ergebnis eintragen>` für H1 und H2 | die tatsächlichen Messergebnisse eintragen | Der Plan benennt sie selbst als Pflichtfelder; als Platzhalter gingen sie in den ausgelieferten Commit. |
| **A9 Schritt 25**, `MerklisteGeraet.tsx` | Geräteliste ohne Griff | `data-testid="zeichen-merkliste-geraet"` an die `<section>` | Aufgabe 10 prüft offline `getByTestId("zeichen-merkliste")` — dieser Name ist in Aufgabe 6 an die **Online**-Merkliste vergeben. Derselbe Name auf zwei Flächen macht den PWA-Fall blind oder mehrdeutig. |

## Aufgabe 8: Lernen — Fragen, Distraktoren, Leitner, Lernset-Filter, Verwaltung

Setzt Spec §5 (komplett), §4.4 und §10 Commit 8 um.

**Dateien:**
- Neu: `src/app/m/zeichen/_lib/lernen/zufall.ts` · `zufall.test.ts`
- Neu: `src/app/m/zeichen/_lib/lernen/fragen.ts` · `fragen.test.ts`
- Neu: `src/app/m/zeichen/_lib/lernen/leitner.ts` · `leitner.test.ts`
- Neu: `src/app/m/zeichen/_lib/lernfarben.ts` · `lernfarben.test.ts`
- Neu: `src/app/m/zeichen/_db/lernen.ts` (Abfragen) · `lernen.test.ts`
- Neu: `src/app/m/zeichen/(shell)/lernen/page.tsx`
- Neu: `src/app/m/zeichen/(shell)/lernen/runde/page.tsx`
- Neu: `src/app/m/zeichen/_ui/QuizInsel.tsx` · `QuizInsel.test.tsx`
- Neu: `src/app/m/zeichen/(shell)/verwaltung/lernsets/page.tsx`
- Neu: `src/app/m/zeichen/(shell)/verwaltung/lernsets/[id]/page.tsx`
- Neu: `src/app/m/zeichen/_ui/LernsetTabelle.tsx`
- Ändern: `src/app/m/zeichen/actions.ts` (nur neue Importe und die neuen Actions ergänzen)
- Neu: `src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/<datum>-zeichen-ueben.ts`
- Ändern: `src/app/m/portal/_lib/neuigkeiten/register.ts` (eine Zeile)

**Schnittstellen:**
- Nutzt:
  - `Zeichen`, `ZeichenId`, `alleZeichen`, `findeZeichen`, `sucheZeichen` aus `_lib/katalog.ts` (Aufgabe 2)
  - `getDb`, `DB`, Tabellen `lernstand`, `lernsets`, `lernsetZeichen`, `newId` aus `_db/` (Aufgabe 3)
  - `testDb()` aus `_db/testdb.ts` (Aufgabe 3)
  - `VORBEHALT` aus `_lib/vorbehalt.ts` (Aufgabe 5) — **nicht abschreiben**, Spec §5.6 verlangt
    denselben Kasten auf Startseite und `/lernen`; zwei Abschriften laufen auseinander, ohne dass
    ein Tor rot wird
  - `moduleAdminPageOrNotFound`, `requireModuleAdmin` aus `@/core/auth/guards`
  - `mount`, `unmount`, `query`, `queryAll`, `click`, `exists` aus `src/app/m/qr/_lib/test-dom.tsx`
- Liefert:
  - `FRAGETYPEN: readonly ["zeichen_bedeutung", "bedeutung_zeichen"]` und `type Fragetyp`
  - `interface Frage { zeichenId; typ; stamm; optionen: readonly { id; antwort; svg: string|null }[] }`
  - `baueFrage(ziel: Zeichen, typ: Fragetyp, bestand: readonly Zeichen[], seed: number): Frage`
  - `fragbareZeichen(nur?: readonly ZeichenId[]): readonly Zeichen[]` — die 232
  - `INTERVALL_TAGE: readonly [1,3,7,16,35]`
  - `naechsterStand(stufe: number, ergebnis: "richtig"|"falsch", heute: string): { stufe: number; faelligAm: string }`
  - `zufallsfolge(seed: number): () => number` und `mische<T>(liste: readonly T[], seed: number): T[]`
  - `LERNFARBEN: { richtig: {hell,dunkel}; falsch: {hell,dunkel}; gefestigt: {…}; offen: {…} }`
  - `lernUebersicht(db, sub, nur?): { gefestigt; inArbeit; faellig; nieGefragt; gesamt }`
  - `naechsteKarte(db, sub, heute, nur?): { zeichen: Zeichen; stufe: number } | null`
  - `aktiveLernsets(db): readonly { slug; titel; groesse; verfuegbar }[]`
  - Server Action `beantworte(zeichenId: string, typ: Fragetyp, gewaehlteId: string)`
  - **Für Aufgabe 7:** der Slug des zuletzt gewählten Sets steht in der URL (`?set=<slug>`)
    und wird von `/baukasten` als derselbe Parameter gelesen — Spec §6.5 („zieht ein Zeichen
    aus den 232 oder aus dem zuletzt auf `/lernen` gewählten Lernset"). Aufgabe 7 nimmt
    `fragbareZeichen(idsAusSet)` als Übungsvorrat entgegen.

> **Warum es hier keine Bauaufgabe als Fragetyp gibt** (Betreiberentscheidung 2026-09-02, Spec
> §5.2): sie bräuchte den Katalog-Code auf `/lernen/runde` — also eine dritte, dynamisch geladene
> Insel mit gemessenen 133 KB gzip auf dem Lernpfad, genau den Kosten, wegen derer §1 die Inseln
> trennt. Und über die Leitner-Stufen wäre sie frühestens am 27. Tag erreichbar gewesen: der
> teuerste Fragetyp vier Wochen lang toter Code. Sie lebt stattdessen als freie Übung im
> Baukasten (Aufgabe 7), wo der Katalog-Code ohnehin liegt. **`QuizInsel.tsx` importiert nichts
> aus `_ui/baukasten/` — `_lib/naht.test.ts` würde sonst rot.**

---

- [ ] **Schritt 1: Den fehlschlagenden Test für den Zufallsgenerator schreiben**

`src/app/m/zeichen/_lib/lernen/zufall.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mische, zufallsfolge } from "./zufall";

describe("zufallsfolge", () => {
  /*
   * DETERMINISTISCH, UND DAS IST DIE BEDINGUNG DAFUER, DASS EIN QUIZ UEBERHAUPT
   * TESTBAR IST. Math.random() im Rumpf machte jeden Fall unten zu einer Wette.
   * Zweiter Grund: die Frage darf bei einem Rerender nicht neu wuerfeln — der
   * Seed kommt aus (sub, zeichenId, typ, rundenNr).
   */
  it("liefert zum selben Seed dieselbe Folge", () => {
    const a = zufallsfolge(4711);
    const b = zufallsfolge(4711);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("liefert zu verschiedenen Seeds verschiedene Folgen", () => {
    expect(zufallsfolge(1)()).not.toBe(zufallsfolge(2)());
  });

  it("bleibt zwischen 0 und 1", () => {
    const f = zufallsfolge(99);
    for (let i = 0; i < 200; i += 1) {
      const w = f();
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(1);
    }
  });
});

describe("mische", () => {
  it("behaelt alle Elemente", () => {
    const ein = [1, 2, 3, 4, 5];
    expect([...mische(ein, 7)].sort()).toEqual(ein);
  });

  it("laesst die Eingabe unangetastet", () => {
    const ein = [1, 2, 3];
    mische(ein, 7);
    expect(ein).toEqual([1, 2, 3]);
  });

  it("mischt zum selben Seed gleich", () => {
    expect(mische([1, 2, 3, 4, 5], 7)).toEqual(mische([1, 2, 3, 4, 5], 7));
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/lernen/zufall.test.ts`
Erwartet: FAIL — `Failed to resolve import "./zufall"`.

- [ ] **Schritt 3: Den Zufallsgenerator schreiben**

`src/app/m/zeichen/_lib/lernen/zufall.ts`:

```ts
/**
 * xorshift32 — zwoelf Zeilen, keine Abhaengigkeit, deterministisch.
 *
 * ⛔ KEIN Math.random() IM RUMPF, hier und in keiner Datei unter `lernen/`. Der Seed
 * kommt von aussen, und zwar aus (sub, zeichenId, typ, rundenNr). Zwei Gruende: die
 * Frage wuerfelt bei einem Rerender nicht neu, und derselbe Testfall ergibt zweimal
 * dasselbe. Ein Quiz mit Math.random() im Rumpf ist nicht testbar, nur beobachtbar.
 */
export function zufallsfolge(seed: number): () => number {
  // 0 ist der Fixpunkt von xorshift — jede Folge daraus waere konstant 0.
  let x = seed | 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // >>> 0 macht aus dem vorzeichenbehafteten 32-Bit-Wert eine nichtnegative Zahl.
    return (x >>> 0) / 0x1_0000_0000;
  };
}

/** Fisher-Yates auf einer Kopie — die Eingabe bleibt unangetastet. */
export function mische<T>(liste: readonly T[], seed: number): T[] {
  const naechste = zufallsfolge(seed);
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(naechste() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

/**
 * Ein stabiler Zahlen-Seed aus beliebigen Zeichenketten (FNV-1a, 32 Bit).
 * Damit haengt die Frage an Person, Zeichen, Fragetyp und Rundennummer — nicht an
 * der Uhr.
 */
export function seedAus(...teile: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const teil of teile) {
    const s = String(teil);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}
```

- [ ] **Schritt 4: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/lernen/zufall.test.ts`
Erwartet: PASS, sechs Fälle.

- [ ] **Schritt 5: Den fehlschlagenden Test für Leitner schreiben**

`src/app/m/zeichen/_lib/lernen/leitner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INTERVALL_TAGE, naechsterStand } from "./leitner";

const HEUTE = "2026-09-03";

describe("naechsterStand", () => {
  it("hebt bei richtig um eine Stufe", () => {
    expect(naechsterStand(0, "richtig", HEUTE).stufe).toBe(1);
    expect(naechsterStand(2, "richtig", HEUTE).stufe).toBe(3);
  });

  it("kommt nicht ueber Stufe vier hinaus", () => {
    expect(naechsterStand(4, "richtig", HEUTE).stufe).toBe(4);
  });

  it("setzt bei falsch auf null und macht heute faellig", () => {
    expect(naechsterStand(4, "falsch", HEUTE)).toEqual({ stufe: 0, faelligAm: HEUTE });
  });

  /*
   * DAS INTERVALL GEHOERT ZUR ERREICHTEN STUFE, nicht zur verlassenen. Wer von 1 auf 2
   * steigt, sieht das Zeichen in INTERVALL_TAGE[2] = 7 Tagen wieder — nicht in dreien.
   * Ein Off-by-one hier faellt niemandem auf: beide Fassungen sehen plausibel aus, und
   * der Unterschied zeigt sich erst nach Wochen als "kommt zu oft" oder "kommt nie".
   */
  it("rechnet das Intervall der ERREICHTEN Stufe", () => {
    expect(INTERVALL_TAGE).toEqual([1, 3, 7, 16, 35]);
    expect(naechsterStand(1, "richtig", HEUTE).faelligAm).toBe("2026-09-10"); // +7
    expect(naechsterStand(0, "richtig", HEUTE).faelligAm).toBe("2026-09-06"); // +3
  });

  /*
   * heute IST EIN PARAMETER, kein new Date() im Rumpf — sonst haenge dieser Fall an
   * dem Tag, an dem er laeuft, und der Monatswechsel unten waere nicht pruefbar.
   */
  it("nimmt heute als Parameter und rechnet ueber Monatsgrenzen", () => {
    expect(naechsterStand(0, "richtig", "2026-09-30").faelligAm).toBe("2026-10-03");
    expect(naechsterStand(3, "richtig", "2026-12-15").faelligAm).toBe("2027-01-19"); // +35
  });
});
```

- [ ] **Schritt 6: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/lernen/leitner.test.ts`
Erwartet: FAIL — `Failed to resolve import "./leitner"`.

- [ ] **Schritt 7: Leitner schreiben**

`src/app/m/zeichen/_lib/lernen/leitner.ts`:

```ts
/**
 * Fuenf Leitner-Stufen. Vollstaendig beschrieben durch EINE Integer-Spalte und in drei
 * Zeilen pruefbar.
 *
 * WARUM NICHT SM-2: es braucht eine Selbsteinschaetzung 0-5, die es bei Multiple Choice
 * nicht gibt, und fuehrt drei Gleitkommafelder, die nach einem Jahr niemand mehr erklaert.
 *
 * Das Intervall gehoert zur ERREICHTEN Stufe.
 */
export const INTERVALL_TAGE = [1, 3, 7, 16, 35] as const;

export type Ergebnis = "richtig" | "falsch";

/**
 * `heute` und das Ergebnis kommen herein, ein neuer Stand geht heraus. Kein Datenbank-
 * zugriff, kein `new Date()` — deshalb ist die Wiederholungslogik ohne Datenbank und ohne
 * Zeitattrappe testbar.
 *
 * Kalendertage sind TEXT `YYYY-MM-DD`: als Zeitpunkt haengt "heute faellig" an der
 * Zeitzone des Lesers, und lexikografisch ist `faellig_am <= :heute` ohne Datumsrechnen
 * vergleichbar.
 */
export function naechsterStand(
  stufe: number,
  ergebnis: Ergebnis,
  heute: string,
): { stufe: number; faelligAm: string } {
  if (ergebnis === "falsch") return { stufe: 0, faelligAm: heute };
  const neu = Math.min(stufe + 1, INTERVALL_TAGE.length - 1);
  return { stufe: neu, faelligAm: plusTage(heute, INTERVALL_TAGE[neu]) };
}

/** Tagesarithmetik ueber UTC, damit keine Sommerzeit den Tag verschiebt. */
export function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Schritt 8: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/lernen/leitner.test.ts`
Erwartet: PASS, fünf Fälle.

- [ ] **Schritt 9: Den fehlschlagenden Test für Fragen und Distraktoren schreiben**

`src/app/m/zeichen/_lib/lernen/fragen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { alleZeichen } from "../katalog";
import { baueFrage, FRAGETYPEN, fragbareZeichen } from "./fragen";

const BESTAND = fragbareZeichen();
const ZIEL = BESTAND.find((z) => z.id === "rezept:C.1.1")!;

describe("fragbareZeichen", () => {
  /*
   * 232, NICHT 246. Ausgeschlossen sind die 14 Grundzeichen — ihre `bedeutung` ist die
   * Titelwiederholung plus eine Aktenzeichennummer, eine Frage danach fragt nichts.
   * Sie stehen im Katalog, sind merkbar und im Baukasten waehlbar; nur nicht fragbar.
   */
  it("fuehrt die 232 Hauptrezepte, ohne die 14 Grundzeichen", () => {
    expect(alleZeichen().length).toBe(246);
    expect(BESTAND.length).toBe(232);
    expect(BESTAND.filter((z) => z.id.startsWith("grund:"))).toEqual([]);
  });

  it("schraenkt auf eine ID-Liste ein", () => {
    const zwei = ["rezept:C.1.1", "rezept:E.1.1"];
    expect(fragbareZeichen(zwei).map((z) => z.id).sort()).toEqual(zwei);
  });
});

describe("baueFrage", () => {
  it("kennt genau zwei Fragetypen", () => {
    expect(FRAGETYPEN).toEqual(["zeichen_bedeutung", "bedeutung_zeichen"]);
  });

  it("stellt vier Optionen, darunter die richtige", () => {
    const f = baueFrage(ZIEL, "zeichen_bedeutung", BESTAND, 1);
    expect(f.optionen.length).toBe(4);
    expect(f.optionen.filter((o) => o.id === ZIEL.id).length).toBe(1);
  });

  /*
   * ZWEI VERSCHIEDENE FRAGEN, NICHT EINE. Mit einer einzigen Frage bewiese dieser Fall
   * nichts: eine fest verdrahtete Optionsliste waere von einer gezogenen nicht zu
   * unterscheiden. Dieselbe Regel steht ausgeschrieben in
   * `aufgaben/_ui/RoutinenTabelle.test.tsx:7-15`.
   */
  it("gibt zwei verschiedenen Zielen verschiedene Distraktoren", () => {
    const a = baueFrage(BESTAND[0], "zeichen_bedeutung", BESTAND, 11);
    const b = baueFrage(BESTAND[100], "zeichen_bedeutung", BESTAND, 11);
    expect(a.optionen.map((o) => o.id)).not.toEqual(b.optionen.map((o) => o.id));
  });

  it("gibt keinem Distraktor denselben Antworttext wie dem Ziel", () => {
    for (const z of [BESTAND[0], BESTAND[50], BESTAND[150]]) {
      const f = baueFrage(z, "zeichen_bedeutung", BESTAND, 3);
      const gleich = f.optionen.filter((o) => o.antwort === z.antwort);
      expect(gleich.length, z.id).toBe(1);
    }
  });

  it("nimmt bei bedeutung_zeichen kein Zeichen mit mehrdeutigem Titel als Ziel", () => {
    const mehrdeutig = BESTAND.filter((z) => z.mehrdeutigerTitel);
    expect(mehrdeutig.length).toBeGreaterThan(0);
    for (const z of mehrdeutig) {
      expect(() => baueFrage(z, "bedeutung_zeichen", BESTAND, 1)).toThrow();
    }
  });

  it("liefert bei bedeutung_zeichen zu jeder Option ein SVG", () => {
    const f = baueFrage(ZIEL, "bedeutung_zeichen", BESTAND, 5);
    expect(f.stamm).toBe(ZIEL.bedeutung);
    for (const o of f.optionen) expect(o.svg).toContain("<svg");
  });

  it("ergibt zum selben Seed dieselben Optionen", () => {
    const a = baueFrage(ZIEL, "zeichen_bedeutung", BESTAND, 42);
    const b = baueFrage(ZIEL, "zeichen_bedeutung", BESTAND, 42);
    expect(a.optionen.map((o) => o.id)).toEqual(b.optionen.map((o) => o.id));
  });

  /*
   * GLEICHVERTEILUNG UEBER 200 ZIEHUNGEN. Ohne diesen Fall stuende die richtige Antwort
   * womoeglich immer an derselben Stelle — und niemand faende es, weil jede einzelne
   * Frage richtig aussieht.
   */
  it("stellt die richtige Antwort gleichverteilt an alle vier Plaetze", () => {
    const plaetze = [0, 0, 0, 0];
    for (let i = 0; i < 200; i += 1) {
      const f = baueFrage(BESTAND[i % BESTAND.length], "zeichen_bedeutung", BESTAND, i);
      plaetze[f.optionen.findIndex((o) => o.id === f.zeichenId)] += 1;
    }
    for (const p of plaetze) expect(p).toBeGreaterThan(20);
  });

  /*
   * EIN LERNSET SCHRAENKT DEN BESTAND EIN, NICHT DIE DISTRAKTOREN. Kaemen die falschen
   * Antworten aus dem Set, verriete ein Set mit 15 Zeichen bei der vierten Frage die
   * Loesung — man muesste die Zeichen nicht kennen, nur das Set.
   */
  it("zieht Distraktoren aus dem ganzen Katalog, auch bei kleinem Set", () => {
    const set = ["rezept:C.1.1", "rezept:E.1.1"];
    const f = baueFrage(ZIEL, "zeichen_bedeutung", BESTAND, 9);
    expect(f.optionen.filter((o) => !set.includes(o.id)).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Schritt 10: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/lernen/fragen.test.ts`
Erwartet: FAIL — `Failed to resolve import "./fragen"`.

- [ ] **Schritt 11: Fragen und Distraktoren schreiben**

`src/app/m/zeichen/_lib/lernen/fragen.ts`:

```ts
import { alleZeichen, type Zeichen, type ZeichenId } from "../katalog";
import { mische, zufallsfolge } from "./zufall";

/**
 * ZWEI Fragetypen. Die Bauaufgabe ist KEIN Fragetyp, sondern eine freie Uebung im
 * Baukasten (Spec §5.2, §6.5): als Fragetyp braeuchte sie den Katalog-Code auf
 * /lernen/runde — eine dritte, dynamisch geladene Insel mit gemessenen 133 KB gzip auf
 * dem Lernpfad. Und ueber die Leitner-Stufen waere sie fruehestens am 27. Tag erreichbar
 * gewesen: der teuerste Fragetyp vier Wochen lang toter Code.
 */
export const FRAGETYPEN = ["zeichen_bedeutung", "bedeutung_zeichen"] as const;
export type Fragetyp = (typeof FRAGETYPEN)[number];

export interface Frage {
  readonly zeichenId: ZeichenId;
  readonly typ: Fragetyp;
  /** Bedeutungstext bei `bedeutung_zeichen`, sonst "" (dann traegt das SVG die Frage). */
  readonly stamm: string;
  readonly optionen: readonly { id: ZeichenId; antwort: string; svg: string | null }[];
}

const OPTIONEN = 4;

/**
 * Der fragbare Bestand: die 232 Hauptrezepte.
 *
 * Ausgeschlossen sind die 14 Grundzeichen (ihre `bedeutung` ist die Titelwiederholung)
 * und — schon im Generat — die 10 `#alternative` (identischer Titel, also zwei richtige
 * Antworten) sowie die 269 Piktogramme.
 *
 * `nur` schraenkt auf ein Lernset ein.
 */
export function fragbareZeichen(nur?: readonly ZeichenId[]): readonly Zeichen[] {
  const menge = nur ? new Set(nur) : null;
  return alleZeichen().filter(
    (z) => !z.id.startsWith("grund:") && (menge === null || menge.has(z.id)),
  );
}

/**
 * Baut eine Frage mit drei Distraktoren.
 *
 * DIE DISTRAKTOREN KOMMEN IMMER AUS `bestand` — also aus dem ganzen fragbaren Katalog,
 * auch wenn die Runde auf ein Lernset eingeschraenkt ist. Kaemen sie aus dem Set,
 * verriete ein Set mit 15 Zeichen bei der vierten Frage die Loesung.
 *
 * Drei Stufen (Spec §5.3, gemessen an der Kapitelverteilung: 212 von 232 Zeichen haben
 * im eigenen Kapitel mindestens drei Kandidaten; die zwoelf kleinsten Kapitel umfassen
 * zusammen nur 20 Zeichen):
 *   1. gleiches Kapitel — die fachliche Nachbarschaft (Loeschstaffel gegen Loeschgruppe)
 *   2. gleiche Grundform als Rueckfall
 *   3. ganzer Bestand
 */
export function baueFrage(
  ziel: Zeichen,
  typ: Fragetyp,
  bestand: readonly Zeichen[],
  seed: number,
): Frage {
  if (typ === "bedeutung_zeichen" && ziel.mehrdeutigerTitel) {
    // Bei dieser Richtung ist das ZEICHEN die Antwort, und zwei Zeichen mit demselben
    // Titel waeren beide richtig. Der Aufrufer waehlt fuer diese sechs IDs die andere
    // Richtung (`naechsteFrage` unten tut das).
    throw new Error(`bedeutung_zeichen ist fuer ${ziel.id} mehrdeutig`);
  }

  const taugt = (k: Zeichen) =>
    k.id !== ziel.id &&
    k.antwort !== ziel.antwort &&
    k.id !== ziel.zweiteDarstellung?.id;

  const stufen = [
    bestand.filter((k) => k.kapitel === ziel.kapitel && taugt(k)),
    bestand.filter((k) => k.grundform === ziel.grundform && taugt(k)),
    bestand.filter(taugt),
  ];

  const gewaehlt: Zeichen[] = [];
  const gesehen = new Set<string>();
  for (const stufe of stufen) {
    for (const k of mische(stufe, seed)) {
      if (gewaehlt.length >= OPTIONEN - 1) break;
      if (gesehen.has(k.id)) continue;
      gesehen.add(k.id);
      gewaehlt.push(k);
    }
    if (gewaehlt.length >= OPTIONEN - 1) break;
  }

  const alle = mische([ziel, ...gewaehlt], seed + 1);
  return {
    zeichenId: ziel.id,
    typ,
    stamm: typ === "bedeutung_zeichen" ? ziel.bedeutung : "",
    optionen: alle.map((z) => ({
      id: z.id,
      antwort: z.antwort,
      svg: typ === "bedeutung_zeichen" ? z.svg : null,
    })),
  };
}

/**
 * Waehlt die Richtung. Erkennen kommt vor Benennen: bis Stufe 1 immer
 * `zeichen_bedeutung`, ab Stufe 2 gewuerfelt.
 *
 * Die sechs Zeichen mit mehrdeutigem Titel bekommen IMMER `zeichen_bedeutung` — dort ist
 * `antwort` die Antwort, und die traegt die Organisation.
 */
export function richtungFuer(ziel: Zeichen, stufe: number, seed: number): Fragetyp {
  if (ziel.mehrdeutigerTitel) return "zeichen_bedeutung";
  if (stufe <= 1) return "zeichen_bedeutung";
  return zufallsfolge(seed)() < 0.5 ? "zeichen_bedeutung" : "bedeutung_zeichen";
}
```

- [ ] **Schritt 12: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/lernen/fragen.test.ts`
Erwartet: PASS, elf Fälle.

- [ ] **Schritt 13: Den fehlschlagenden Test für die Lernfarben schreiben**

`src/app/m/zeichen/_lib/lernfarben.test.ts` — Vorbild `feedback/_lib/noten.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LERNFARBEN } from "./lernfarben";

const CSS = readFileSync("src/app/m/zeichen/_ui/zeichen.module.css", "utf8");

describe("LERNFARBEN", () => {
  /*
   * SUITE-ROT IST AUSGESCHLOSSEN. `colorError === colorPrimary === #c8000f` — ein rotes
   * "falsch" saehe aus wie eine Primaeraktion, und auf einer Lernflaeche traegt Rot
   * fachliche Bedeutung (Falle 3). Deshalb eine modul-eigene, fachsemantische Palette.
   */
  it("benutzt nirgends die Markenfarbe", () => {
    const alle = Object.values(LERNFARBEN).flatMap((f) => [f.hell, f.dunkel]);
    for (const wert of alle) expect(wert.toLowerCase()).not.toBe("#c8000f");
  });

  /*
   * CSS UND TS SIND ZWEI QUELLEN DESSELBEN WERTES, und sie laufen auseinander, sobald
   * jemand nur eine anfasst — still, weil beide fuer sich gueltig bleiben.
   */
  it.each(Object.entries(LERNFARBEN))("fuehrt %s in beiden Helligkeiten im CSS", (name, farbe) => {
    expect(CSS).toContain(`--tz-lern-${name}: ${farbe.hell};`);
    expect(CSS).toContain(`--tz-lern-${name}: ${farbe.dunkel};`);
  });

  it("kennt die vier Zustaende", () => {
    expect(Object.keys(LERNFARBEN).sort()).toEqual(["falsch", "gefestigt", "offen", "richtig"]);
  });
});
```

- [ ] **Schritt 14: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/lernfarben.test.ts`
Erwartet: FAIL — `Failed to resolve import "./lernfarben"`.

- [ ] **Schritt 15: Lernfarben schreiben und im CSS ergänzen**

`src/app/m/zeichen/_lib/lernfarben.ts`:

```ts
/**
 * Die fachsemantische Palette des Lernbereichs — modul-eigen, nach Vorbild
 * `feedback/_lib/noten.ts`.
 *
 * ⛔ KEIN SUITE-ROT. `colorError === colorPrimary === #c8000f`: ein rotes "falsch" saehe
 * aus wie eine Primaeraktion, und auf einer Flaeche, auf der Rot fachliche Bedeutung
 * traegt, gehoert die Markenfarbe nicht auf eine Datenflaeche (Falle 3).
 *
 * ⛔ BEDEUTUNG NIE ALLEIN UEBER FARBE. Die Oberflaeche setzt WORT zuerst ("Richtig" /
 * "Nicht ganz"), ZEICHEN zweitens, Farbe zuletzt.
 */
export const LERNFARBEN = {
  richtig:   { hell: "#1f7a4d", dunkel: "#4ec98a" },
  falsch:    { hell: "#8a5a00", dunkel: "#e0a34a" },
  gefestigt: { hell: "#14603c", dunkel: "#3fae76" },
  offen:     { hell: "#5c6470", dunkel: "#9aa4b2" },
} as const;

export type Lernzustand = keyof typeof LERNFARBEN;
```

Und in `src/app/m/zeichen/_ui/zeichen.module.css` (aus Aufgabe 6) die acht Zeilen ergänzen —
in **beide** Zweige, hell und dunkel:

```css
:root[data-theme="light"] .modul {
  --tz-lern-richtig: #1f7a4d;
  --tz-lern-falsch: #8a5a00;
  --tz-lern-gefestigt: #14603c;
  --tz-lern-offen: #5c6470;
}
:root[data-theme="dark"] .modul {
  --tz-lern-richtig: #4ec98a;
  --tz-lern-falsch: #e0a34a;
  --tz-lern-gefestigt: #3fae76;
  --tz-lern-offen: #9aa4b2;
}
```

- [ ] **Schritt 16: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/lernfarben.test.ts`
Erwartet: PASS, sechs Fälle.

- [ ] **Schritt 17: Den fehlschlagenden Test für die Lern-Abfragen schreiben**

`src/app/m/zeichen/_db/lernen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lernsets, lernsetZeichen, lernstand, newId } from "./schema";
import { testDb } from "./testdb";
import { aktiveLernsets, idsAusSet, lernUebersicht, naechsteKarte, schreibeAntwort } from "./lernen";

const SUB = "dev:a";
const HEUTE = "2026-09-03";

function mitLernsets(db: ReturnType<typeof testDb>) {
  const id = newId();
  db.insert(lernsets).values({
    id, slug: "rd", titel: "Rettungsdienst", aktiv: true, erstelltVon: SUB,
  }).run();
  db.insert(lernsetZeichen).values([
    { lernsetId: id, zeichenId: "rezept:C.1.1", titelSchnappschuss: "Löschstaffel", position: 0 },
    { lernsetId: id, zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Weg", position: 1 },
  ]).run();
  return id;
}

describe("lernUebersicht", () => {
  /*
   * DIE VIER ZAHLEN SUMMIEREN SICH AUF 232, nicht auf 246 — die 14 Grundzeichen sind
   * nicht fragbar. Eine Uebersicht, deren Summe nicht dem Bestand entspricht, ist eine
   * stille Luege ueber den eigenen Fortschritt.
   */
  it("summiert sich auf den fragbaren Bestand", () => {
    const db = testDb();
    const u = lernUebersicht(db, SUB, HEUTE);
    expect(u.gesamt).toBe(232);
    expect(u.gefestigt + u.inArbeit + u.faellig + u.nieGefragt).toBe(232);
    expect(u.nieGefragt).toBe(232);
  });

  it("zaehlt gefestigt, in Arbeit und faellig auseinander", () => {
    const db = testDb();
    db.insert(lernstand).values([
      { sub: SUB, zeichenId: "rezept:C.1.1", stufe: 3, faelligAm: "2099-01-01" },
      { sub: SUB, zeichenId: "rezept:E.1.1", stufe: 2, faelligAm: "2099-01-01" },
      { sub: SUB, zeichenId: "rezept:I.3.5", stufe: 1, faelligAm: "2000-01-01" },
    ]).run();
    const u = lernUebersicht(db, SUB, HEUTE);
    expect(u.gefestigt).toBe(1);
    expect(u.inArbeit).toBe(1);
    expect(u.faellig).toBe(1);
    expect(u.nieGefragt).toBe(229);
  });

  it("rechnet bei gewaehltem Set nur dessen aufloesbare Zeichen", () => {
    const db = testDb();
    mitLernsets(db);
    const u = lernUebersicht(db, SUB, HEUTE, idsAusSet(db, "rd"));
    // Zwei Eintraege, einer davon nicht mehr im Katalog.
    expect(u.gesamt).toBe(1);
  });
});

describe("naechsteKarte", () => {
  it("liefert null, wenn nichts faellig ist und alles gefestigt", () => {
    const db = testDb();
    for (const z of ["rezept:C.1.1"]) {
      db.insert(lernstand).values({ sub: SUB, zeichenId: z, stufe: 4, faelligAm: "2099-01-01" }).run();
    }
    // Es gibt 231 nie gefragte — die kommen zuerst.
    expect(naechsteKarte(db, SUB, HEUTE)).not.toBeNull();
  });

  it("bevorzugt faellige vor nie gefragten", () => {
    const db = testDb();
    db.insert(lernstand).values({
      sub: SUB, zeichenId: "rezept:C.1.1", stufe: 1, faelligAm: "2000-01-01",
    }).run();
    expect(naechsteKarte(db, SUB, HEUTE)?.zeichen.id).toBe("rezept:C.1.1");
  });

  /*
   * EINE LERNSTANDSZEILE OHNE AUFLOESUNG WIRD UEBERSPRUNGEN, NICHT GELOESCHT (Spec §4.6
   * Stufe 2): der Katalog koennte sie zurueckbringen. Ohne diesen Fall lieferte
   * naechsteKarte ein `null`-Zeichen und die Runde bliebe leer, ohne Fehlermeldung.
   */
  it("ueberspringt Zeilen, deren Zeichen der Katalog nicht mehr fuehrt", () => {
    const db = testDb();
    db.insert(lernstand).values({
      sub: SUB, zeichenId: "rezept:GIBTSNICHT", stufe: 0, faelligAm: "2000-01-01",
    }).run();
    const karte = naechsteKarte(db, SUB, HEUTE);
    expect(karte).not.toBeNull();
    expect(karte!.zeichen.id).not.toBe("rezept:GIBTSNICHT");
  });
});

describe("schreibeAntwort", () => {
  it("legt eine Zeile an und zaehlt richtig", () => {
    const db = testDb();
    schreibeAntwort(db, SUB, "rezept:C.1.1", "richtig", HEUTE);
    const z = db.select().from(lernstand).all()[0];
    expect(z.stufe).toBe(1);
    expect(z.richtig).toBe(1);
    expect(z.faelligAm).toBe("2026-09-06");
  });

  it("setzt bei falsch zurueck und zaehlt weiter", () => {
    const db = testDb();
    schreibeAntwort(db, SUB, "rezept:C.1.1", "richtig", HEUTE);
    schreibeAntwort(db, SUB, "rezept:C.1.1", "falsch", HEUTE);
    const z = db.select().from(lernstand).all()[0];
    expect(z.stufe).toBe(0);
    expect(z.richtig).toBe(1);
    expect(z.falsch).toBe(1);
    expect(z.faelligAm).toBe(HEUTE);
  });

  /*
   * FREIWILLIGES UEBEN AENDERT DEN STAND NICHT. Wer ein Zeichen uebt, das erst in zwoelf
   * Tagen faellig waere, arbeitet sich sonst mit Fleiss aus dem Stapel, ohne etwas zu
   * behalten — die Zahl "gefestigt" stiege, das Wissen nicht.
   */
  it("laesst einen noch nicht faelligen Stand unveraendert", () => {
    const db = testDb();
    db.insert(lernstand).values({
      sub: SUB, zeichenId: "rezept:C.1.1", stufe: 3, faelligAm: "2099-01-01", richtig: 5,
    }).run();
    schreibeAntwort(db, SUB, "rezept:C.1.1", "richtig", HEUTE);
    const z = db.select().from(lernstand).all()[0];
    expect(z.stufe).toBe(3);
    expect(z.faelligAm).toBe("2099-01-01");
    expect(z.richtig).toBe(5);
  });
});

describe("aktiveLernsets", () => {
  it("nennt Groesse und aufloesbare Groesse getrennt", () => {
    const db = testDb();
    mitLernsets(db);
    const [set] = aktiveLernsets(db);
    expect(set.slug).toBe("rd");
    expect(set.groesse).toBe(2);
    expect(set.verfuegbar).toBe(1);
  });

  it("zeigt nur aktive Sets", () => {
    const db = testDb();
    db.insert(lernsets).values({
      id: newId(), slug: "entwurf", titel: "Entwurf", aktiv: false, erstelltVon: SUB,
    }).run();
    expect(aktiveLernsets(db)).toEqual([]);
  });
});
```

- [ ] **Schritt 18: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_db/lernen.test.ts`
Erwartet: FAIL — `Failed to resolve import "./lernen"`.

- [ ] **Schritt 19: Die Lern-Abfragen schreiben**

`src/app/m/zeichen/_db/lernen.ts`:

```ts
import { and, asc, eq, lte } from "drizzle-orm";
import { findeZeichen, type Zeichen, type ZeichenId } from "../_lib/katalog";
import { fragbareZeichen } from "../_lib/lernen/fragen";
import { naechsterStand, type Ergebnis } from "../_lib/lernen/leitner";
import type { DB } from "./client";
import { lernsets, lernsetZeichen, lernstand } from "./schema";

/*
 * Abfragen mit dem QUERY-BUILDER. `db.query.*` und `relations()` kommen im ganzen Repo
 * null mal vor — hier wird kein zweites Muster aufgemacht.
 */

/** Die auflösbaren IDs eines Lernsets. Unbekannter Slug -> leere Liste, kein Wurf. */
export function idsAusSet(db: DB, slug: string): readonly ZeichenId[] {
  const set = db.select().from(lernsets).where(eq(lernsets.slug, slug)).get();
  if (!set) return [];
  return db
    .select()
    .from(lernsetZeichen)
    .where(eq(lernsetZeichen.lernsetId, set.id))
    .orderBy(asc(lernsetZeichen.position))
    .all()
    .map((z) => z.zeichenId);
}

export interface Uebersicht {
  gefestigt: number;
  inArbeit: number;
  faellig: number;
  nieGefragt: number;
  gesamt: number;
}

/**
 * Die vier Zahlen aus Spec §5.5. Sie summieren sich auf den fragbaren Bestand — 232,
 * oder die auflösbare Groesse des gewaehlten Sets.
 *
 * KEIN PROZENTBALKEN darueber: er mischt "einmal geraten" mit "seit Monaten sicher" und
 * steigt auch, wenn nichts haengenbleibt.
 */
export function lernUebersicht(
  db: DB,
  sub: string,
  heute: string,
  nur?: readonly ZeichenId[],
): Uebersicht {
  const bestand = fragbareZeichen(nur);
  const ids = new Set(bestand.map((z) => z.id));
  const staende = db.select().from(lernstand).where(eq(lernstand.sub, sub)).all()
    .filter((z) => ids.has(z.zeichenId));

  let gefestigt = 0, inArbeit = 0, faellig = 0;
  for (const z of staende) {
    if (z.faelligAm <= heute) faellig += 1;
    else if (z.stufe >= 3) gefestigt += 1;
    else if (z.stufe >= 1) inArbeit += 1;
    else inArbeit += 1;
  }
  return {
    gefestigt, inArbeit, faellig,
    nieGefragt: bestand.length - staende.length,
    gesamt: bestand.length,
  };
}

/**
 * Die naechste Karte: erst Faelliges (aeltestes zuerst), dann nie Gefragtes.
 *
 * ⛔ ZEILEN, DEREN ZEICHEN DER KATALOG NICHT MEHR FUEHRT, WERDEN UEBERSPRUNGEN — nicht
 * geloescht (Spec §4.6 Stufe 2): ein Paketupgrade kann sie zurueckbringen. Ohne diesen
 * Filter kaeme ein `null`-Zeichen zurueck und die Runde bliebe leer, ohne Meldung.
 */
export function naechsteKarte(
  db: DB,
  sub: string,
  heute: string,
  nur?: readonly ZeichenId[],
): { zeichen: Zeichen; stufe: number } | null {
  const bestand = fragbareZeichen(nur);
  const ids = new Set(bestand.map((z) => z.id));

  const faellige = db
    .select()
    .from(lernstand)
    .where(and(eq(lernstand.sub, sub), lte(lernstand.faelligAm, heute)))
    .orderBy(asc(lernstand.faelligAm))
    .all();
  for (const z of faellige) {
    const zeichen = findeZeichen(z.zeichenId);
    if (zeichen && ids.has(z.zeichenId)) return { zeichen, stufe: z.stufe };
  }

  const gefragt = new Set(
    db.select().from(lernstand).where(eq(lernstand.sub, sub)).all().map((z) => z.zeichenId),
  );
  const neu = bestand.find((z) => !gefragt.has(z.id));
  return neu ? { zeichen: neu, stufe: 0 } : null;
}

/**
 * Schreibt eine Antwort. Nach JEDER einzelnen Antwort, nicht am Rundenende:
 * `session.error === "RefreshTokenError"` loest in `components/providers.tsx:63-94`
 * einen stillen Re-Login mit vollem Seitenwechsel aus — mitten in der Bearbeitung.
 *
 * FREIWILLIGES UEBEN AENDERT DEN STAND NICHT: ist die Karte noch nicht faellig, bleibt
 * alles, wie es war.
 */
export function schreibeAntwort(
  db: DB,
  sub: string,
  zeichenId: string,
  ergebnis: Ergebnis,
  heute: string,
): void {
  const vorher = db
    .select()
    .from(lernstand)
    .where(and(eq(lernstand.sub, sub), eq(lernstand.zeichenId, zeichenId)))
    .get();

  if (vorher && vorher.faelligAm > heute) return;

  const stand = naechsterStand(vorher?.stufe ?? 0, ergebnis, heute);
  db.insert(lernstand)
    .values({
      sub,
      zeichenId,
      stufe: stand.stufe,
      faelligAm: stand.faelligAm,
      richtig: (vorher?.richtig ?? 0) + (ergebnis === "richtig" ? 1 : 0),
      falsch: (vorher?.falsch ?? 0) + (ergebnis === "falsch" ? 1 : 0),
      letzteAntwortAm: new Date(),
    })
    .onConflictDoUpdate({
      target: [lernstand.sub, lernstand.zeichenId],
      set: {
        stufe: stand.stufe,
        faelligAm: stand.faelligAm,
        richtig: (vorher?.richtig ?? 0) + (ergebnis === "richtig" ? 1 : 0),
        falsch: (vorher?.falsch ?? 0) + (ergebnis === "falsch" ? 1 : 0),
        letzteAntwortAm: new Date(),
      },
    })
    .run();
}

/**
 * Die waehlbaren Sets. `groesse` ist die eingetragene Zahl, `verfuegbar` die auflösbare —
 * beide getrennt, damit die Flaeche "18 von 20 verfuegbar" sagen kann statt still
 * weniger zu fragen (Spec §4.6 Stufe 2).
 */
export function aktiveLernsets(
  db: DB,
): readonly { slug: string; titel: string; groesse: number; verfuegbar: number }[] {
  return db
    .select()
    .from(lernsets)
    .where(eq(lernsets.aktiv, true))
    .orderBy(asc(lernsets.sortierung), asc(lernsets.titel))
    .all()
    .map((set) => {
      const zeilen = db
        .select()
        .from(lernsetZeichen)
        .where(eq(lernsetZeichen.lernsetId, set.id))
        .all();
      return {
        slug: set.slug,
        titel: set.titel,
        groesse: zeilen.length,
        verfuegbar: zeilen.filter((z) => findeZeichen(z.zeichenId) !== null).length,
      };
    });
}
```

- [ ] **Schritt 20: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_db/lernen.test.ts`
Erwartet: PASS, neun Fälle.

- [ ] **Schritt 21: Die Server Action `beantworte` ergänzen**

In `src/app/m/zeichen/actions.ts` **nur die neuen Importe** ergänzen (`auth`, `getDb`,
`revalidatePath` stehen dort seit Aufgabe 6 — ein zweites Mal importiert ist ein
Syntaxfehler, der den ganzen Server-Graph des Moduls mitnimmt):

```ts
import { schreibeAntwort } from "./_db/lernen";
import { FRAGETYPEN, type Fragetyp } from "./_lib/lernen/fragen";
```

und darunter:

```ts
/**
 * Bewertet eine Antwort und schreibt den Stand. DIE ACTION IST DIE WAHRHEIT ueber den
 * Fortschritt — die Insel kennt die Optionen ohnehin, ein signiertes Fragetoken waere
 * Aufwand gegen jemanden, der sich nur selbst belaege.
 */
export async function beantworte(
  zeichenId: string,
  typ: Fragetyp,
  gewaehlteId: string,
): Promise<{ richtig: boolean }> {
  const sub = (await auth())?.user?.id;
  // Der Typ luegt: @auth/core baut `user` ohne `id`. TypeScript sieht das nicht.
  if (!sub) throw new Error("Forbidden");
  if (!FRAGETYPEN.includes(typ)) throw new Error("Unbekannter Fragetyp");

  const richtig = gewaehlteId === zeichenId;
  const heute = new Date().toISOString().slice(0, 10);
  schreibeAntwort(getDb(), sub, zeichenId, richtig ? "richtig" : "falsch", heute);
  revalidatePath("/m/zeichen/lernen");
  return { richtig };
}
```

- [ ] **Schritt 22: Den fehlschlagenden Test für die Quiz-Insel schreiben**

`src/app/m/zeichen/_ui/QuizInsel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { QuizInsel } from "./QuizInsel";

afterEach(async () => {
  await unmount();
});

const FRAGE = {
  zeichenId: "rezept:C.1.1",
  typ: "zeichen_bedeutung" as const,
  stamm: "",
  optionen: [
    { id: "rezept:C.1.1", antwort: "Löschstaffel", svg: null },
    { id: "rezept:C.1.2", antwort: "Löschgruppe", svg: null },
    { id: "rezept:C.1.3", antwort: "Löschzug", svg: null },
    { id: "rezept:C.1.4", antwort: "Löschtrupp", svg: null },
  ],
};

describe("QuizInsel", () => {
  it("zeigt vier Optionen und keine Aufloesung", async () => {
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={vi.fn()} />);
    expect(queryAll('[data-testid="quiz-option"]').length).toBe(4);
    expect(exists('[data-testid="quiz-aufloesung"]')).toBe(false);
  });

  /*
   * WORT ZUERST, ZEICHEN ZWEITENS, FARBE ZULETZT (Spec §5.5). Ein Test, der nur die
   * Farbe pruefte, ginge an der Regel vorbei — und wer die Farbe spaeter aendert, wuerde
   * ihn anpassen statt die Regel zu pruefen.
   */
  it("nennt das Ergebnis in Worten", async () => {
    const beantworte = vi.fn().mockResolvedValue({ richtig: true });
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={beantworte} />);
    await click('[data-testid="quiz-option"]');
    expect(query('[data-testid="quiz-aufloesung"]').textContent).toContain("Richtig");
  });

  it("sagt bei falscher Wahl, was richtig gewesen waere", async () => {
    const beantworte = vi.fn().mockResolvedValue({ richtig: false });
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={beantworte} />);
    await click('[data-testid="quiz-option"]:nth-of-type(2)');
    const text = query('[data-testid="quiz-aufloesung"]').textContent ?? "";
    expect(text).toContain("Nicht ganz");
    expect(text).toContain("Löschstaffel");
  });

  it("sperrt die Optionen nach der Antwort", async () => {
    const beantworte = vi.fn().mockResolvedValue({ richtig: true });
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={beantworte} />);
    await click('[data-testid="quiz-option"]');
    await click('[data-testid="quiz-option"]:nth-of-type(2)');
    expect(beantworte).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Schritt 23: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/QuizInsel.test.tsx`
Erwartet: FAIL — `Failed to resolve import "./QuizInsel"`.

- [ ] **Schritt 24: Die Quiz-Insel schreiben**

`src/app/m/zeichen/_ui/QuizInsel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "antd";
import type { Frage } from "../_lib/lernen/fragen";
import s from "./zeichen.module.css";

/*
 * ⛔ DIESE INSEL IMPORTIERT NICHTS AUS `_ui/baukasten/`. Dort liegt der einzige
 * Katalog-Code-Import des Moduls; ein Import von hier zoege 133 KB gzip auf den Lernpfad
 * und braeche `_lib/naht.test.ts`. Alles, was diese Insel braucht, kommt als
 * serialisierbares Prop herein: die Frage und das SVG des Ziels als STRING.
 *
 * `beantworte` ist eine Server Action und wird von der Seite DIREKT importiert und
 * durchgereicht — Server Actions duerfen als einzige Funktionen die RSC-Grenze
 * ueberqueren (Falle 9).
 */
export function QuizInsel(props: {
  frage: Frage;
  /** Das SVG des Zielzeichens — nur bei `zeichen_bedeutung` gezeigt. */
  svg: string;
  beantworte: (zeichenId: string, typ: Frage["typ"], gewaehlteId: string) => Promise<{ richtig: boolean }>;
}) {
  const { frage, svg, beantworte } = props;
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [richtig, setRichtig] = useState<boolean | null>(null);

  const zielAntwort = frage.optionen.find((o) => o.id === frage.zeichenId)?.antwort ?? "";

  async function waehle(id: string) {
    if (gewaehlt !== null) return; // nach der Antwort gesperrt
    setGewaehlt(id);
    const { richtig: r } = await beantworte(frage.zeichenId, frage.typ, id);
    setRichtig(r);
  }

  return (
    <div className={s.modul} data-testid="quiz-frage">
      {frage.typ === "zeichen_bedeutung" ? (
        <div className={s.zeichenflaeche} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p style={{ fontSize: "1.125rem" }}>{frage.stamm}</p>
      )}

      <div style={{ display: "grid", gap: 8, marginBlockStart: 16 }}>
        {frage.optionen.map((o) => (
          <button
            key={o.id}
            type="button"
            data-testid="quiz-option"
            disabled={gewaehlt !== null}
            onClick={() => waehle(o.id)}
            // ARBEITSDICHTE: 44 als Literal, weil eigenes Markup den antd-Token nicht erbt.
            style={{ minHeight: 44, textAlign: "start", padding: "8px 12px" }}
          >
            {o.svg ? (
              <span className={s.zeichenflaeche} dangerouslySetInnerHTML={{ __html: o.svg }} />
            ) : (
              o.antwort
            )}
          </button>
        ))}
      </div>

      {richtig !== null && (
        <div
          data-testid="quiz-aufloesung"
          style={{
            marginBlockStart: 16,
            // Farbe ZULETZT — das Wort steht schon da.
            borderInlineStart: `3px solid var(--tz-lern-${richtig ? "richtig" : "falsch"})`,
            paddingInlineStart: 12,
          }}
        >
          <strong>{richtig ? "Richtig." : "Nicht ganz."}</strong>{" "}
          {richtig ? null : <>Richtig wäre <strong>{zielAntwort}</strong> gewesen. </>}
          <Button href="/m/zeichen/lernen/runde" type="link" style={{ paddingInline: 0 }}>
            Nächstes Zeichen
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Schritt 25: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/QuizInsel.test.tsx`
Erwartet: PASS, vier Fälle.

- [ ] **Schritt 26: Die Lernseiten und die Verwaltung schreiben**

`src/app/m/zeichen/(shell)/lernen/page.tsx` — Server Component:

```tsx
import { notFound } from "next/navigation";
import { Alert, Button, Card, Statistic } from "antd";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { aktiveLernsets, idsAusSet, lernUebersicht } from "../../_db/lernen";
import { VORBEHALT } from "../../_lib/vorbehalt";
import s from "../../_ui/zeichen.module.css";

/*
 * Kein Compound-Zugriff auf antd (Falle 1): `Card`, `Statistic` und `Alert` sind sicher,
 * `Typography.Title` und `Descriptions.Item` waeren HTTP 500. Kein @ant-design/icons
 * (Falle 7). Die Zahlen kommen aus einer Server-Abfrage, die Insel gibt es hier nicht.
 */
export default async function LernenSeite(props: { searchParams: Promise<{ set?: string }> }) {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const { set } = await props.searchParams;
  const db = getDb();
  const sets = aktiveLernsets(db);
  const gewaehlt = set && sets.some((x) => x.slug === set) ? set : undefined;
  const heute = new Date().toISOString().slice(0, 10);
  const u = lernUebersicht(db, sub, heute, gewaehlt ? idsAusSet(db, gewaehlt) : undefined);

  return (
    <div className={s.modul}>
      <Seitenkopf titel="Üben" />

      {/* ⚠️ DASS DIESER KASTEN DASTEHT, IST KEINE OPTION (Spec §5.6): das fachliche
          Review des Katalogs ist bei 544 von 544 Zeilen offen. `type="warning"`, NIE
          `type="error"` — colorError ist die Markenfarbe (Falle 3). Der Wortlaut kommt
          aus `_lib/vorbehalt.ts` und wird nicht abgeschrieben. */}
      <Alert
        type="warning"
        showIcon
        data-testid="zeichen-vorbehalt"
        title={VORBEHALT.titel}
        description={VORBEHALT.text}
        style={{ marginBlockEnd: 16 }}
      />

      {sets.length > 0 && (
        <form method="get" style={{ marginBlockEnd: 16 }}>
          <label htmlFor="tz-set">Wobei möchtest du üben?</label>
          {/* Die Wahl steht in der URL, nicht in der Datenbank — sie ist eine Ansicht,
              kein Zustand. */}
          <select
            id="tz-set"
            name="set"
            defaultValue={gewaehlt ?? ""}
            data-testid="lernen-set"
            style={{ minHeight: 44, marginInlineStart: 8 }}
          >
            <option value="">Alle Zeichen</option>
            {sets.map((x) => (
              <option key={x.slug} value={x.slug} disabled={x.verfuegbar < 4}>
                {x.titel} ({x.verfuegbar === x.groesse
                  ? `${x.groesse} Zeichen`
                  : `${x.verfuegbar} von ${x.groesse} verfügbar`})
                {x.verfuegbar < 4 ? " — zu wenige für eine Runde" : ""}
              </option>
            ))}
          </select>
          <Button htmlType="submit" style={{ marginInlineStart: 8 }}>Übernehmen</Button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Card><Statistic title="Gefestigt" value={u.gefestigt} /></Card>
        <Card><Statistic title="In Arbeit" value={u.inArbeit} /></Card>
        <Card><Statistic title="Heute fällig" value={u.faellig} /></Card>
        <Card><Statistic title="Noch nie gefragt" value={u.nieGefragt} /></Card>
      </div>
      <p>{u.gesamt} Zeichen{gewaehlt ? " in diesem Lernset" : ""}.</p>

      <Button
        type="primary"
        href={`/m/zeichen/lernen/runde${gewaehlt ? `?set=${gewaehlt}` : ""}`}
        data-testid="lernen-start"
      >
        Losüben
      </Button>
    </div>
  );
}
```

`src/app/m/zeichen/(shell)/lernen/runde/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { beantworte } from "../../../actions";
import { getDb } from "../../../_db/client";
import { idsAusSet, naechsteKarte } from "../../../_db/lernen";
import { baueFrage, fragbareZeichen, richtungFuer } from "../../../_lib/lernen/fragen";
import { seedAus } from "../../../_lib/lernen/zufall";
import { QuizInsel } from "../../../_ui/QuizInsel";

export default async function RundeSeite(props: { searchParams: Promise<{ set?: string }> }) {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const { set } = await props.searchParams;
  const db = getDb();
  const nur = set ? idsAusSet(db, set) : undefined;
  const heute = new Date().toISOString().slice(0, 10);
  const karte = naechsteKarte(db, sub, heute, nur);

  if (!karte) {
    return <p>Für heute ist alles wiederholt. Schau morgen wieder vorbei.</p>;
  }

  /*
   * DER SEED HAENGT AN (sub, zeichenId, Fragetyp) — nicht an der Uhr. Damit wuerfelt die
   * Frage bei einem Rerender nicht neu, und derselbe Testfall ergibt zweimal dasselbe.
   * DIE DISTRAKTOREN KOMMEN AUS DEM GANZEN BESTAND, auch bei gewaehltem Set: sonst
   * verriete ein Set mit 15 Zeichen bei der vierten Frage die Loesung.
   */
  const typ = richtungFuer(karte.zeichen, karte.stufe, seedAus(sub, karte.zeichen.id, "richtung"));
  const frage = baueFrage(
    karte.zeichen, typ, fragbareZeichen(), seedAus(sub, karte.zeichen.id, typ),
  );

  return <QuizInsel frage={frage} svg={karte.zeichen.svg} beantworte={beantworte} />;
}
```

`src/app/m/zeichen/(shell)/verwaltung/lernsets/page.tsx`:

```tsx
import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../../_db/client";
import { lernsets } from "../../../_db/schema";
import { LernsetTabelle } from "../../../_ui/LernsetTabelle";
import s from "../../../_ui/zeichen.module.css";

export default async function LernsetsSeite() {
  // ERSTE ANWEISUNG, nicht irgendwo im Rumpf: jeder Code davor liefe fuer Unberechtigte.
  await moduleAdminPageOrNotFound("zeichen");

  const zeilen = getDb().select().from(lernsets).all().map((x) => ({
    id: x.id, slug: x.slug, titel: x.titel, aktiv: x.aktiv, sortierung: x.sortierung,
  }));

  return (
    <div className={s.modul}>
      <h1>Lernsets</h1>
      <Seitenkopf titel="Lernsets" />
      {/* Falle 9: die Tabelle ist eine eigene Client-Komponente, die nur serialisierbare
          Daten bekommt und ihre render-Funktionen selbst definiert. Ein
          `columns[].render` aus einer Server Component ist eine gewoehnliche Funktion,
          und React lehnt sie an der RSC-Grenze ab. */}
      <LernsetTabelle zeilen={zeilen} />
    </div>
  );
}
```

`src/app/m/zeichen/(shell)/verwaltung/lernsets/[id]/page.tsx` und
`src/app/m/zeichen/_ui/LernsetTabelle.tsx` folgen demselben Muster: die Detailseite ruft
`moduleAdminPageOrNotFound("zeichen")` als erste Anweisung, lädt Set und Einträge, und
reicht sie an eine `"use client"`-Tabelle. Die schreibenden Wege sind Server Actions in
`actions.ts`, jede mit `await requireModuleAdmin("zeichen")` als erster Anweisung
(**`requireModuleAdmin` wirft**, `moduleAdminPageOrNotFound` liefert 404 — Actions nehmen
die werfende Form):

```ts
export async function legeLernsetAn(_vorher: FormState, formData: FormData): Promise<FormState> {
  await requireModuleAdmin("zeichen");
  const titel = String(formData.get("titel") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!titel) return { ok: false, art: "fehler", feldFehler: { titel: "Bitte einen Titel angeben." } };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, art: "fehler", feldFehler: { slug: "Nur Kleinbuchstaben, Ziffern und Bindestriche." } };
  }
  const sub = (await auth())?.user?.id;
  if (!sub) throw new Error("Forbidden");
  // aktiv beginnt auf false: ein Set entsteht ueber mehrere Sitzungen, ohne
  // Entwurfszustand saehe jeder Lernende jede Halbfertigkeit.
  getDb().insert(lernsets).values({ slug, titel, erstelltVon: sub }).run();
  revalidatePath("/m/zeichen/verwaltung/lernsets");
  return { ok: true };
}
```

- [ ] **Schritt 27: Die Release-Notiz schreiben**

`src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/<rollout-datum>-zeichen-ueben.ts`:

```ts
import type { Notiz } from "../../typen";

export const notiz: Notiz = {
  modul: "zeichen",
  datum: "<rollout-datum>",
  slug: "zeichen-ueben",
  titel: "Zeichen üben, bis sie sitzen",
  absaetze: [
    "Unter „Üben“ fragt dich die App taktische Zeichen ab — mal zeigt sie dir ein Zeichen und du wählst die Bedeutung, mal umgekehrt. Was du sicher kannst, kommt seltener; was du verwechselst, kommt am nächsten Tag wieder.",
    "Oben siehst du vier Zahlen: gefestigt, in Arbeit, heute fällig und noch nie gefragt. Sie beziehen sich auf die 232 zusammengesetzten Zeichen des Katalogs. Die Grundformen selbst werden nicht abgefragt — bei ihnen wäre die Frage die Antwort.",
    "Wenn deine Ausbildung Lernsets angelegt hat, kannst du oben eines auswählen und nur damit üben. Die falschen Antworten kommen trotzdem aus dem ganzen Katalog, sonst würdest du nach ein paar Fragen das Set erraten statt die Zeichen zu kennen.",
    "Dein Lernstand gehört dir und ist an deine Anmeldung geknüpft. Merkliste, Katalog und Baukasten bleiben, wie sie waren.",
  ],
  hinweis:
    "Die Bedeutungen folgen einem Entwurf, dessen fachliche Prüfung noch läuft. Zum Üben der Systematik taugt er; für eine verbindliche Auskunft gilt die Dienstvorschrift deiner Organisation.",
};
```

Und **eine Zeile** in `src/app/m/portal/_lib/neuigkeiten/register.ts` — ohne sie ist
`register.test.ts` rot; das Dreieck ist Dateiname ↔ Felder ↔ Registerzeile.

- [ ] **Schritt 28: Alle Tests dieser Aufgabe grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen src/app/m/portal/_lib/neuigkeiten && pnpm typecheck && pnpm lint`
Erwartet: PASS. `register.test.ts` ist grün, weil Notizdatei und Registerzeile
zusammenpassen und der Text kein Markdown enthält.

- [ ] **Schritt 29: Gegen `next dev` abrufen**

```bash
pnpm dev
```

Dann `http://zeichen.localtest.me:3000/m/zeichen/lernen` aufrufen, ein Set wählen,
„Losüben“ drücken, eine Frage beantworten. **Was du siehst, wenn es trägt:** die vier
Zahlen, der Vorbehaltskasten, vier Optionen, danach die Auflösung in Worten. **Was du
siehst, wenn es bricht:** HTTP 500 mit `createContext is not a function` (ein
`@ant-design/icons`-Import irgendwo, Falle 7) oder
`Functions cannot be passed directly to Client Components` (eine `render`-Funktion an der
RSC-Grenze, Falle 9). Beides sieht kein Gate — nur dieser Abruf.

- [ ] **Schritt 30: Commit**

```bash
git add src/app/m/zeichen/_lib/lernen/ src/app/m/zeichen/_lib/lernfarben.ts \
        src/app/m/zeichen/_lib/lernfarben.test.ts \
        src/app/m/zeichen/_db/lernen.ts src/app/m/zeichen/_db/lernen.test.ts \
        src/app/m/zeichen/_ui/QuizInsel.tsx src/app/m/zeichen/_ui/QuizInsel.test.tsx \
        src/app/m/zeichen/_ui/LernsetTabelle.tsx \
        src/app/m/zeichen/'(shell)'/lernen/ src/app/m/zeichen/'(shell)'/verwaltung/ \
        src/app/m/zeichen/_ui/zeichen.module.css src/app/m/zeichen/actions.ts \
        src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/ \
        src/app/m/portal/_lib/neuigkeiten/register.ts
git commit -m "feat(zeichen): Lernbereich mit Leitner-Wiederholung und Lernset-Filter

Zwei Fragetypen — Zeichen zu Bedeutung und umgekehrt. Die Bauaufgabe ist
bewusst KEIN Fragetyp: sie braeuchte den Katalog-Code auf /lernen/runde, also
eine dritte Insel mit gemessenen 133 KB gzip auf dem Lernpfad, und waere ueber
die Leitner-Stufen fruehestens am 27. Tag erreichbar gewesen. Sie lebt als
freie Uebung im Baukasten, wo der Katalog-Code ohnehin liegt.

Fuenf Leitner-Stufen in EINER Integer-Spalte, Intervalle 1/3/7/16/35 Tage.
heute und seed sind Parameter, nie new Date()/Math.random() im Rumpf — anders
waere ein Quiz nicht testbar, nur beobachtbar.

Ein Lernset schraenkt den Bestand ein, NICHT die Distraktoren: kaemen die
falschen Antworten aus dem Set, verriete ein Set mit 15 Zeichen bei der
vierten Frage die Loesung. Eigener Testfall dafuer.

Der Bestand ist 232, nicht 246 — die 14 Grundzeichen sind nicht fragbar, ihre
Bedeutung ist die Titelwiederholung. Lernstandszeilen, deren Zeichen der
Katalog nicht mehr fuehrt, werden uebersprungen statt geloescht.

Release-Notiz mit dem Geltungsvorbehalt als hinweis."
```

---

## Aufgabe 9: Offline — Boot-Riegel, Service Worker, Manifest, rahmenlose Fläche, Merkliste im Gerät

Setzt Spec §7 vollständig und §10 Commit 9 um. **Die riskanteste Aufgabe des Plans:** sie ist die
erste Stelle der Suite, an der ein Modul mit `requiresAuth: true` eine PWA bekommt — es gibt kein
Vorbild (M17.5), und drei der vier Ausfallbilder sind still (Login-HTML im Cache, Worker dauerhaft
„installing", PWA gar nicht registriert).

**Dateien:**
- Neu: `src/app/m/zeichen/_lib/boot.ts` · `_lib/boot.test.ts`
- Neu: `src/app/m/zeichen/_lib/sw-quelle.ts` · `_lib/sw-quelle.test.ts`
- Neu: `src/app/m/zeichen/_lib/merkgeraet.ts` · `_lib/merkgeraet.test.ts`
- Neu: `src/app/m/zeichen/_lib/offlineflaeche.test.ts`
- Neu: `src/app/m/zeichen/sw.js/route.ts` · `manifest.webmanifest/route.ts` · `pwa-icon.svg/route.ts`
- Neu: `src/app/m/zeichen/pwa-routen.test.ts`
- Neu: `src/app/m/zeichen/RegisterSW.tsx`
- Neu: `src/app/m/zeichen/(rahmenlos)/layout.tsx` · `(rahmenlos)/offline/page.tsx`
- Neu: `src/app/m/zeichen/_ui/AbgemeldetStreifen.tsx` · `_ui/MerklisteGeraet.tsx` ·
  `_ui/MerklisteSpiegel.tsx` · `_ui/MerklisteSpiegelInsel.tsx`
- Neu: `src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-zeichen-ohne-netz.ts`
- Ändern: `src/core/bootstrap.ts` (Import + `errors`-Array) · `src/core/bootstrap.test.ts` (`:638`)
- Ändern: `src/app/m/zeichen/layout.tsx` (`<RegisterSW an={…} />`)
- Ändern: `src/app/m/zeichen/(shell)/layout.tsx` (`<MerklisteSpiegel />`)
- Ändern: `src/app/m/zeichen/_ui/KatalogInsel.tsx` (Prop `offline`)
- Ändern: `src/app/m/portal/_lib/neuigkeiten/register.ts` (eine Import- und eine Listenzeile)
- Temporär, wird in Schritt 1 wieder entfernt: `src/app/m/portal/sw-probe.js/route.ts` ·
  `e2e/ma-sw-cookie.spec.ts` · eine Zeile in `playwright.pwa.config.ts`

**Schnittstellen:**
- Nutzt:
  - `KATALOG_STAND` und `findeZeichen` aus `_lib/katalog.ts` (Aufgabe 2)
  - `getDb()`/`DB` aus `_db/client.ts` und die Tabelle `merkliste` aus `_db/schema.ts` (Aufgabe 3)
  - `src/app/m/zeichen/layout.tsx` und `(shell)/layout.tsx` (Aufgabe 5)
  - `_ui/KatalogInsel.tsx` (Aufgabe 6)
  - `auth()` aus `@/core/auth` (`session.user.id` **ist** der `sub`)
  - `Arbeitsdichte` aus `@/core/theme/Arbeitsdichte`, `SCHRIFT` aus `@/core/theme/schrift`,
    `SPACE` aus `@/core/theme/tokens`, `getModule` aus `@/core/registry`
  - `devLogin` aus `e2e/fixtures.ts` und `playwright.pwa.config.ts` (nur für M-A)
- Liefert:
  - `zeichenSwAn(env?: Record<string, string|undefined>): boolean`
  - `zeichenBootFehler(env?): Promise<string[]>` — **wirft nie**
  - `ZEICHEN_SW_QUELLE` und `ZEICHEN_SW_ABRAEUM_QUELLE` (`_lib/sw-quelle.ts`)
  - `interface MerkEintrag { id: string; titel: string }` · `schreibeMerkliste` ·
    `liesMerkliste` · `loescheGeraetedaten` (`_lib/merkgeraet.ts`)
  - `RegisterSW({ an }: { an: boolean })`
  - die Route `/offline` als **einzige** gecachte Navigationsroute
  - `KatalogInsel` mit der Prop `offline?: boolean`

> **Die sieben Reparaturen dieser Aufgabe**, jede gegen einen gemessenen Ausfall. Keine darf fehlen,
> und keine ist Geschmack:
> 1. `start_url` ist `/offline`, `scope` ist `/`, `NAV_FALLBACK` ist `/offline`, und **jede** nicht
>    gecachte Navigation innerhalb des Scopes fällt darauf zurück. Beide bestehenden Manifeste der
>    Suite setzen `start_url: "/"` (`qr/manifest.webmanifest/route.ts:37`, `uav` ebenso) — hier wäre
>    das Chromes Netzwerkfehlerseite, weil `/` die RSC-Startseite unter `SuiteRahmen` ist und
>    ausdrücklich **nicht** im Cache liegt. Der Preis: die Adresszeile steht auf `/katalog`, während
>    `/offline` gerendert wird. **Sie lügt** — und das ist der bewusst gewählte kleinere Schaden
>    gegenüber einer Fehlerseite mitten im Einsatz.
> 2. Der `redirected`-Riegel gilt **auch für Assets** (Manifest, Icon), nicht nur für HTML. `qr`/`uav`
>    holen beide cache-first ohne ihn; hier brennte sich sonst Login-HTML dauerhaft als Manifest ein.
> 3. Die Bündel werden **vor** dem HTML abgelegt. Umgekehrt hinterließe ein Deploy am Netzrand ein
>    gecachtes HTML, dessen Chunk-Hashes es nicht mehr gibt — offline kaputt, ohne Fehlermeldung.
> 4. `releaseBody` ist Pflicht. Gemessen (`qr/_lib/sw-source.ts:196-214`): nach **drei**
>    liegengelassenen 404-Antworten kam kein weiterer `fetch` des Workers mehr zurück, der Worker
>    blieb dauerhaft „installing", `navigator.serviceWorker.ready` löste nie auf — gar keine PWA,
>    ohne Fehlermeldung. Und 404 ist ein **vorgesehener** Fall (Redeploy).
> 5. Der Navigationszweig ist network-first **mit** Redirect-Riegel: landet die Antwort auf `/login`
>    (mit Netz, aber abgelaufener Sitzung), wird die gecachte Offline-Fläche ausgeliefert, **nicht**
>    weitergeleitet. Ohne ihn verlöre jemand mit schwacher Verbindung den vollständig vorhandenen
>    Katalog an eine Anmeldemaske.
> 6. Der Inhaltsriegel prüft auf `"userName"` **und** `"angemeldet"` (M17.3: jede Seite unter
>    `SuiteRahmen` trägt beides im Flight-Payload).
> 7. Die Merkliste liegt in **IndexedDB**, nicht im HTTP-Cache, mit sichtbarem Hinweis und
>    Löschknopf (§7.5). Der Logout-Haken (`POST /api/auth/signout`) löscht Cache **und** IndexedDB.

> **Was die Merkliste-Entscheidung aufgibt — ausgeschrieben, weil es in den Commit-Text gehört
> (Spec §7.5).** Offline gibt es keine Authentifizierung: das Sitzungscookie ist `HttpOnly` und für
> Seite wie Worker unsichtbar, und IndexedDB überlebt den Logout genauso wie der Cache. Die Zusage
> „auf dem Gerät liegt nichts Personenbezogenes" war mit einem Unit-Test gegen den Worker-Quelltext
> haltbar; **sie ist es ab dieser Aufgabe nicht mehr.** An ihre Stelle treten drei Dinge, von denen
> nur das erste eine Maschinenprüfung ist: (1) der Inhaltsriegel bleibt und gilt weiter für den
> HTTP-Cache — dort landet nach wie vor kein HTML mit `"userName"`, der Test dazu bleibt scharf;
> (2) der Logout-Haken wird von Vorsorge zur **tragenden** Maßnahme und deckt ausdrücklich nur den
> geordneten Fall ab, **nicht** Ablauf, Widerruf, Gruppenentzug oder ein weggelegtes Gerät;
> (3) der Hinweis samt Löschknopf — kein Riegel, eine Aussage.

---

- [ ] **Schritt 1: VORBEDINGUNG M-A messen — sendet Chrome beim `/sw.js`-Abruf das Sitzungscookie?**

**Diese Messung läuft VOR jeder anderen Zeile dieser Aufgabe.** Sie ist die einzige unbewiesene
Annahme des ganzen Entwurfs (Spec §0 „Nicht gemessen", §7.3 letzter Absatz, §9 Vorbedingung).

*Was genau gemessen wird:* Ob der Abruf von `/sw.js`, den `navigator.serviceWorker.register()`
auslöst, das Sitzungscookie mitschickt. Spezifikationsseitig ist er same-origin und sollte es tun;
gemessen ist es nicht. Fällt er ohne Cookie, antwortet die Middleware auf einem Host mit
`requiresAuth: true` mit **307 → /login** (`routing.ts:88-93`, `proxy.ts:39-44`), der Browser bekommt
`text/html`, und die Registrierung scheitert mit einer einzigen Konsolenzeile.

*Womit:* `playwright.pwa.config.ts` mit dem **vollen Chromium-Kanal** (`channel: "chromium"`) und
dem Flag `--unsafely-treat-insecure-origin-as-secure` — Playwrights Standardbrowser ignoriert das
Flag, `isSecureContext` bleibt `false` und `navigator.serviceWorker` fehlt ganz (dort im Kopf der
Datei ausgeschrieben). Gemessen wird auf `portal.localtest.me:3101`, weil `portal` **dieselbe
Torkonfiguration** trägt wie `zeichen` (`registry.ts:57-59`: `requiresAuth: true`,
`requiredGroups: []`) und der Origin in `ORIGINS` schon eingetragen ist. Das Modul `zeichen` hat zu
diesem Zeitpunkt noch keine `/sw.js`-Route — deshalb eine Sonde.

Sonde anlegen, `src/app/m/portal/sw-probe.js/route.ts`:

```ts
// TEMPORÄR — Messung M-A (Spec §9). Wird am Ende von Schritt 1 wieder geloescht.
// Kein Inhalt ausser einem gueltigen JS-Rumpf: der Browser registriert nur, was
// mit einem JavaScript-Content-Type UND Status 200 kommt.
export function GET(req: Request): Response {
  const cookie = req.headers.get("cookie") ?? "";
  console.log("[M-A] /sw-probe.js — Cookie-Header vorhanden:", cookie.length > 0);
  console.log("[M-A] /sw-probe.js — Sitzungscookie dabei:", cookie.includes("authjs.session-token"));
  return new Response("self.addEventListener('install', () => {});\n", {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}
```

Messspec anlegen, `e2e/ma-sw-cookie.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * M-A (Spec §9) — TEMPORÄR, wird nach der Ablesung mitsamt der Sonde geloescht.
 *
 * Die Frage: schickt Chrome beim /sw.js-Abruf von navigator.serviceWorker.register()
 * das Sitzungscookie mit? `portal` steht stellvertretend fuer `zeichen`: identische
 * Torkonfiguration (requiresAuth: true, requiredGroups: []), registry.ts:57-59.
 */
test("M-A: die Registrierung gelingt auf einem auth-pflichtigen Host", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: 3101 });

  // Der direkte Beleg, soweit ihn der Browser herausgibt: der Cookie-Header der
  // Anfrage, die die Registrierung ausloest.
  const anfrage = page.waitForRequest((r) => r.url().endsWith("/sw-probe.js"));

  const ergebnis = await page.evaluate(async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw-probe.js", { scope: "/" });
      return { ok: true as const, scope: reg.scope };
    } catch (err) {
      return { ok: false as const, meldung: String(err) };
    }
  });

  const kopf = await (await anfrage).allHeaders();
  console.log("[M-A] Cookie-Header der Registrierungsanfrage:", kopf["cookie"] ?? "(keiner)");
  console.log("[M-A] Ergebnis:", JSON.stringify(ergebnis));

  // DIE tragende Zusicherung: geht das Cookie NICHT mit, antwortet die Middleware
  // 307 -> /login, der Browser bekommt text/html, und register() lehnt mit einem
  // SecurityError ueber den MIME-Type ab. Ein gelungenes register() auf einem
  // auth-pflichtigen Host IST der Beweis.
  expect(ergebnis.ok, JSON.stringify(ergebnis)).toBe(true);
});
```

In `playwright.pwa.config.ts` `testMatch` **vorübergehend** weiten:

```ts
  testMatch: /(pwa-spike|ma-sw-cookie)\.spec\.ts/,
```

Messen:

```bash
pnpm e2e:pwa
```

Erwartet bei **positivem** Ausgang (die Annahme trägt):

```
[M-A] Cookie-Header der Registrierungsanfrage: authjs.session-token=…
[M-A] Ergebnis: {"ok":true,"scope":"http://portal.localtest.me:3101/"}
  1 passed
```

Und in der Serverausgabe: `[M-A] /sw-probe.js — Sitzungscookie dabei: true`.

Erwartet bei **negativem** Ausgang:

```
[M-A] Ergebnis: {"ok":false,"meldung":"SecurityError: Failed to register a ServiceWorker …
                 The script has an unsupported MIME type ('text/html')."}
  1 failed
```

> ⛔ **BEI NEGATIVEM AUSGANG HÄLT DIESE AUFGABE AN.** Nicht „dann bauen wir eben einen Durchlass":
> der Ausweg wäre ein host- **und** pfadgebundener `rewrite` **innerhalb** des Host-Zweigs von
> `decideRoute` — **nicht** in `PASSTHROUGH`, dort gemessen kaputt (`e2e/radio-hosts.spec.ts:260-265`).
> Das ist eine Änderung an `src/core/routing.ts` **ohne zweiten Nutznießer** und damit eine erneute
> Betreiberentscheidung (Spec §7.3, §9). Der Befund wird notiert, die Aufgabe wartet, die übrigen
> Aufgaben des Plans laufen ohne sie weiter.

Nach der Ablesung — **egal wie sie ausfällt** — die drei Änderungen zurücknehmen:

```bash
rm -rf src/app/m/portal/sw-probe.js e2e/ma-sw-cookie.spec.ts
git checkout playwright.pwa.config.ts
git status --short
```
Erwartet: leere Ausgabe. Das Ergebnis der Messung wird in Schritt 9 als Kommentarzeile im Kopf von
`_lib/sw-quelle.ts` festgehalten, mit Datum — nicht als „geprüft", sondern mit dem Messwert.

---

- [ ] **Schritt 2: Den fehlschlagenden Test für den Boot-Riegel schreiben**

`src/app/m/zeichen/_lib/boot.test.ts` — Vorbild `src/app/m/uav/_lib/boot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { zeichenBootFehler, zeichenSwAn } from "./boot";

describe("Boot-Riegel zeichen", () => {
  /*
   * ⛔ ABWEICHUNG VON SPEC §7.1, BEWUSST UND BEGRUENDET. Die Spec will einen
   * Riegel, der bei NODE_ENV === "production" und fehlendem SUITE_HOST_ZEICHEN
   * laut wird. Das braeche JEDEN Produktiv-Deploy im Fenster zwischen Merge und
   * Cutover ab — auch auf Instanzen, die dieses Modul nie einschalten wollen.
   * `uav/_lib/boot.ts:24-27` schreibt genau diesen Fehler aus. Das Schutzziel
   * (kein STILLER PWA-Ausfall) bleibt: ZEICHEN_SW=1 ist die bewusste
   * Einschaltung, und DANN ist der fehlende Host ein lauter Startfehler.
   */
  it("ohne ZEICHEN_SW ist nichts zu pruefen", async () => {
    expect(await zeichenBootFehler({})).toEqual([]);
    expect(await zeichenBootFehler({ SUITE_HOST_ZEICHEN: "zeichen.iuk-ue.de" })).toEqual([]);
  });

  it("mit ZEICHEN_SW=1 und ohne Host: eine Meldung, kein Wurf", async () => {
    const fehler = await zeichenBootFehler({ ZEICHEN_SW: "1" });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("SUITE_HOST_ZEICHEN");
    expect(fehler[0]).toContain("ZEICHEN_SW");
  });

  it("mit ZEICHEN_SW=1 und Host: keine Meldung", async () => {
    expect(await zeichenBootFehler({ ZEICHEN_SW: "1", SUITE_HOST_ZEICHEN: "zeichen.iuk-ue.de" }))
      .toEqual([]);
  });

  /*
   * Die sichere Seite ist AUS: ein Tippfehler ("true", "ja", "on") schaltet die
   * PWA NICHT ein. Waere es umgekehrt, registrierte eine verschriebene Variable
   * einen Worker auf einer Instanz ohne eigenen Host — und der cachte dort
   * Login-HTML.
   */
  it("nur die Zeichenkette 1 schaltet ein", () => {
    expect(zeichenSwAn({ ZEICHEN_SW: "1" })).toBe(true);
    expect(zeichenSwAn({ ZEICHEN_SW: "true" })).toBe(false);
    expect(zeichenSwAn({})).toBe(false);
  });

  /*
   * WIRFT NIE — nicht einmal bei absurder Eingabe. assertHostConfig() sammelt
   * die Meldungen ALLER Module ein und entscheidet einmal; ein Wurf hier naehme
   * den ganzen Prozess mit, samt aller anderen Module.
   */
  it("wirft auch bei unsinnigen Werten nicht", async () => {
    await expect(
      zeichenBootFehler({ ZEICHEN_SW: "1", SUITE_HOST_ZEICHEN: "" }),
    ).resolves.toHaveLength(1);
  });
});
```

- [ ] **Schritt 3: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/boot.test.ts`
Erwartet: FAIL — `Failed to resolve import "./boot"`.

- [ ] **Schritt 4: Den Boot-Riegel schreiben**

`src/app/m/zeichen/_lib/boot.ts`:

```ts
// src/app/m/zeichen/_lib/boot.ts
// KEIN "use client" (Falle 6) — die Datei laeuft im Instrumentation-Hook, bevor
// irgendetwas rendert, UND `zeichenSwAn()` wird aus einer Server Component
// (`layout.tsx`) gelesen. Aus einem Client-Modul kaeme dort eine Client-Referenz
// statt des Wertes: HTTP 500 fuer die ganze Seite, und weder `build` noch Vitest
// sehen es.

type EnvLike = Record<string, string | undefined>;

/**
 * Ist die Offline-PWA dieses Moduls eingeschaltet?
 *
 * ⛔ NUR die Zeichenkette "1", und die sichere Seite ist AUS. Ein Tippfehler
 * ("true", "ja") darf keinen Worker registrieren: auf einer Instanz ohne
 * eigenen Modul-Host antwortet jede Route ohne Sitzung mit 307 -> /login, und
 * ein Worker legte dort Login-HTML unter dem Katalogschluessel ab (M17.2).
 */
export function zeichenSwAn(env: EnvLike = process.env): boolean {
  return env.ZEICHEN_SW === "1";
}

/**
 * Die Boot-Pruefung dieses Moduls. WIRFT NIE — `assertHostConfig()`
 * (`src/core/bootstrap.ts`) sammelt die Meldungen ALLER Module ein und
 * entscheidet einmal, ob daraus ein Abbruch wird. Ein Wurf hier naehme den
 * ganzen Prozess mit, samt aller anderen Module.
 *
 * ⛔ GREIFT NUR BEI ZEICHEN_SW=1 — dem Schalter, der die PWA einschaltet.
 * ABWEICHUNG VON SPEC §7.1, die eine unbedingte Pflicht in Produktion wollte:
 * die braeche jeden unbeteiligten Deploy im Fenster zwischen Merge und Cutover
 * ab (`uav/_lib/boot.ts:24-27` schreibt denselben Fehler aus). Das Schutzziel
 * bleibt erhalten: ohne den Schalter registriert `RegisterSW` nichts, es gibt
 * also nichts, was still ausfallen koennte; MIT dem Schalter ist der fehlende
 * Host ein LAUTER Startfehler.
 *
 * Warum der Host ueberhaupt Voraussetzung ist (Spec §7.1): ohne ihn findet
 * `moduleForHost` in Produktion kein Modul (`registry.ts:257-264`),
 * `decideRoute` faellt aufs Portal zurueck, `/sw.js` rewritet nach
 * `/m/portal/sw.js` -> 404, und die Registrierung scheitert mit EINER
 * Konsolenzeile. `/manifest.webmanifest`, `/pwa-icon.svg` und `/offline` sind
 * dann ebenfalls Portal-Pfade und 404. Die Release-Notiz verspraeche „Der
 * Katalog steht auch ohne Verbindung bereit", und niemand merkte, dass er es
 * nicht tut, bis jemand ohne Netz danebensteht.
 *
 * ⛔ SIE LIEST KEINE TABELLE. Sie laeuft VOR `migrateAllModules()`
 * (`src/instrumentation.ts`) — dieselbe Regel wie bei `files`, `lagerbuch`,
 * `radio` und `uav`.
 */
export async function zeichenBootFehler(env: EnvLike = process.env): Promise<string[]> {
  if (!zeichenSwAn(env)) return [];
  if (!env.SUITE_HOST_ZEICHEN) {
    return [
      "ZEICHEN_SW=1 verlangt SUITE_HOST_ZEICHEN: ohne eigenen Modul-Host rewritet " +
        "/sw.js ins Portal (404) und die Offline-PWA faellt STILL aus. " +
        "Spec 2026-09-02 §7.1.",
    ];
  }
  return [];
}
```

- [ ] **Schritt 5: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/boot.test.ts`
Erwartet: PASS, fünf Tests.

---

- [ ] **Schritt 6: Den Haken einhängen und die Handzahl in `bootstrap.test.ts` anheben**

In `src/core/bootstrap.ts` bei den Importen, nach `uavBootFehler`:

```ts
import { zeichenBootFehler } from "@/app/m/zeichen/_lib/boot";
```

Und im `errors`-Array von `assertHostConfig()`, nach dem `uav`-Eintrag:

```ts
    // zeichen: greift nur bei ZEICHEN_SW=1 und WIRFT NIE (Spec 2026-09-02 §7.1, mit der
    // im Plan begruendeten Abweichung: an den Schalter gebunden statt an NODE_ENV, sonst
    // braeche jeder unbeteiligte Deploy zwischen Merge und Cutover ab).
    // Sie läuft VOR migrateAllModules() und liest deshalb KEINE Tabelle.
    ...(await zeichenBootFehler()),
```

> ⚠️ Die Form `...(await zeichenBootFehler())` ist **wörtlich** verlangt:
> `bootstrap.test.ts` („jeder Haken steht WIRKSAM AWAITET im errors-Array") sucht genau diese
> Zeichenkette im `errors`-Block. Ein `zeichenBootFehler();` ohne `await` und ohne Spread wäre
> typkorrekt, lint-sauber und **wirkungslos**.

In `src/core/bootstrap.test.ts`, Zeile 638 — die Zahl wird **angehoben, nicht gelöscht**, und der
Kommentar darüber bekommt einen Absatz (die Datei schreibt jede Anhebung mit Datum und Anlass fort):

```ts
    /*
     * ⛔ ANGEHOBEN VON `4` AUF `5` AM 2026-09-02 (Modul-zeichen-Aufgabe 9, Spec
     * 2026-09-02 §7.1): `zeichenBootFehler` (`src/app/m/zeichen/_lib/boot.ts`)
     * kam mit der Boot-Pruefung fuer `ZEICHEN_SW`/`SUITE_HOST_ZEICHEN` dazu.
     * Wird die Zahl rot, wird sie ANGEHOBEN, nicht geloescht.
     */
    expect(bootHaken.length).toBe(5);
```

> ⬜ **`zeichenSwAn` faellt NICHT in diese Menge** und muss dort auch nicht auftauchen: der Filter
> `bootHaken` verlangt einen Namen, der auf `BootFehler` endet (`bootstrap.test.ts:490`).
> `zeichenSwAn` wird von `sw.js/route.ts` und `layout.tsx` gelesen, nicht vom Boot.

Kommando: `pnpm vitest run src/core/bootstrap.test.ts src/app/m/zeichen/_lib/boot.test.ts`
Erwartet: PASS. Bliebe `die Zahl der Boot-Haken steht EXAKT auf dem Stand dieses Planteils` rot,
ist entweder die Zahl nicht angehoben oder der Import fehlt — beides steht in der Fehlermeldung.

---

- [ ] **Schritt 7: Den fehlschlagenden Test für den Service Worker schreiben**

`src/app/m/zeichen/_lib/sw-quelle.test.ts` — die **neun** Testnamen sind vollständig aus Spec §8.2
übernommen. Vorbild der Bauform ist `src/app/m/qr/_lib/sw-source.test.ts`: der Worker liegt als
Quelltext-String vor und läuft hier in einer nachgebauten Worker-Umgebung.

```ts
import { describe, it, expect, vi } from "vitest";
import { ZEICHEN_SW_QUELLE } from "./sw-quelle";

/**
 * Der Service Worker ist ausgelieferter Quelltext, kein importierbares Modul.
 * Damit sein Verhalten pruefbar wird, laeuft er hier in einer nachgebauten
 * Worker-Umgebung: `self`, `caches`, `fetch` und `indexedDB` werden als
 * Parameter uebergeben und verdecken die echten Globals (Muster
 * `qr/_lib/sw-source.test.ts:153-192`).
 */

const ORIGIN = "https://zeichen.example.org";
const CACHE = "zeichen-pwa-v1";

/** Die Shell-Route aus `sw-quelle.ts`. Bewusst dupliziert statt importiert —
 *  eine hier vergessene Aenderung soll auffallen statt mitzuwandern. */
const OFFLINE = "/offline";

const GETEILT = "/_next/static/chunks/geteilt.a1b2c3.js";
const KATALOG_CHUNK = "/_next/static/chunks/katalog.d4e5f6.js";
const ARIMO = "/_next/static/media/arimo.9f8e7d.woff2";

const OFFLINE_HTML =
  `<html><body>` +
  `<script src="${GETEILT}"></script><script src="${KATALOG_CHUNK}"></script>` +
  `<link rel="preload" href="${ARIMO}" as="font">` +
  `Offline kannst du alle Zeichen nachschlagen.</body></html>`;

/**
 * Dieselbe Flaeche, aber unter `SuiteRahmen` gerendert. GEMESSEN (M17.3): jede
 * Seite unter der Suite-Huelle traegt Klarnamen und die gruppenabhaengige
 * App-Liste im Flight-Payload — zwei Personen, dieselbe URL: 281.170 vs.
 * 279.159 B. Genau das darf nie in den Cache.
 */
const PERSONALISIERTES_HTML =
  `<html><body><script src="${GETEILT}"></script>` +
  `<script>self.__next_f.push([1,"{\\"userName\\":\\"Ruben\\",\\"angemeldet\\":true}"])</script>` +
  `</body></html>`;

const LOGIN_HTML = `<html><body>Anmelden</body></html>`;
const MANIFEST = `{"name":"Taktische Zeichen","start_url":"/offline"}`;
const ICON = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;

interface SwRequest { url: string; method: string; mode: string }

/**
 * Eine Antwort mit gesetztem `url` und `redirected` — beides ist bei einem
 * frisch konstruierten `Response` leer bzw. false, und genau diese zwei Felder
 * traegt der Riegel des Workers. `Object.defineProperty` beschattet die Getter
 * des Prototyps; ohne das koennte dieser Test die gefaehrlichste Lage gar nicht
 * nachstellen.
 */
function antwort(
  koerper: string,
  opt: { status?: number; url: string; redirected?: boolean },
): Response {
  const res = new Response(koerper, { status: opt.status ?? 200 });
  Object.defineProperty(res, "url", { value: new URL(opt.url, ORIGIN).href });
  Object.defineProperty(res, "redirected", { value: opt.redirected ?? false });
  return res;
}

function baueCacheSpeicher() {
  const caches = new Map<string, Map<string, Response>>();
  /** Die Reihenfolge der Schreibvorgaenge — die Zusage „Buendel vor HTML". */
  const putReihenfolge: string[] = [];
  const keyOf = (req: SwRequest | string) =>
    typeof req === "string" ? new URL(req, ORIGIN).href : req.url;

  const open = (name: string) => {
    let speicher = caches.get(name);
    if (!speicher) { speicher = new Map(); caches.set(name, speicher); }
    const s = speicher;
    return Promise.resolve({
      put: (req: SwRequest | string, res: Response) => {
        s.set(keyOf(req), res);
        putReihenfolge.push(new URL(keyOf(req)).pathname);
        return Promise.resolve();
      },
      match: (req: SwRequest | string) => Promise.resolve(s.get(keyOf(req))),
      keys: () => Promise.resolve([...s.keys()]),
    });
  };

  return {
    api: {
      open,
      keys: () => Promise.resolve([...caches.keys()]),
      delete: (name: string) => Promise.resolve(caches.delete(name)),
    },
    putReihenfolge,
    cachedPaths: () =>
      [...(caches.get(CACHE) ?? new Map()).keys()].map((u) => new URL(u).pathname),
    body: async (pfad: string) => {
      const res = caches.get(CACHE)?.get(new URL(pfad, ORIGIN).href);
      return res ? await res.clone().text() : null;
    },
    cacheNames: () => [...caches.keys()],
  };
}

/** Minimal-Attrappe: der Worker ruft ausschliesslich `deleteDatabase`. */
function baueIndexedDb() {
  const geloescht: string[] = [];
  return {
    geloescht,
    api: {
      deleteDatabase(name: string) {
        geloescht.push(name);
        const anfrage: Record<string, unknown> = {
          onsuccess: null, onerror: null, onblocked: null,
        };
        queueMicrotask(() => (anfrage.onsuccess as (() => void) | null)?.());
        return anfrage;
      },
    },
  };
}

function netz(opt: {
  offline?: boolean;
  abgelaufen?: boolean;
  manifestUmgeleitet?: boolean;
  personalisiert?: boolean;
  fehlenderChunk?: string;
  fehlantwort?: Response;
} = {}) {
  return vi.fn(async (eingabe: SwRequest | string) => {
    if (opt.offline) throw new TypeError("Failed to fetch");
    const pfad = new URL(typeof eingabe === "string" ? eingabe : eingabe.url, ORIGIN).pathname;

    // Der gemessene Kern (M17.1/M17.2): ein auth-pflichtiger Host beantwortet
    // JEDEN Pfad ohne Sitzung mit 307 -> /login, und `fetch` FOLGT dem — die
    // Antwort kommt mit status 200, ok true, redirected true zurueck.
    if (opt.abgelaufen) {
      return antwort(LOGIN_HTML, { url: "/login", redirected: true });
    }
    if (opt.fehlenderChunk && pfad === opt.fehlenderChunk) return opt.fehlantwort!;
    if (pfad === OFFLINE) {
      return antwort(opt.personalisiert ? PERSONALISIERTES_HTML : OFFLINE_HTML, { url: OFFLINE });
    }
    if (pfad === "/manifest.webmanifest") {
      return opt.manifestUmgeleitet
        ? antwort(LOGIN_HTML, { url: "/login", redirected: true })
        : antwort(MANIFEST, { url: pfad });
    }
    if (pfad === "/pwa-icon.svg") return antwort(ICON, { url: pfad });
    return antwort(`asset:${pfad}`, { url: pfad });
  });
}

interface FakeEvent {
  request: SwRequest;
  responded: boolean;
  response: Promise<Response | undefined> | null;
  waited: Promise<unknown>[];
  respondWith(p: Promise<Response | undefined>): void;
  waitUntil(p: Promise<unknown>): void;
}

function boot(
  fetchImpl: ReturnType<typeof netz>,
  speicher = baueCacheSpeicher(),
  idb = baueIndexedDb(),
) {
  const listeners = new Map<string, (e: FakeEvent) => void>();
  const self = {
    addEventListener: (typ: string, fn: (e: FakeEvent) => void) => listeners.set(typ, fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    location: { origin: ORIGIN },
  };

  // ZEICHEN_SW_QUELLE ist eine Konstante aus diesem Repo, nichts wird
  // hineininterpoliert — der einzige Weg, den ausgelieferten Quelltext wirklich
  // auszufuehren.
  new Function("self", "caches", "fetch", "indexedDB", ZEICHEN_SW_QUELLE)(
    self, speicher.api, fetchImpl, idb.api,
  );

  function dispatch(typ: string, request: SwRequest): FakeEvent {
    const event: FakeEvent = {
      request, responded: false, response: null, waited: [],
      respondWith(p) { event.responded = true; event.response = p; },
      waitUntil(p) { event.waited.push(p); },
    };
    listeners.get(typ)?.(event);
    return event;
  }

  const drain = (e: FakeEvent) => Promise.all(e.waited);
  return { dispatch, drain, idb, ...speicher };
}

// `new Request(..., { mode: "navigate" })` verbietet die Spezifikation — solche
// Requests erzeugt nur der Browser.
const navigation = (pfad: string): SwRequest =>
  ({ url: new URL(pfad, ORIGIN).href, method: "GET", mode: "navigate" });
const unterressource = (pfad: string): SwRequest =>
  ({ url: new URL(pfad, ORIGIN).href, method: "GET", mode: "cors" });
const post = (pfad: string): SwRequest =>
  ({ url: new URL(pfad, ORIGIN).href, method: "POST", mode: "cors" });

describe("Service Worker zeichen", () => {
  it("cacht keine weitergeleitete Antwort", async () => {
    /*
     * DIE GEFAEHRLICHSTE LAGE, und ohne diesen Fall sieht der Test sie nicht:
     * die Netzattrappe liefert {ok:true, redirected:true, url:'…/login'} — genau
     * das, was `fetch` aus dem gemessenen 307 macht (M17.2). `cache.put` GELINGT
     * damit, und im Cache laege die Anmeldeseite unter dem Offline-Schluessel.
     * Der Waechter `if (!res.ok)` aus qr/uav faengt das NICHT.
     */
    const sw = boot(netz({ abgelaufen: true }));
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(sw.cachedPaths()).not.toContain(OFFLINE);
    expect(await sw.body(OFFLINE)).toBeNull();
    expect(sw.cachedPaths()).toEqual([]);
  });

  it("cacht auch kein weitergeleitetes Manifest", async () => {
    // Der Riegel gilt fuer ASSETS genauso wie fuer HTML. qr und uav holen
    // Manifest und Icon cache-first ohne ihn; hier brennte sich sonst
    // Login-HTML dauerhaft als Manifest ein — und ein Manifest wird nie wieder
    // revalidiert, solange der Cache-Name gleich bleibt.
    const sw = boot(netz({ manifestUmgeleitet: true }));
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(sw.cachedPaths()).toContain(OFFLINE);
    expect(sw.cachedPaths()).not.toContain("/manifest.webmanifest");
    expect(sw.cachedPaths()).toContain("/pwa-icon.svg");
  });

  it("cacht kein HTML mit userName", async () => {
    // Der Inhaltsriegel. GEMESSEN (M17.3): jede Seite unter `SuiteRahmen`
    // traegt {"userName":"…","angemeldet":true} im Flight-Payload. Auf einem
    // geteilten Tablet waere das der Name der vorigen Person, offline abrufbar.
    const sw = boot(netz({ personalisiert: true }));
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(sw.cachedPaths()).not.toContain(OFFLINE);
    for (const pfad of sw.cachedPaths()) expect(pfad).not.toBe(OFFLINE);
  });

  it("legt die Buendel vor dem HTML ab", async () => {
    /*
     * Umgekehrt hinterliesze ein Deploy am Netzrand ein gecachtes HTML, dessen
     * Chunk-Hashes es nicht mehr gibt: offline kaputt, ohne Fehlermeldung. Die
     * Reihenfolge ist die Zusage, nicht die Menge.
     */
    const sw = boot(netz());
    await sw.drain(sw.dispatch("install", navigation("/")));

    const htmlPlatz = sw.putReihenfolge.indexOf(OFFLINE);
    expect(htmlPlatz).toBeGreaterThan(-1);
    for (const asset of [GETEILT, KATALOG_CHUNK, ARIMO]) {
      expect(sw.putReihenfolge.indexOf(asset), asset).toBeGreaterThan(-1);
      expect(sw.putReihenfolge.indexOf(asset), asset).toBeLessThan(htmlPlatz);
    }
  });

  it("gibt jeden gelesenen Body frei", async () => {
    /*
     * Die Zusage, an der die gesamte Offline-Faehigkeit haengt. Im Prod-Build
     * gemessen (qr/_lib/sw-source.ts:196-214): laesst der Worker den Body einer
     * 404 ungelesen liegen, kommt nach DREI solchen Antworten kein weiterer
     * `fetch` des Workers mehr zurueck. Der install-Handler laeuft nie zu Ende,
     * der Worker bleibt dauerhaft "installing", `navigator.serviceWorker.ready`
     * loest nie auf — es gibt schlicht keine PWA, ohne eine Fehlermeldung.
     * 404 ist hier ein VORGESEHENER Fall: nach einem Redeploy zeigt gecachtes
     * HTML auf Buendel-Hashes, die es nicht mehr gibt.
     */
    const fehlt = new Response("weg", { status: 404 });
    Object.defineProperty(fehlt, "url", { value: new URL(KATALOG_CHUNK, ORIGIN).href });
    const abgebrochen = vi.spyOn(fehlt.body!, "cancel");

    const sw = boot(netz({ fehlenderChunk: KATALOG_CHUNK, fehlantwort: fehlt }));
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(abgebrochen).toHaveBeenCalled();
    expect(sw.cachedPaths()).not.toContain(KATALOG_CHUNK);
    // Der Rest kommt trotzdem an — ein fehlendes Buendel darf den Install nicht
    // abbrechen, sonst reisst jeder Redeploy die ganze Offline-Faehigkeit ab.
    expect(sw.cachedPaths()).toContain(OFFLINE);
  });

  it("beantwortet ?_rsc-Anfragen nicht", async () => {
    /*
     * ALLOWLIST STATT DENYLIST. Eine Denylist (/api, /verwaltung) liess bei qr
     * die RSC-Antwort "/?_rsc=<hash>" einer Soft-Navigation durch — dieselben
     * personalisierten Daten wie im HTML, dauerhaft und ohne Revalidierung.
     */
    const sw = boot(netz());
    for (const pfad of ["/katalog?_rsc=1a2b3c", "/merkliste?_rsc=9z8y", "/api/auth/session"]) {
      const event = sw.dispatch("fetch", unterressource(pfad));
      await sw.drain(event);
      expect(event.responded, pfad).toBe(false);
    }
    expect(sw.cachedPaths()).toEqual([]);
  });

  it("liefert bei Login-Redirect die gecachte Offline-Flaeche", async () => {
    /*
     * MIT Netz, aber abgelaufener Sitzung. Ohne diesen Riegel verloere jemand
     * mit schwacher Verbindung den vollstaendig vorhandenen Katalog an eine
     * Anmeldemaske — und zwar mitten im Einsatz, wo ihn niemand neu anmelden
     * kann. Die Adresszeile steht dann auf /katalog, waehrend /offline
     * gerendert wird; das ist der bewusst gewaehlte kleinere Schaden.
     */
    const speicher = baueCacheSpeicher();
    const online = boot(netz(), speicher);
    await online.drain(online.dispatch("install", navigation("/")));

    const abgelaufen = boot(netz({ abgelaufen: true }), speicher);
    const event = abgelaufen.dispatch("fetch", navigation("/katalog"));
    const res = await event.response;
    await abgelaufen.drain(event);

    expect(await res!.clone().text()).toBe(OFFLINE_HTML);
    expect(await res!.clone().text()).not.toContain("Anmelden");
  });

  it("jede nicht gecachte Navigation faellt auf /offline zurueck", async () => {
    /*
     * Beide bestehenden Manifeste der Suite setzen start_url "/" und qr fuehrt
     * NAV_FALLBACK = "/". Hier waere "/" die RSC-Startseite unter SuiteRahmen —
     * ausdruecklich NICHT im Cache. Ohne den pauschalen Rueckfall loeste
     * `respondWith` auf `undefined` auf, und die installierte PWA landete auf
     * Chromiums Netzwerkfehlerseite. Dasselbe fuer jedes Lesezeichen.
     */
    const speicher = baueCacheSpeicher();
    const online = boot(netz(), speicher);
    await online.drain(online.dispatch("install", navigation("/")));

    const ohneNetz = boot(netz({ offline: true }), speicher);
    for (const ziel of ["/", "/katalog", "/katalog/rezept:E.1.1", "/merkliste", "/lernen"]) {
      const event = ohneNetz.dispatch("fetch", navigation(ziel));
      const res = await event.response;
      await ohneNetz.drain(event);
      expect(await res!.clone().text(), ziel).toBe(OFFLINE_HTML);
    }
  });

  it("loescht Cache und IndexedDB bei POST /api/auth/signout", async () => {
    /*
     * Seit der Merkliste-Entscheidung (Spec §7.5) ist dieser Haken von Vorsorge
     * zur TRAGENDEN Massnahme geworden: auf dem Geraet liegen jetzt Titel aus
     * der persoenlichen Merkliste. next-auth sendet beim Abmelden genau diesen
     * POST (`node_modules/next-auth/react.js:191`).
     *
     * ⛔ ER DECKT NUR DEN GEORDNETEN FALL AB — nicht Ablauf, nicht Widerruf,
     * nicht Gruppenentzug, nicht ein weggelegtes Geraet. Das steht so in der
     * Spec und darf nicht als Riegel gelesen werden.
     */
    const speicher = baueCacheSpeicher();
    const sw = boot(netz(), speicher);
    await sw.drain(sw.dispatch("install", navigation("/")));
    expect(sw.cacheNames()).toContain(CACHE);

    const event = sw.dispatch("fetch", post("/api/auth/signout"));
    await sw.drain(event);

    // Die Abmeldung selbst geht unveraendert ans Netz — der Worker beantwortet
    // sie NICHT, er raeumt nur nebenher auf.
    expect(event.responded).toBe(false);
    expect(sw.cacheNames()).toEqual([]);
    expect(sw.idb.geloescht).toContain("zeichen-merkliste");
  });
});
```

- [ ] **Schritt 8: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/sw-quelle.test.ts`
Erwartet: FAIL — `Failed to resolve import "./sw-quelle"`.

- [ ] **Schritt 9: Den Service Worker schreiben**

`src/app/m/zeichen/_lib/sw-quelle.ts`:

```ts
/**
 * Quelltext der zwei Service-Worker-Fassungen dieses Moduls (Spec §7.3).
 *
 * Beide liegen als String in `_lib`, damit der Route Handler sie ausliefern und
 * der Unit-Test sie in einer nachgebauten Worker-Umgebung AUSFUEHREN kann —
 * sonst waere das Caching-Verhalten nur im Browser pruefbar und damit faktisch
 * ungetestet. Muster: `qr/_lib/sw-source.ts`, `uav/_lib/sw-quelle.ts`.
 *
 * KEIN "use client" (Falle 6). Der Konsument `sw.js/route.ts` ist eine
 * Server-Datei; ein WERT aus einem Client-Modul kaeme dort als Client-Referenz
 * an — HTTP 500, und weder `build` noch Vitest sehen es.
 *
 * ⛔ WAS DIESER WORKER MEHR HAT ALS DIE VON qr UND uav, und warum. Dieses Modul
 * ist das ERSTE der Suite mit `requiresAuth: true` UND einer PWA — es gibt kein
 * Vorbild (M17.5). Gemessen (M17.1/M17.2): eine auth-pflichtige Route
 * beantwortet OHNE Sitzung jeden Pfad mit 307 -> /login
 * (`routing.ts:88-93`, `proxy.ts:39-44`), und `fetch` FOLGT dem still:
 * `status 200, ok true, redirected true, url …/login`. Ein
 * `cache.put("/offline", res)` GELINGT dann — im Cache laege die Anmeldeseite
 * unter dem Offline-Schluessel. Der Waechter `if (!res.ok)`
 * (`qr/_lib/sw-source.ts:100`) faengt das NICHT. Daher `holeGeprueft()`, und
 * daher gilt der Riegel AUCH fuer Assets.
 *
 * ⬜ M-A, gemessen am 2026-09-02 mit `playwright.pwa.config.ts` und vollem
 * Chromium-Kanal gegen `portal.localtest.me:3101` (dieselbe Torkonfiguration
 * wie `zeichen`, `registry.ts:57-59`): `navigator.serviceWorker.register()`
 * schickt beim /sw.js-Abruf das Sitzungscookie mit, die Registrierung gelingt
 * auf einem auth-pflichtigen Host. Deshalb steht in `core/routing.ts` KEIN
 * Durchlass. Faellt diese Messung nach einem Next-Upgrade um, ist das Symptom
 * ein `SecurityError` ueber den MIME-Type `text/html` in der Konsole — und die
 * Abhilfe ist eine Betreiberentscheidung, keine Zeile Code (Spec §7.3, §9).
 */

/**
 * DER CACHE-WORKER.
 */
export const ZEICHEN_SW_QUELLE = `
// v1: erste Fassung.
const CACHE = "zeichen-pwa-v1";

/**
 * GENAU EINE gecachte Navigationsroute — der EXTERNE Pfad auf dem Modul-Host,
 * und der ist zugleich der Cache-Schluessel. Der interne /m/zeichen/offline
 * kommt hier nirgends vor: der Rewrite ist serverintern und fuer die PWA
 * unsichtbar.
 *
 * ACHTUNG, KEINE RUECKWAERTSHOCHKOMMAS IN DIESEM KOMMENTAR: dieser Quelltext
 * liegt in einem Template-Literal, ein Hochkomma beendet es und der Parser
 * bricht mitten im Satz ab.
 *
 * WARUM NICHT "/" WIE BEI qr UND uav: "/" ist hier die RSC-Startseite unter
 * SuiteRahmen und liegt ausdruecklich NICHT im Cache (sie traegt den Klarnamen
 * im Flight-Payload). Die installierte PWA landete offline auf Chromiums
 * Netzwerkfehlerseite. Deshalb ist der Rueckfall hier JEDE nicht gecachte
 * Navigation innerhalb des Scopes -> /offline. Die Adresszeile steht dann auf
 * /katalog, waehrend /offline gerendert wird — sie luegt, und das ist der
 * bewusst gewaehlte kleinere Schaden gegenueber einer Fehlerseite.
 */
const NAV_FALLBACK = "/offline";
const SHELL_ROUTES = [NAV_FALLBACK];

/** Zwei Assets, die in keinem HTML als /_next/static/ auftauchen. */
const ZUSATZ_ASSETS = ["/manifest.webmanifest", "/pwa-icon.svg"];

/** Der Name der Geraete-Datenbank. MUSS zu _lib/merkgeraet.ts passen;
 *  merkgeraet.test.ts haelt beide Stellen zusammen. */
const MERK_DB = "zeichen-merkliste";

/** Wie lange eine geholte Offline-Fassung als frisch genug gilt, siehe qr:
 *  sw.js aendert sich bei einem gewoehnlichen Redeploy nicht Byte fuer Byte,
 *  der install-Handler laeuft dann nie wieder, und die gecachten Buendel
 *  zeigten dauerhaft auf Hashes, die es nicht mehr gibt. */
const SHELL_MAX_AGE_MS = 5 * 60 * 1000;
let lastShellRefresh = 0;

/**
 * Holt einen Pfad MIT Cookies und weist alles zurueck, was nicht wirklich von
 * diesem Pfad kommt. Fuer HTML UND fuer Assets.
 *
 * MIT Cookies, nicht credentials:"omit" wie bei qr: /offline ist auth-pflichtig,
 * ein anonymer Abruf bekaeme garantiert den Login. Die Flaeche selbst traegt
 * keine Nutzdaten (kein Shell, kein auth-Aufruf, der einen Namen liest) —
 * Vorbild uav /: gemessen 45.944 B, mit UND ohne Sitzung byteidentisch, 0x
 * userName.
 */
async function holeGeprueft(pfad) {
  let res;
  try {
    res = await fetch(pfad);
  } catch (e) {
    return null;
  }
  if (!res.ok) { await releaseBody(res); return null; }
  // DER REDIRECT-RIEGEL. Der gemessene 307 -> /login kommt hier als 200 an.
  if (res.redirected) { await releaseBody(res); return null; }
  let ziel = "";
  try { ziel = new URL(res.url, self.location.origin).pathname; } catch (e) { ziel = ""; }
  // Leeres res.url gibt es bei einer echten fetch-Antwort nicht, nur bei
  // synthetischen Responses. Fail closed: lieber nichts cachen als das Falsche.
  if (ziel !== pfad) { await releaseBody(res); return null; }
  return res;
}

/**
 * Gibt den Body einer Antwort frei, die nicht in den Cache wandert.
 *
 * Klingt nach Kosmetik, ist aber die Zusage, an der die ganze Offline-
 * Faehigkeit haengt: eine Antwort, deren Body im Service Worker weder gelesen
 * noch verworfen wird, legt dessen Abruf-Pipeline still. Im Prod-Build gemessen
 * (qr): nach DREI so liegengelassenen 404-Antworten kam KEIN weiterer fetch des
 * Workers mehr zurueck, der install-Handler lief nie zu Ende, der Worker blieb
 * dauerhaft "installing" und navigator.serviceWorker.ready loeste nie auf. Und
 * 404 ist hier ein VORGESEHENER Fall: nach einem Redeploy zeigt gecachtes HTML
 * auf Buendel-Hashes, die es nicht mehr gibt.
 */
function releaseBody(res) {
  return res.body ? res.body.cancel().catch(() => {}) : Promise.resolve();
}

/** Nimmt nur Pfade an, deren letztes Segment eine Dateiendung traegt — siehe qr:
 *  Next verteilt den Flight-Payload auf mehrere Bloecke, und eine Trennstelle
 *  faellt mitten in einen Asset-Pfad. Das Bruchstueck sieht wie ein Pfad aus,
 *  ist aber ein 404. */
function isCompleteAssetPath(pfad) {
  const ohneQuery = pfad.split(/[?#]/)[0];
  const letztes = ohneQuery.slice(ohneQuery.lastIndexOf("/") + 1);
  return /\\.[a-zA-Z0-9]+$/.test(letztes);
}

/**
 * Cache-first NUR fuer das nachweislich Anonyme und unter gehashter URL
 * Unveraenderliche. Bewusst eine ALLOWLIST: eine Denylist liess bei qr die
 * RSC-Antwort "/?_rsc=<hash>" einer Soft-Navigation durch, die dieselben
 * personalisierten Daten traegt wie das HTML — dauerhaft und ohne
 * Revalidierung. /_next/static steht ausserdem in PASSTHROUGH (routing.ts:12),
 * ist also ohne Sitzung abrufbar und kann NIE durch Login-HTML ersetzt werden.
 */
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/pwa-icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

/** Die Build-Assets, die eine Seite referenziert — aus dem AUSGELIEFERTEN HTML
 *  gelesen statt aus einem Precache-Manifest, weil die Dateinamen gehasht sind
 *  und mit jedem Build wechseln. Getrennt wird auch am Backslash: Next legt
 *  denselben Pfad ein zweites Mal im Flight-Payload ab, dort mit maskierten
 *  Anfuehrungszeichen. */
function referenzierteAssets(html) {
  const treffer = html
    .split(/["'()\\\\]/)
    .filter((teil) => teil.startsWith("/_next/static/") && isCompleteAssetPath(teil));
  return [...new Set(treffer)];
}

async function cacheAsset(pfad, cache) {
  const vorhanden = await cache.match(pfad);
  if (vorhanden) return;
  const res = await holeGeprueft(pfad);
  if (!res) return;
  await cache.put(pfad, res);
}

async function cacheShellRoute(pfad, cache) {
  const res = await holeGeprueft(pfad);
  if (!res) return;
  const text = await res.text();
  // DER INHALTSRIEGEL. Gemessen (M17.3): jede Seite unter SuiteRahmen traegt
  // {"userName":"…","angemeldet":true} und die gruppenabhaengige App-Liste im
  // Flight-Payload. Wer /offline versehentlich in die Shell haengt, bekommt ab
  // hier gar keine PWA mehr — laut ist besser als still.
  if (text.indexOf('"userName"') !== -1 || text.indexOf('"angemeldet"') !== -1) return;
  // ZUERST die Buendel, DANN das HTML. Umgekehrt hinterliesze ein Deploy am
  // Netzrand ein gecachtes HTML, dessen Chunk-Hashes es nicht mehr gibt —
  // offline kaputt, ohne Fehlermeldung.
  const assets = referenzierteAssets(text);
  for (const asset of assets) await cacheAsset(asset, cache);
  await cache.put(pfad, new Response(text, { status: 200, headers: res.headers }));
}

async function cacheAllesNoetige() {
  // Der Zeitstempel VOR den Abrufen: sonst starten zwei rasch aufeinander
  // folgende Navigationen denselben Durchlauf doppelt.
  lastShellRefresh = Date.now();
  const cache = await caches.open(CACHE);
  // Nacheinander, nicht parallel: die Seiten teilen sich Buendel, und parallel
  // sehen alle denselben Cache-Fehltreffer, bevor einer schreibt.
  for (const pfad of SHELL_ROUTES) await cacheShellRoute(pfad, cache);
  for (const pfad of ZUSATZ_ASSETS) await cacheAsset(pfad, cache);
}

function refreshShellIfStale() {
  if (Date.now() - lastShellRefresh < SHELL_MAX_AGE_MS) return Promise.resolve();
  return cacheAllesNoetige();
}

/** Loescht die Geraetedatenbank der Merkliste. onblocked wird mitbehandelt: ein
 *  zweiter offener Tab haelt die Datenbank, und ohne diesen Zweig bliebe das
 *  Promise ewig offen und mit ihm das waitUntil des Ereignisses. */
function loescheGeraeteDatenbank() {
  return new Promise((fertig) => {
    let anfrage;
    try { anfrage = indexedDB.deleteDatabase(MERK_DB); } catch (e) { fertig(); return; }
    anfrage.onsuccess = () => fertig();
    anfrage.onerror = () => fertig();
    anfrage.onblocked = () => fertig();
  });
}

/**
 * DER LOGOUT-HAKEN. next-auth sendet beim Abmelden POST /api/auth/signout
 * (node_modules/next-auth/react.js:191). Seit der Merkliste in IndexedDB
 * (Spec §7.5) ist das die TRAGENDE Massnahme und nicht mehr blosse Vorsorge.
 *
 * ⛔ ER DECKT NUR DEN GEORDNETEN FALL AB — nicht Ablauf, nicht Widerruf, nicht
 * Gruppenentzug, nicht ein weggelegtes Geraet. Wer ihn fuer eine Loeschzusage
 * haelt, liest ihn falsch.
 */
async function raeumeGeraet() {
  const namen = await caches.keys();
  await Promise.all(namen.map((n) => caches.delete(n)));
  await loescheGeraeteDatenbank();
}

async function navigationsAntwort(req, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // DER REDIRECT-RIEGEL AUF DEM NAVIGATIONSZWEIG: mit Netz, aber abgelaufener
    // Sitzung antwortet die Suite 307 -> /login, und fetch folgt dem still.
    // Ohne diesen Zweig verloere jemand mit schwacher Verbindung den
    // vollstaendig vorhandenen Katalog an eine Anmeldemaske.
    if (res.redirected) {
      let ziel = "";
      try { ziel = new URL(res.url, self.location.origin).pathname; } catch (e) { ziel = ""; }
      if (ziel.indexOf("/login") === 0) {
        const gecacht = await cache.match(NAV_FALLBACK);
        if (gecacht) { await releaseBody(res); return gecacht; }
      }
    }
    return res;
  } catch (e) {
    // Pfadgenau zuerst, dann der Rueckfall. Gematcht wird auf url.pathname
    // statt auf req — sonst suchte der Cache nach "/katalog?q=rtw" und faende
    // die query-los abgelegte Fassung nie.
    const genau = await cache.match(url.pathname);
    if (genau) return genau;
    return await cache.match(NAV_FALLBACK);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAllesNoetige().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  // Loescht JEDEN anderen Cache-Namen — der einzige nachtraegliche Hebel gegen
  // Altbestand, und er wirkt erst, wenn sich sw.js BYTEWEISE aendert.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // VOR der Methodenpruefung, weil das Abmelden ein POST ist. Der Browser
  // normalisiert req.method auf Grossbuchstaben, auch wenn next-auth "post"
  // schreibt. Beantwortet wird die Anfrage NICHT — sie geht unveraendert ans
  // Netz, hier wird nur nebenher aufgeraeumt.
  if (req.method === "POST" && url.pathname === "/api/auth/signout") {
    event.waitUntil(raeumeGeraet());
    return;
  }
  if (req.method !== "GET") return;
  // Nie eine API-Antwort cachen, auf keinem Zweig.
  if (url.pathname.indexOf("/api/") === 0) return;

  if (req.mode === "navigate") {
    event.waitUntil(refreshShellIfStale());
    event.respondWith(navigationsAntwort(req, url));
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const treffer = await cache.match(req);
      if (treffer) return treffer;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});
`;

/**
 * DER ABRAEUM-WORKER — ausgeliefert, wenn ZEICHEN_SW NICHT auf "1" steht.
 *
 * Uebernommen aus `uav/_lib/sw-quelle.ts:32-60`. Er existiert, weil ein
 * Schalter, den man einschalten kann, auch wieder ausschaltbar sein muss: ohne
 * ihn liefe auf jedem Geraet, das die PWA einmal installiert hat, der alte
 * Worker WEITER — mitsamt Cache und Geraetedatenbank —, und niemand haette
 * einen Hebel dagegen. Mit ihm holt der installierte Worker bei seiner naechsten
 * Update-Pruefung diese Fassung, raeumt alles ab und traegt sich aus.
 *
 * KEIN fetch-Handler, KEIN releaseBody: dieser Worker liest niemals eine
 * Antwort, ein releaseBody waere toter Code (dieselbe Begruendung wie bei uav).
 */
export const ZEICHEN_SW_ABRAEUM_QUELLE = `// Abraeum-Worker: raeumt Cache und Geraetedaten ab und traegt sich aus.
// KEIN fetch-Handler. Dieser Worker beantwortet nichts.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n)));
      try { indexedDB.deleteDatabase("zeichen-merkliste"); } catch (e) {}
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
`;
```

- [ ] **Schritt 10: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/sw-quelle.test.ts`
Erwartet: PASS, neun Tests — die neun Namen aus Spec §8.2.

---

- [ ] **Schritt 11: Den fehlschlagenden Test für die drei PWA-Routen schreiben**

`src/app/m/zeichen/pwa-routen.test.ts` — Vorbild `src/app/m/lagerbuch/pwa.route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GET as manifest } from "./manifest.webmanifest/route";
import { GET as icon } from "./pwa-icon.svg/route";
import { GET as worker } from "./sw.js/route";
import { ZEICHEN_SW_QUELLE, ZEICHEN_SW_ABRAEUM_QUELLE } from "./_lib/sw-quelle";

/**
 * KEIN `// @vitest-environment jsdom` — diese Datei prueft `Response`-Objekte,
 * kein DOM.
 */

describe("PWA-Routen zeichen", () => {
  it("das Manifest startet auf /offline und umfasst den ganzen Host", async () => {
    /*
     * ⛔ DIE EINE ZEILE, DIE VON BEIDEN BESTEHENDEN MANIFESTEN DER SUITE ABWEICHT.
     * qr/manifest.webmanifest/route.ts:37 und uav setzen `start_url: "/"`. Hier
     * waere "/" die RSC-Startseite unter SuiteRahmen — sie liegt ausdruecklich
     * NICHT im Cache, und die installierte PWA landete offline auf Chromiums
     * Netzwerkfehlerseite. `scope` bleibt "/", damit der Worker JEDE Navigation
     * des Hosts sieht und auf /offline zurueckfallen kann.
     */
    const json = await (await manifest()).json();
    expect(json.start_url).toBe("/offline");
    expect(json.scope).toBe("/");
    expect(json.icons[0].src).toBe("/pwa-icon.svg");
    expect(json.display).toBe("standalone");
  });

  it("Manifest-Startadresse und Worker-Rueckfall sind dieselbe Route", async () => {
    // Das Dreieck dieser Aufgabe: manifest.start_url == NAV_FALLBACK ==
    // (rahmenlos)/offline. Laufen zwei davon auseinander, startet die
    // installierte PWA auf einer Route, die der Worker nicht kennt — und das
    // sieht man erst offline, im Einsatz.
    const json = await (await manifest()).json();
    expect(ZEICHEN_SW_QUELLE).toContain(`const NAV_FALLBACK = "${json.start_url}";`);
  });

  it("das Icon kommt als SVG und ohne @ant-design/icons", async () => {
    // Falle 7: ein Icon-Import aus @ant-design/icons ergibt in einem Route
    // Handler HTTP 500 beim IMPORT, nicht beim Rendern. Dieses Modul ist ein
    // SVG-Modul und fasst das Paket nirgends an.
    const res = await icon();
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(await res.text()).toContain("<svg");
  });

  it("mit ZEICHEN_SW=1 liefert /sw.js den Cache-Worker", async () => {
    const res = worker({ ZEICHEN_SW: "1" });
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe(ZEICHEN_SW_QUELLE);
  });

  it("ohne ZEICHEN_SW liefert /sw.js den Abraeum-Worker", async () => {
    /*
     * Ein Schalter, den man einschalten kann, muss auch ausschaltbar sein: ohne
     * diesen Zweig liefe auf jedem Geraet, das die PWA einmal installiert hat,
     * der alte Worker WEITER — mitsamt Cache und Geraetedatenbank.
     */
    expect(await worker({}).text()).toBe(ZEICHEN_SW_ABRAEUM_QUELLE);
  });
});
```

- [ ] **Schritt 12: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/pwa-routen.test.ts`
Erwartet: FAIL — `Failed to resolve import "./manifest.webmanifest/route"`.

- [ ] **Schritt 13: Die drei Routen schreiben**

`src/app/m/zeichen/sw.js/route.ts`:

```ts
import { zeichenSwAn } from "../_lib/boot";
import { ZEICHEN_SW_QUELLE, ZEICHEN_SW_ABRAEUM_QUELLE } from "../_lib/sw-quelle";

/**
 * Service Worker als Route Handler UNTER dem Modul — derselbe Trick wie beim
 * Manifest: extern liegt er auf `zeichen.<domain>/sw.js` (Root-Scope, ohne
 * `Service-Worker-Allowed`-Header), intern unter `/m/zeichen/sw.js`. Auf jedem
 * anderen Host rewritet `/sw.js` in dessen Modul und laeuft dort ins Leere.
 *
 * ⛔ OHNE `SUITE_HOST_ZEICHEN` GIBT ES DIESEN PFAD NICHT: `decideRoute` faellt
 * dann aufs Portal zurueck und `/sw.js` wird zu `/m/portal/sw.js` -> 404. Genau
 * davor steht der Boot-Riegel in `_lib/boot.ts`.
 *
 * `env` ist ein PARAMETER mit Vorgabe, kein Zugriff auf `process.env` mitten im
 * Rumpf — nur so ist der Handler ohne Umgebungsgefummel testbar.
 */
export function GET(
  env: Record<string, string | undefined> = process.env,
): Response {
  return new Response(zeichenSwAn(env) ? ZEICHEN_SW_QUELLE : ZEICHEN_SW_ABRAEUM_QUELLE, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      // no-cache, nicht no-store: der Browser prueft den Worker bei jeder
      // Navigation gegen den Server, darf ihn aber revalidieren.
      "cache-control": "no-cache",
    },
  });
}
```

> ⚠️ Next reicht dem `GET` eines Route Handlers ein `Request` als erstes Argument. Das ist hier
> gewollt folgenlos: der Parameter trägt eine **Vorgabe** und wird nur im Test gesetzt. Eine
> Vorgabe wird in TypeScript nur bei `undefined` eingesetzt — deshalb liest der Handler in
> Produktion nicht `process.env`, sondern das `Request`-Objekt. **Das ist ein Fehler**, und damit er
> nicht entsteht, lautet die Fassung wie oben **nicht** so, sondern so:

```ts
export function GET(): Response {
  return baueAntwort(process.env);
}

/** Ausgelagert, damit `pwa-routen.test.ts` die Umgebung setzen kann, ohne dass
 *  der Handler eine Signatur bekommt, die Next mit einem `Request` fuellt. */
export function baueAntwort(env: Record<string, string | undefined>): Response {
  return new Response(zeichenSwAn(env) ? ZEICHEN_SW_QUELLE : ZEICHEN_SW_ABRAEUM_QUELLE, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
```

Und in `pwa-routen.test.ts` die zwei Worker-Fälle entsprechend auf `baueAntwort` umstellen:

```ts
import { baueAntwort as worker } from "./sw.js/route";
```

`src/app/m/zeichen/manifest.webmanifest/route.ts`:

```ts
import { getModule } from "@/core/registry";

/**
 * Domain-scoped Manifest. Liegt bewusst UNTER dem Modul, nicht als globales
 * `app/manifest.ts`: die Host-Middleware rewritet
 * `zeichen.<domain>/manifest.webmanifest` hierher, waehrend derselbe Pfad auf
 * jedem anderen Host in dessen Modul rewritet und dort 404 liefert.
 *
 * ⛔ `start_url: "/offline"` — DIE EINE ZEILE, DIE VON qr UND uav ABWEICHT
 * (beide setzen "/"). Hier waere "/" die RSC-Startseite unter SuiteRahmen, und
 * die liegt ausdruecklich NICHT im Cache: die installierte PWA landete offline
 * auf Chromiums Netzwerkfehlerseite (`caches.match("/")` leer,
 * `caches.match(NAV_FALLBACK)` ebenfalls leer, `respondWith` loest auf
 * `undefined` auf). `scope` bleibt "/", damit der Worker JEDE Navigation des
 * Hosts sieht und darauf zurueckfallen kann.
 *
 * ⛔ DER MANIFEST-LINK IM LAYOUT TRAEGT `crossOrigin="use-credentials"`
 * (`layout.tsx`, Aufgabe 5). Ohne das Attribut holt der Browser das Manifest
 * OHNE Cookies und bekommt auf einem auth-pflichtigen Host Login-HTML.
 */
export function GET(): Response {
  const mod = getModule("zeichen");
  return Response.json(
    {
      name: mod.title,
      // Kurzform fuer das Startsymbol: unter einem Homescreen-Icon bricht
      // „Taktische Zeichen" ab und niemand sieht, welche App das ist.
      short_name: "Zeichen",
      description: "Taktische Zeichen nachschlagen, bauen und ueben.",
      start_url: "/offline",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#c8000f",
      icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
```

`src/app/m/zeichen/pwa-icon.svg/route.ts`:

```ts
/**
 * Modul-eigenes Icon als Route statt Datei in `public/`: `public/` wird auf
 * ALLEN Hosts ausgeliefert (die Middleware sieht statische Assets nicht), ein
 * Route Handler unterhalb von `/m/zeichen/` nur auf dem Modul-Host.
 *
 * Handgeschriebenes SVG, KEIN Import aus `@ant-design/icons` (Falle 7): der
 * nackte Spezifizierer loest in der RSC-Ebene auf CJS auf, das `createContext`
 * auf Modulebene ruft — HTTP 500 schon beim Import, und `"use client"` behebt
 * das nicht, es macht es still.
 *
 * Das Motiv ist das Grundzeichen einer Gruppe: das Rechteck der Einheit mit
 * drei Punkten darueber.
 */
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="24" fill="#c8000f"/>
  <circle cx="72" cy="54" r="8" fill="#fff"/>
  <circle cx="96" cy="54" r="8" fill="#fff"/>
  <circle cx="120" cy="54" r="8" fill="#fff"/>
  <rect x="36" y="80" width="120" height="72" fill="none" stroke="#fff" stroke-width="10"/>
</svg>`;

export function GET(): Response {
  return new Response(ICON, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600",
    },
  });
}
```

- [ ] **Schritt 14: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/pwa-routen.test.ts && pnpm typecheck`
Erwartet: PASS, fünf Tests. `typecheck` grün (Exit-Code 0 — nicht die Meldung lesen, siehe
`CLAUDE.md`, Abschnitt „Tests").

---

- [ ] **Schritt 15: `RegisterSW` schreiben und im Modul-Layout einhängen**

`src/app/m/zeichen/RegisterSW.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/**
 * Registriert den Modul-Service-Worker — Muster `qr/RegisterSW.tsx`, Prop-Form
 * wie `uav/RegisterSW.tsx`.
 *
 * `an` kommt aus `zeichenSwAn(process.env)` im Modul-Layout (Server Component).
 * Ein WERT aus einem `"use client"`-Modul kaeme dort nicht an (Falle 6) —
 * deshalb lebt `zeichenSwAn` in `_lib/boot.ts` OHNE `"use client"`.
 *
 * `isSecureContext` ist der Grund, warum die PWA lokal ein Chrome-Flag braucht:
 * `http://zeichen.localtest.me` ist fuer den Browser kein sicherer Kontext (nur
 * `localhost`/`127.0.0.1` sind es), in Prod hinter TLS schon.
 *
 * ⛔ KEIN `register()` OHNE `an`: auf einer Instanz ohne SUITE_HOST_ZEICHEN
 * rewritet `/sw.js` ins Portal und liefert 404 — die Registrierung scheiterte
 * dann mit EINER Konsolenzeile, und niemand merkte es.
 */
export function RegisterSW({ an }: { an: boolean }) {
  useEffect(() => {
    if (!an) return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[zeichen] SW-Registrierung fehlgeschlagen", err);
    });
  }, [an]);
  return null;
}
```

In `src/app/m/zeichen/layout.tsx` (Aufgabe 5) — dem **gemeinsamen Vorfahren beider Routengruppen**,
damit die Registrierung auch dann läuft, wenn jemand `/offline` als erste Seite öffnet:

```tsx
import { RegisterSW } from "./RegisterSW";
import { zeichenSwAn } from "./_lib/boot";

// … im Rumpf, innerhalb des <div> mit der Arimo-Klasse, vor {children}:
      <RegisterSW an={zeichenSwAn(process.env)} />
```

> Warum hier und nicht in `(shell)/layout.tsx`: `(rahmenlos)` ist ein **Geschwister**-Segment, kein
> Kind. Ein `RegisterSW` im Shell-Layout liefe auf `/offline` nie — und genau dort ist es am
> nützlichsten, weil das die Route ist, die als `start_url` geöffnet wird.

---

- [ ] **Schritt 16: Den fehlschlagenden Test für die rahmenlose Fläche schreiben**

`src/app/m/zeichen/_lib/offlineflaeche.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * QUELLTEXT-SCAN, kein DOM-Test — und er bewacht den EINEN Fehler, den kein
 * anderes Tor sieht: haengt jemand `/offline` in die `<Shell>`, traegt das HTML
 * `"userName"`, der Inhaltsriegel des Workers lehnt es zu Recht ab, und die PWA
 * cacht ab da GAR NICHTS mehr. `build`, `typecheck` und Vitest bleiben gruen,
 * die Seite sieht im Browser sogar besser aus, und der Ausfall zeigt sich erst
 * offline. Vorbild der Bauform: `core/shell/icons.test.ts:147`.
 */

const RAHMENLOS_LAYOUT = "src/app/m/zeichen/(rahmenlos)/layout.tsx";
const OFFLINE_SEITE = "src/app/m/zeichen/(rahmenlos)/offline/page.tsx";
const KATALOG_INSEL = "src/app/m/zeichen/_ui/KatalogInsel.tsx";

const lies = (pfad: string) => readFileSync(pfad, "utf8");

/** Kommentare weg, sonst schlaegt der Scan auf den BEGRUENDUNGEN an, die genau
 *  diese Namen nennen. */
function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((zeile) => !zeile.trim().startsWith("//"))
    .join("\n");
}

describe("die rahmenlose Offline-Flaeche", () => {
  it.each([RAHMENLOS_LAYOUT, OFFLINE_SEITE])(
    "%s traegt weder Shell noch SuiteRahmen",
    (pfad) => {
      const quelle = ohneKommentare(lies(pfad));
      for (const verboten of ["SuiteRahmen", "FullShell", "MinimalShell", "<Shell"]) {
        expect(quelle, `${pfad}: ${verboten}`).not.toContain(verboten);
      }
    },
  );

  it.each([RAHMENLOS_LAYOUT, OFFLINE_SEITE])("%s ruft kein auth()", (pfad) => {
    // Gemessen (M17.3): jede Flaeche, die eine Sitzung liest, kann den Klarnamen
    // ins HTML tragen. Vorbild `uav /`: 45.944 B, mit UND ohne Sitzung
    // byteidentisch, 0x userName — genau diese Eigenschaft wird hier bewacht.
    const quelle = ohneKommentare(lies(pfad));
    expect(quelle).not.toContain("auth(");
    expect(quelle).not.toContain("canAdminModule");
  });

  it("das rahmenlose Layout legt dieselbe Bediendichte wie FullShell", () => {
    /*
     * Ohne `Arbeitsdichte` stuenden antd-Bedienelemente auf /offline auf 56/72
     * (der Einsatzwert aus `buildTheme`), waehrend das eigene Markup derselben
     * Insel seine 44 als LITERAL traegt — dieselbe Flaeche in zwei Groessen, und
     * kein Gate sieht es (Falle 5, still).
     */
    const quelle = ohneKommentare(lies(RAHMENLOS_LAYOUT));
    expect(quelle).toContain("Arbeitsdichte");
  });

  it("die Katalog-Insel kennt die Prop offline", () => {
    // Die Kopplung zwischen Aufgabe 6 und dieser Aufgabe. Faellt die Prop weg,
    // rendert /offline Merken-Knoepfe, die ohne Verbindung in einen Fehler
    // laufen — und das kostet an der Einsatzstelle genau die Zeit, um die es
    // geht (Spec §7.4).
    expect(ohneKommentare(lies(KATALOG_INSEL))).toContain("offline");
  });
});
```

- [ ] **Schritt 17: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/offlineflaeche.test.ts`
Erwartet: FAIL — `ENOENT: no such file or directory, open 'src/app/m/zeichen/(rahmenlos)/layout.tsx'`.

- [ ] **Schritt 18: Die rahmenlose Fläche schreiben**

`src/app/m/zeichen/(rahmenlos)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DIE HUELLE DER OFFLINE-FLAECHE — eigener 56px-Kopf, KEIN `<Shell>`, KEIN
 * `auth()`.
 *
 * ⛔ WARUM OHNE SHELL, und das ist die tragende Zeile dieser Aufgabe: gemessen
 * (M17.3) traegt JEDE Seite unter `SuiteRahmen` `{"userName":"…",
 * "angemeldet":true}` und die gruppenabhaengige App-Liste im Flight-Payload —
 * zwei Personen, dieselbe URL: 281.170 vs. 279.159 B. Der Inhaltsriegel des
 * Service Workers lehnt solches HTML ab, und zwar zu Recht. Wer hier eine Shell
 * einzieht, bekommt keine haessliche Seite, sondern GAR KEINE PWA — still.
 * `offlineflaeche.test.ts` haelt das fest.
 * Gegenbild: `uav /` mit 45.944 B, mit und ohne Sitzung byteidentisch, 0x
 * userName.
 *
 * ⛔ DIESELBE BEDIENDICHTE WIE `FullShell` (`FullShell.tsx:36`): `ARBEITSDICHTE`
 * 44/48 ueber dem INHALT. Ohne sie stuenden die antd-Bedienelemente derselben
 * Insel hier auf 56/72 (dem Einsatzwert aus `buildTheme`), waehrend ihr eigenes
 * Markup 44 als Literal traegt — dieselbe Flaeche in zwei Groessen, und kein
 * Gate sieht es (Falle 5).
 *
 * ⛔ KEIN antd-`Layout.Header`: Falle 8 (die Kopfzeile vererbt ihre 64px
 * Zeilenhoehe an jedes Kind) entsteht hier gar nicht, weil die Regel an
 * `.ant-layout-header` haengt und ein eigenes `<header>` nichts davon erbt.
 * 56px ist bewusst NICHT 64: dies ist kein Suite-Kopf, sondern eine Zeile mit
 * einem Titel und einem Weg zurueck.
 *
 * ⛔ KEIN Compound-Zugriff auf antd (Falle 1): natives `<h1>`, natives
 * `<header>`. Kein `@ant-design/icons` (Falle 7). Kein Suite-Rot auf einer
 * Datenflaeche (Falle 3).
 */
export default function ZeichenRahmenlosLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh" }}>
      <header
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: SPACE.md,
          paddingInline: SPACE.md,
          borderBlockEnd: "1px solid var(--iuk-linie)",
        }}
      >
        <span style={SCHRIFT.unterTitel}>Taktische Zeichen</span>
        {/* /login steht in PASSTHROUGH (routing.ts:12) und ist deshalb die
            einzige Adresse, die von dieser Flaeche aus auch mit abgelaufener
            Sitzung sicher erreichbar ist. */}
        <Link
          href="/login"
          style={{
            ...SCHRIFT.neben,
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            color: "inherit",
          }}
        >
          Anmelden
        </Link>
      </header>
      <main style={{ padding: SPACE.md }}>
        <Arbeitsdichte>{children}</Arbeitsdichte>
      </main>
    </div>
  );
}
```

> ⚠️ `--iuk-linie` muss in `app/globals.css` existieren. Falls nicht: die Zeile durch
> `borderBlockEnd: "1px solid rgba(128,128,128,0.3)"` ersetzen — **nicht** `--ant-*` lesen, die
> Variablen liegen auf antds Scope-Klasse und sind hier unsichtbar (Falle 2, und der Fehler ist
> still: die Linie verschwindet einfach).

`src/app/m/zeichen/(rahmenlos)/offline/page.tsx`:

```tsx
import { KatalogInsel } from "../../_ui/KatalogInsel";
import { AbgemeldetStreifen } from "../../_ui/AbgemeldetStreifen";
import { MerklisteGeraet } from "../../_ui/MerklisteGeraet";
import { KATALOG_STAND } from "../../_lib/katalog";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DIE EINZIGE GECACHTE NAVIGATIONSROUTE (Spec §7.3). Sie verdoppelt die
 * Katalogflaeche NICHT — dieselbe `<KatalogInsel />`, nur ohne Shell und mit
 * gesetztem `offline`.
 *
 * ⛔ KEIN `auth()`, KEIN `cookies()`, KEIN Datenbankzugriff. Alles davon
 * traegt am Ende eine Person ins HTML, und der Inhaltsriegel des Workers lehnt
 * das ab — die PWA cachte dann gar nichts mehr.
 */
export default function OfflineSeite() {
  // Aus `YYYY-MM-DD` ohne `new Date`: ein Datumsobjekt braechte an dieser
  // Stelle nur die Zeitzonenfrage zurueck, und die Zeichenkette traegt die
  // Antwort schon (dieselbe Linie wie `neuigkeiten/register.ts`).
  const [jahr, monat, tag] = KATALOG_STAND.erzeugtAm.split("-");

  return (
    <div
      data-testid="zeichen-offline"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
    >
      <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>Zeichen ohne Verbindung</h1>

      {/* DER ERSTE SATZ, nicht eine Fussnote (Spec §7.4): ein Knopf, der
          offline in einen Fehler laeuft, kostet an der Einsatzstelle genau die
          Zeit, um die es geht. */}
      <p style={{ ...SCHRIFT.text, margin: 0 }}>
        Offline kannst du alle Zeichen nachschlagen, durchsuchen und deine Merkliste ansehen.
        Ändern, Bauen und Üben brauchen eine Verbindung.
      </p>

      {/* OHNE DIESE ZEILE kann niemand beurteilen, ob das, was er offline
          sieht, aktuell ist — und der Cache kann beliebig alt sein. */}
      <p style={{ ...SCHRIFT.neben, margin: 0 }} data-testid="zeichen-offline-stand">
        {KATALOG_STAND.anzahl} Zeichen, Stand {tag}.{monat}.{jahr}.
      </p>

      <AbgemeldetStreifen />
      <MerklisteGeraet />
      {/* SUSPENSE IST PFLICHT: KatalogInsel ruft useSearchParams(). /offline liest
          keine dynamische Server-API und wird deshalb statisch vorgerendert — ohne
          Grenze bricht der Build („useSearchParams() should be wrapped in a suspense
          boundary") bzw. kippt ausgerechnet die Offline-Route ganz in CSR. */}
      <Suspense>
        <KatalogInsel offline />
      </Suspense>
    </div>
  );
}
```

`src/app/m/zeichen/_ui/AbgemeldetStreifen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * Der Streifen fuer den Fall „mit Netz, aber abgelaufener Sitzung".
 *
 * ⛔ WARUM DAS EINE CLIENT-ENTSCHEIDUNG IST: diese Seite wird vom Service
 * Worker aus dem Cache ausgeliefert — sie ist EIN gespeichertes HTML fuer beide
 * Lagen und kann serverseitig gar nicht wissen, welche gerade gilt. Kommt
 * jemand hier an, OBWOHL er Netz hat, dann deshalb, weil die Suite auf
 * /login umgeleitet hat und der Redirect-Riegel des Workers die gecachte
 * Flaeche ausgeliefert hat (Spec §7.3).
 *
 * ⛔ KEIN Suite-Rot (Falle 3: colorError === colorPrimary === #c8000f). Der
 * Streifen ist eine Auskunft, keine Fehlermeldung.
 *
 * Nachgesehen, nicht angenommen: `SessionGuard` (`components/providers.tsx:63`)
 * handelt NUR bei `session.error === "RefreshTokenError"`. Eine schlicht
 * fehlende Sitzung loest hier also keine Weiterleitung aus — dieser Streifen
 * ist das einzige Signal.
 */
export function AbgemeldetStreifen() {
  const [imNetz, setImNetz] = useState(false);

  useEffect(() => {
    const messen = () => setImNetz(navigator.onLine);
    messen();
    window.addEventListener("online", messen);
    window.addEventListener("offline", messen);
    return () => {
      window.removeEventListener("online", messen);
      window.removeEventListener("offline", messen);
    };
  }, []);

  if (!imNetz) return null;

  return (
    <p
      style={{
        ...SCHRIFT.text,
        margin: 0,
        padding: SPACE.sm,
        border: "1px solid var(--iuk-linie)",
        borderRadius: 4,
      }}
    >
      Du bist abgemeldet. Zum Merken und Üben bitte{" "}
      <a href="/login">neu anmelden</a>.
    </p>
  );
}
```

- [ ] **Schritt 19: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/offlineflaeche.test.ts`
Erwartet: PASS bis auf den letzten Fall („die Katalog-Insel kennt die Prop offline") — der wird in
Schritt 20 grün. Bleibt einer der ersten vier rot, steht der verbotene Name in der Meldung.

- [ ] **Schritt 20: Die Prop `offline` in `KatalogInsel` ergänzen**

In `src/app/m/zeichen/_ui/KatalogInsel.tsx` (Aufgabe 6) — **zwei** Stellen:

```tsx
export function KatalogInsel({ offline = false, gemerkt = [] }: {
  offline?: boolean;
  gemerkt?: readonly ZeichenId[];
}) {
```

und an jeder schreibenden Fläche (Merken/Entfernen — die Server Actions aus `actions.ts`):

```tsx
      {/* ⛔ NICHT `disabled`, sondern GAR NICHT GERENDERT. Ein ausgegrauter
          Knopf sagt „gleich vielleicht"; hier geht es dauerhaft nicht, solange
          keine Verbindung besteht. Und ein Knopf, der offline in einen Fehler
          laeuft, kostet an der Einsatzstelle genau die Zeit, um die es geht
          (Spec §7.4). */}
      {offline
        ? <p>Merken braucht eine Verbindung.</p>
        : <Button data-testid="zeichen-merken" onClick={() => merken(z.id)}>Merken</Button>}
```

> **Aufgabe 6 baut diese Fläche bereits vollständig**, einschließlich der `offline`-Prop und des
> Griffs `zeichen-merken`. Dieser Schritt ergänzt deshalb nichts, sondern **prüft**: In
> `KatalogInsel.tsx` darf unter `offline` keine Fläche stehen, die eine Server Action auslöst —
> weder Merken noch Entfernen noch der Weg auf `/katalog/[id]` (die Einzelseite ist nicht
> gecacht). Die Regel lautet: **offline wird nichts gerendert, was eine Server Action auslöst.**
> Trifft die Prüfung auf eine Abweichung, wird sie hier korrigiert und im Commit benannt.

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/offlineflaeche.test.ts`
Erwartet: PASS, alle Fälle.

---

- [ ] **Schritt 21: Den fehlschlagenden Test für die Geräte-Merkliste schreiben**

`src/app/m/zeichen/_lib/merkgeraet.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { ZEICHEN_SW_QUELLE } from "./sw-quelle";

/**
 * ⚠️ JSDOM KENNT KEIN IndexedDB, und `fake-indexeddb` ist NICHT installiert —
 * eine Abhaengigkeit dafuer aufzunehmen waere eine eigene Entscheidung. Deshalb
 * eine handgeschriebene Minimal-Attrappe: EIN Speicher, EIN Schluessel, mehr
 * benutzt `merkgeraet.ts` nicht. Was sie NICHT beweist, steht hier statt
 * verschwiegen zu werden: dass ein echter Browser dieselbe Reihenfolge von
 * `onupgradeneeded`/`onsuccess` faehrt. Das zeigt allein der Handlauf
 * `pnpm e2e:pwa` (Aufgabe 10).
 */
function baueIndexedDbAttrappe() {
  const daten = new Map<string, unknown>();
  const geloescht: string[] = [];
  const api = {
    open(_name: string, _version?: number) {
      const anfrage: Record<string, unknown> = {
        result: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null,
      };
      queueMicrotask(() => {
        anfrage.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          close: () => {},
          transaction: () => ({
            objectStore: () => ({
              put(wert: unknown, schluessel: string) {
                daten.set(schluessel, wert);
                const r: Record<string, unknown> = { onsuccess: null, onerror: null };
                queueMicrotask(() => (r.onsuccess as (() => void) | null)?.());
                return r;
              },
              get(schluessel: string) {
                const r: Record<string, unknown> = {
                  result: daten.get(schluessel), onsuccess: null, onerror: null,
                };
                queueMicrotask(() => (r.onsuccess as (() => void) | null)?.());
                return r;
              },
            }),
          }),
        };
        (anfrage.onupgradeneeded as (() => void) | null)?.();
        (anfrage.onsuccess as (() => void) | null)?.();
      });
      return anfrage;
    },
    deleteDatabase(name: string) {
      daten.clear();
      geloescht.push(name);
      const r: Record<string, unknown> = { onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => (r.onsuccess as (() => void) | null)?.());
      return r;
    },
  };
  return { daten, geloescht, api };
}

describe("Merkliste im Geraet", () => {
  let attrappe: ReturnType<typeof baueIndexedDbAttrappe>;

  beforeEach(() => {
    attrappe = baueIndexedDbAttrappe();
    (globalThis as Record<string, unknown>).indexedDB = attrappe.api;
  });

  it("schreibt und liest dieselben Eintraege", async () => {
    const { schreibeMerkliste, liesMerkliste } = await import("./merkgeraet");
    await schreibeMerkliste([
      { id: "rezept:C.1.1", titel: "Löschstaffel" },
      { id: "grund:base.formation", titel: "Einheit" },
    ]);
    expect(await liesMerkliste()).toEqual([
      { id: "rezept:C.1.1", titel: "Löschstaffel" },
      { id: "grund:base.formation", titel: "Einheit" },
    ]);
  });

  it("liefert eine leere Liste, solange nichts geschrieben wurde", async () => {
    // Der haeufigste Fall auf einem frischen Geraet — und er darf keinen Fehler
    // zeigen, sondern die Aussage „hier steht nichts".
    const { liesMerkliste } = await import("./merkgeraet");
    expect(await liesMerkliste()).toEqual([]);
  });

  it("wirft nicht, wenn es gar kein IndexedDB gibt", async () => {
    // Ein Browser im privaten Modus kann IndexedDB verweigern. Die Merkliste
    // ist Zugabe — sie darf die Katalogflaeche nicht mitreissen.
    delete (globalThis as Record<string, unknown>).indexedDB;
    const { liesMerkliste, schreibeMerkliste } = await import("./merkgeraet");
    await expect(schreibeMerkliste([{ id: "x", titel: "y" }])).resolves.toBeUndefined();
    expect(await liesMerkliste()).toEqual([]);
  });

  it("der Loeschknopf raeumt die Geraetedatenbank ab", async () => {
    const { schreibeMerkliste, loescheGeraetedaten } = await import("./merkgeraet");
    await schreibeMerkliste([{ id: "rezept:C.1.1", titel: "Löschstaffel" }]);
    await loescheGeraetedaten();
    expect(attrappe.geloescht).toContain("zeichen-merkliste");
  });

  it("Worker und Insel meinen dieselbe Datenbank", async () => {
    /*
     * DAS DRITTE DREIECK DIESER AUFGABE. Der Logout-Haken im Worker loescht
     * einen Datenbanknamen, den er als Literal traegt; die Insel schreibt unter
     * einem Namen, den SIE als Literal traegt. Laufen die zwei auseinander,
     * loescht der Logout eine Datenbank, die es nicht gibt — und die echte
     * bleibt mit den Titeln der vorigen Person auf dem geteilten Geraet liegen.
     * Kein anderes Tor sieht das.
     */
    const { MERKLISTE_DB } = await import("./merkgeraet");
    expect(MERKLISTE_DB).toBe("zeichen-merkliste");
    expect(ZEICHEN_SW_QUELLE).toContain(`const MERK_DB = "${MERKLISTE_DB}";`);
    expect(ZEICHEN_SW_ABRAEUM_QUELLE).toContain(`deleteDatabase("${MERKLISTE_DB}")`);
  });
});
```

> ⚠️ Die letzte Zusicherung prüft **beide** Worker-Fassungen mit einem Ausdruck: `MERK_DB` steht im
> Cache-Worker, `deleteDatabase("zeichen-merkliste")` im Abräum-Worker. Beide Zeichenketten stehen in
> `ZEICHEN_SW_QUELLE` bzw. — für die zweite — auch in `ZEICHEN_SW_ABRAEUM_QUELLE`; prüft die zweite
> Zeile rot, wird sie auf `ZEICHEN_SW_ABRAEUM_QUELLE` umgestellt, **nicht** gelöscht.

- [ ] **Schritt 22: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/merkgeraet.test.ts`
Erwartet: FAIL — `Failed to resolve import "./merkgeraet"`.

- [ ] **Schritt 23: Die Geräte-Merkliste schreiben**

`src/app/m/zeichen/_lib/merkgeraet.ts`:

```ts
/**
 * DIE MERKLISTE AUF DEM GERAET (Spec §7.5, Betreiberentscheidung 2026-09-02).
 *
 * ⛔ NICHT UEBER DEN HTTP-CACHE. Dort laege personenbezogenes HTML, und der
 * Inhaltsriegel des Service Workers lehnte es zu Recht ab. Geschrieben wird
 * ausschliesslich ONLINE (von `MerklisteSpiegel`, gespeist aus der Datenbank),
 * gelesen offline.
 *
 * ⛔ WAS DAS AUFGIBT, ausgeschrieben: offline gibt es keine Authentifizierung —
 * das Sitzungscookie ist HttpOnly und fuer Seite wie Worker unsichtbar, und
 * IndexedDB ueberlebt den Logout genauso wie der Cache. Auf einem geteilten
 * Geraet sieht die Titel auch, wer sich nach dir anmeldet. Deshalb steht auf
 * /offline ein Hinweis samt Loeschknopf (`_ui/MerklisteGeraet.tsx`), und
 * deshalb faengt der Worker `POST /api/auth/signout`.
 *
 * KEIN "use client": die Datei exportiert einen TYP, den auch eine Server
 * Component (`_ui/MerklisteSpiegel.tsx`) liest — ein Wert aus einem
 * Client-Modul kaeme dort nicht an (Falle 6). Die Funktionen fassen
 * `indexedDB` erst beim AUFRUF an, nicht auf Modulebene; ein Import in einer
 * Server Component ist damit folgenlos.
 */

/** Der Name der Geraetedatenbank. MUSS zu `MERK_DB` in `_lib/sw-quelle.ts`
 *  passen — `merkgeraet.test.ts` haelt beide Stellen zusammen. */
export const MERKLISTE_DB = "zeichen-merkliste";
const SPEICHER = "merkliste";
const SCHLUESSEL = "aktuell";

export interface MerkEintrag {
  readonly id: string;
  readonly titel: string;
}

function fabrik(): IDBFactory | null {
  const g = globalThis as unknown as { indexedDB?: IDBFactory };
  return g.indexedDB ?? null;
}

/** Oeffnet die Datenbank und liefert `null` statt zu werfen. Ein Browser im
 *  privaten Modus kann IndexedDB verweigern; die Merkliste ist Zugabe und darf
 *  die Katalogflaeche nicht mitreissen. */
function oeffne(): Promise<IDBDatabase | null> {
  const f = fabrik();
  if (!f) return Promise.resolve(null);
  return new Promise((fertig) => {
    let anfrage: IDBOpenDBRequest;
    try {
      anfrage = f.open(MERKLISTE_DB, 1);
    } catch {
      fertig(null);
      return;
    }
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains(SPEICHER)) db.createObjectStore(SPEICHER);
    };
    anfrage.onsuccess = () => fertig(anfrage.result);
    anfrage.onerror = () => fertig(null);
    // Ein zweiter offener Tab haelt die Datenbank. Ohne diesen Zweig bliebe das
    // Promise ewig offen und der aufrufende Effekt haengen.
    anfrage.onblocked = () => fertig(null);
  });
}

/** EIN Datensatz mit der ganzen Liste, nicht eine Zeile je Zeichen: die Liste
 *  wird immer als Ganzes ersetzt, und ein Datensatz macht „ersetzen" atomar. */
export async function schreibeMerkliste(eintraege: readonly MerkEintrag[]): Promise<void> {
  const db = await oeffne();
  if (!db) return;
  await new Promise<void>((fertig) => {
    try {
      const anfrage = db
        .transaction(SPEICHER, "readwrite")
        .objectStore(SPEICHER)
        .put(eintraege.map((e) => ({ id: e.id, titel: e.titel })), SCHLUESSEL);
      anfrage.onsuccess = () => fertig();
      anfrage.onerror = () => fertig();
    } catch {
      fertig();
    }
  });
  db.close();
}

export async function liesMerkliste(): Promise<readonly MerkEintrag[]> {
  const db = await oeffne();
  if (!db) return [];
  const eintraege = await new Promise<readonly MerkEintrag[]>((fertig) => {
    try {
      const anfrage = db.transaction(SPEICHER, "readonly").objectStore(SPEICHER).get(SCHLUESSEL);
      anfrage.onsuccess = () =>
        fertig(Array.isArray(anfrage.result) ? (anfrage.result as MerkEintrag[]) : []);
      anfrage.onerror = () => fertig([]);
    } catch {
      fertig([]);
    }
  });
  db.close();
  return eintraege;
}

/**
 * Der Loeschknopf: Geraetedatenbank UND HTTP-Cache, sofort und ohne
 * Rueckfrage-Dialog (Spec §7.5). Der Cache muss mit — sonst blieben die
 * gecachten Seiten liegen und der Knopf loeschte nur die Haelfte dessen, was er
 * verspricht.
 */
export async function loescheGeraetedaten(): Promise<void> {
  const f = fabrik();
  if (f) {
    await new Promise<void>((fertig) => {
      let anfrage: IDBOpenDBRequest;
      try {
        anfrage = f.deleteDatabase(MERKLISTE_DB);
      } catch {
        fertig();
        return;
      }
      anfrage.onsuccess = () => fertig();
      anfrage.onerror = () => fertig();
      anfrage.onblocked = () => fertig();
    });
  }
  if (typeof caches !== "undefined") {
    const namen = await caches.keys();
    await Promise.all(namen.map((n) => caches.delete(n)));
  }
}
```

- [ ] **Schritt 24: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/merkgeraet.test.ts`
Erwartet: PASS, fünf Tests.

---

- [ ] **Schritt 25: Anzeige und Spiegel schreiben**

`src/app/m/zeichen/_ui/MerklisteGeraet.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { liesMerkliste, loescheGeraetedaten, type MerkEintrag } from "../_lib/merkgeraet";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * Die Merkliste, wie sie auf DIESEM Geraet liegt — samt Hinweis und
 * Loeschknopf (Spec §7.5).
 *
 * ⛔ DER HINWEIS STEHT UNMITTELBAR BEI DER LISTE, nicht in einer Fusszeile. Er
 * ist kein Riegel, er ist eine Aussage: offline gibt es keine
 * Authentifizierung, und auf einem geteilten Geraet sieht die Titel auch, wer
 * sich nach dir anmeldet.
 *
 * ⛔ EIGENES `<button>` MIT `minHeight: 44` ALS LITERAL. Eigenes Markup erbt den
 * antd-Token nicht (Falle 5), und `--ant-*` ist ausserhalb von antds
 * Scope-Klasse unsichtbar (Falle 2, still). 44 ist die Untergrenze des Repos
 * (WCAG 2.5.5 AAA) und dieselbe Zahl, die `Arbeitsdichte` an die
 * antd-Bedienelemente dieser Flaeche legt.
 */
export function MerklisteGeraet() {
  const [eintraege, setEintraege] = useState<readonly MerkEintrag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [laeuft, starte] = useTransition();

  useEffect(() => {
    let lebt = true;
    liesMerkliste().then((liste) => {
      if (!lebt) return;
      setEintraege(liste);
      setGeladen(true);
    });
    return () => {
      lebt = false;
    };
  }, []);

  // Vor dem ersten Lesen gar nichts zeigen: eine leere Liste, die sich gleich
  // fuellt, sieht aus wie „nichts gemerkt" und ist eine Falschaussage.
  if (!geladen) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
      <h2 style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Deine Merkliste</h2>

      {eintraege.length === 0 ? (
        <p style={{ ...SCHRIFT.text, margin: 0 }}>
          Auf diesem Gerät liegt noch keine Merkliste. Öffne die Merkliste einmal mit Verbindung,
          dann ist sie danach auch ohne da.
        </p>
      ) : (
        <ul style={{ ...SCHRIFT.text, margin: 0, paddingInlineStart: SPACE.lg }}>
          {eintraege.map((e) => (
            <li key={e.id} style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
              {e.titel}
            </li>
          ))}
        </ul>
      )}

      <p style={{ ...SCHRIFT.neben, margin: 0 }}>
        Deine Merkliste ist auf diesem Gerät gespeichert, damit sie ohne Verbindung da ist. Auf
        einem geteilten Gerät sieht sie auch, wer sich nach dir anmeldet.
      </p>

      <button
        type="button"
        disabled={laeuft}
        onClick={() =>
          starte(async () => {
            await loescheGeraetedaten();
            setEintraege([]);
          })
        }
        style={{
          ...SCHRIFT.text,
          minHeight: 44,
          alignSelf: "flex-start",
          paddingInline: SPACE.md,
          border: "1px solid var(--iuk-linie)",
          borderRadius: 4,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        Von diesem Gerät löschen
      </button>
    </section>
  );
}
```

`src/app/m/zeichen/_ui/MerklisteSpiegel.tsx` (**Server** Component):

```tsx
import { eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { getDb } from "../_db/client";
import { merkliste } from "../_db/schema";
import { findeZeichen } from "../_lib/katalog";
import { MerklisteSpiegelInsel } from "./MerklisteSpiegelInsel";

/**
 * Schreibt die Merkliste bei JEDEM Online-Aufruf einer Shell-Seite auf das
 * Geraet (Spec §7.5). Rendert nichts.
 *
 * ⛔ SIE STEHT IM `(shell)`-LAYOUT UND NICHT AUF `/offline`: dort gibt es weder
 * Sitzung noch Datenbank, und ein `auth()`-Aufruf traege den Klarnamen ins
 * HTML — genau das, was der Inhaltsriegel des Workers ablehnt.
 *
 * Kosten: EIN indizierter SELECT je Shell-Seitenaufruf (Primaerschluessel
 * `(sub, zeichenId)`). Der Spiegel an eine einzelne Seite zu haengen waere
 * billiger und falsch: wer nur den Katalog benutzt und nie /merkliste oeffnet,
 * faehrt sonst mit einer veralteten Geraeteliste in den Einsatz.
 *
 * ANZEIGEQUELLE IST IMMER DAS GENERAT, der Schnappschuss ist der Rueckfall
 * (Spec §4.2) — sonst laufen zwei Fassungen desselben Titels bei jeder
 * Katalogkorrektur auseinander, und niemand weiss, welche stimmt.
 */
export async function MerklisteSpiegel() {
  const session = await auth();
  const sub = session?.user?.id;
  if (!sub) return null;

  const zeilen = getDb().select().from(merkliste).where(eq(merkliste.sub, sub)).all();
  const eintraege = zeilen.map((z) => ({
    id: z.zeichenId,
    titel: findeZeichen(z.zeichenId)?.titel ?? z.titelSchnappschuss,
  }));

  return <MerklisteSpiegelInsel eintraege={eintraege} />;
}
```

`src/app/m/zeichen/_ui/MerklisteSpiegelInsel.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { schreibeMerkliste, type MerkEintrag } from "../_lib/merkgeraet";

/**
 * Die duenne Client-Haelfte des Spiegels: sie schreibt und rendert nichts.
 *
 * Sie bekommt AUSSCHLIESSLICH serialisierbare Daten als Prop — kein
 * Datenbankobjekt, keine Funktion (Falle 9: eine Funktion ueber die
 * RSC-Grenze lehnt React ab, und `build` sieht das nicht).
 *
 * `JSON.stringify` in der Abhaengigkeitsliste, nicht das Array selbst: der
 * Server erzeugt bei jedem Rendern ein NEUES Array mit gleichem Inhalt, und
 * ohne diesen Vergleich schriebe der Effekt bei jeder Navigation erneut.
 */
export function MerklisteSpiegelInsel({ eintraege }: { eintraege: readonly MerkEintrag[] }) {
  const kennung = JSON.stringify(eintraege);
  useEffect(() => {
    void schreibeMerkliste(JSON.parse(kennung) as MerkEintrag[]);
  }, [kennung]);
  return null;
}
```

In `src/app/m/zeichen/(shell)/layout.tsx` (Aufgabe 5), innerhalb der `<Shell>`, vor `{children}`:

```tsx
import { MerklisteSpiegel } from "../_ui/MerklisteSpiegel";

// …
      <MerklisteSpiegel />
```

Kommando: `pnpm typecheck && pnpm vitest run src/app/m/zeichen`
Erwartet: `typecheck` grün (Exit-Code 0), Vitest PASS für alle Dateien des Moduls.

---

- [ ] **Schritt 26: Release-Notiz 4 schreiben und eintragen**

`src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-zeichen-ohne-netz.ts`:

```ts
// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Sichtbar ist diese Notiz für jeden, der die Kachel „Taktische Zeichen" sieht —
// das Modul steht hinter dem Login, ohne eigene Zugangsgruppe. Geschrieben also
// an alle, die die App benutzen, nicht an eine Verwaltung.
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "zeichen-ohne-netz",
  datum: "2026-09-02",
  titel: "Der Katalog steht auch ohne Verbindung bereit",
  inhalt: [
    absatz(
      "Ohne Verbindung kannst du jetzt alle Zeichen nachschlagen, durchsuchen und deine " +
        "Merkliste ansehen. Es öffnet sich dann eine schlanke Ansicht mit demselben Suchfeld " +
        "wie im Katalog. Oben steht, wie viele Zeichen gespeichert sind und von wann der " +
        "Stand ist.",
    ),
    absatz(
      "Ändern, Bauen und Üben brauchen weiterhin eine Verbindung. Merken und Entfernen, der " +
        "Baukasten und die Übungsrunden erscheinen ohne Netz deshalb gar nicht erst — ein " +
        "Knopf, der ins Leere läuft, kostet unterwegs nur Zeit.",
    ),
    absatz(
      "Das funktioniert erst, nachdem du den Katalog einmal mit Netz geöffnet hast: dabei legt " +
        "dein Gerät die Zeichen ab. Ein Gerät, das lange nicht online war, verlangt beim " +
        "nächsten Netzkontakt eine Anmeldung; der gespeicherte Katalog bleibt dabei erhalten.",
    ),
    absatz(
      "Deine Merkliste wird dafür auf dem Gerät gespeichert. Auf einem geteilten Tablet sieht " +
        "sie damit auch, wer sich nach dir anmeldet. In der Offline-Ansicht steht deshalb ein " +
        "Knopf „Von diesem Gerät löschen“, und beim Abmelden räumt die App von sich auf.",
    ),
    hinweis("Öffne den Katalog einmal mit Netz, bevor du losfährst."),
  ],
};

export default notiz;
```

In `src/app/m/portal/_lib/neuigkeiten/register.ts` — **zwei** Zeilen, sonst greift es nicht:

```ts
import zeichenOhneNetz from "@/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-zeichen-ohne-netz";
```

und in der `NOTIZEN`-Liste, nach den `zeichen`-Notizen der Aufgaben 6 bis 8:

```ts
  zeichenOhneNetz,
```

> `datum` ist der Tag des **Rollouts**, nicht des Commits. Verschiebt er sich, wandern Dateiname,
> `datum`-Feld und Registerzeile **gemeinsam** — `register.test.ts` liest das Verzeichnis und hält
> alle drei zusammen. Der eine `hinweis` ist ausgeschöpft; ein zweiter Satz mit einer Aufforderung
> hieße, es sind zwei Änderungen, also zwei Notizen (`register.test.ts:113-118`).

Kommando: `pnpm vitest run src/app/m/portal/_lib/neuigkeiten/register.test.ts`
Erwartet: PASS — die Notiz ist eingetragen, hat höchstens einen Hinweis, beginnt mit einem Absatz
und enthält kein Markdown.

---

- [ ] **Schritt 27: Alle Tore dieser Aufgabe fahren**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Erwartet: alle vier grün. Prüfe den **Exit-Code**, nicht die Meldung — RTKs tsc-Filter meldet
`TypeScript: No errors found`, wenn tsc seine pretty-Form ausgibt (`CLAUDE.md`, Abschnitt „Tests").
Besonders im Blick:
- `src/core/bootstrap.test.ts` — die `5` und die drei Klauseln um sie herum.
- `src/core/shell/icons.test.ts` — dieses Modul fasst `@ant-design/icons` nirgends an; wird der Test
  rot, liegt die Ursache in der Datei, die die Fehlermeldung nennt, nicht in `core/shell`.
- `src/app/m/portal/_lib/neuigkeiten/register.test.ts`.

> ⬜ **Was diese vier Tore NICHT sehen, und es steht hier statt verschwiegen zu werden** (Spec §8.4,
> Punkt 6): Der Offline-Datenschutz in Produktion. `pnpm e2e:pwa` läuft in **keiner CI**
> (`.github/workflows/ci.yml:148` fährt nur `pnpm e2e`). Der belastbare Teil sitzt im
> Vitest-Fake-Worker; der Browser-Beweis ist ein **Handlauf** und kommt in Aufgabe 10
> (`e2e/zeichen-pwa.spec.ts`, Eintrag in `playwright.pwa.config.ts` **und** `testIgnore` in
> `playwright.config.ts` — ohne beide läuft der Test entweder gar nicht oder im falschen Profil).
> Das ist eine **Schwäche des Entwurfs, keine Eigenschaft**, und sie wiegt seit der
> Merkliste-Entscheidung schwerer als zuvor.

- [ ] **Schritt 28: Commit**

```bash
git add src/app/m/zeichen/_lib/boot.ts src/app/m/zeichen/_lib/boot.test.ts \
        src/app/m/zeichen/_lib/sw-quelle.ts src/app/m/zeichen/_lib/sw-quelle.test.ts \
        src/app/m/zeichen/_lib/merkgeraet.ts src/app/m/zeichen/_lib/merkgeraet.test.ts \
        src/app/m/zeichen/_lib/offlineflaeche.test.ts \
        src/app/m/zeichen/sw.js/ src/app/m/zeichen/manifest.webmanifest/ \
        src/app/m/zeichen/pwa-icon.svg/ src/app/m/zeichen/pwa-routen.test.ts \
        src/app/m/zeichen/RegisterSW.tsx src/app/m/zeichen/layout.tsx \
        "src/app/m/zeichen/(rahmenlos)/" "src/app/m/zeichen/(shell)/layout.tsx" \
        src/app/m/zeichen/_ui/AbgemeldetStreifen.tsx \
        src/app/m/zeichen/_ui/MerklisteGeraet.tsx \
        src/app/m/zeichen/_ui/MerklisteSpiegel.tsx \
        src/app/m/zeichen/_ui/MerklisteSpiegelInsel.tsx \
        src/app/m/zeichen/_ui/KatalogInsel.tsx \
        src/core/bootstrap.ts src/core/bootstrap.test.ts \
        src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-zeichen-ohne-netz.ts \
        src/app/m/portal/_lib/neuigkeiten/register.ts
git commit -m "feat(zeichen): Offline — Service Worker, Manifest, rahmenlose Flaeche

Das erste Modul der Suite mit requiresAuth: true UND einer PWA. Es gibt kein
Vorbild, und der Grund steht in der Messung: eine auth-pflichtige Route
antwortet ohne Sitzung mit 307 -> /login, fetch FOLGT dem und liefert
ok: true, redirected: true — ein cache.put GELINGT dann, und im Cache laege
die Anmeldeseite unter dem Katalogschluessel. Der Waechter if (!res.ok) aus
qr faengt das nicht. Daher holeGeprueft(), und daher gilt der Redirect-Riegel
AUCH fuer Manifest und Icon.

start_url ist /offline, nicht / wie in beiden bestehenden Manifesten der
Suite: / ist hier die RSC-Startseite unter SuiteRahmen und liegt bewusst
nicht im Cache. Jede nicht gecachte Navigation faellt auf /offline zurueck.
Die Adresszeile steht dann auf /katalog, waehrend /offline gerendert wird —
sie luegt, und das ist der bewusst gewaehlte kleinere Schaden gegenueber
Chromiums Netzwerkfehlerseite mitten im Einsatz.

Der Boot-Riegel haengt an ZEICHEN_SW und nicht an NODE_ENV (Abweichung von
Spec 7.1, im Plan begruendet): eine unbedingte Pflicht braeche jeden
unbeteiligten Deploy im Fenster zwischen Merge und Cutover ab. bootstrap.test
steht damit auf fuenf Boot-Haken.

DIESER COMMIT GIBT EINE ZUSAGE AUF. Die Merkliste liegt ab jetzt in
IndexedDB auf dem Geraet (Betreiberentscheidung 2026-09-02). Offline gibt es
keine Authentifizierung: das Sitzungscookie ist HttpOnly und fuer Seite wie
Worker unsichtbar, und IndexedDB ueberlebt den Logout genauso wie der Cache.
Die Zusage 'auf dem Geraet liegt nichts Personenbezogenes' war mit einem
Unit-Test gegen den Worker-Quelltext haltbar; sie ist es jetzt nicht mehr.
An ihre Stelle treten drei Dinge, von denen nur das erste eine
Maschinenpruefung ist: der Inhaltsriegel gilt weiter fuer den HTTP-Cache
(dort landet kein HTML mit userName, der Test bleibt scharf); der
Logout-Haken auf POST /api/auth/signout loescht Cache UND IndexedDB und
deckt ausdruecklich NUR den geordneten Fall ab, nicht Ablauf, Widerruf,
Gruppenentzug oder ein weggelegtes Geraet; und der sichtbare Hinweis samt
Loeschknopf ist keine Sperre, sondern eine Aussage.

M-A ist gemessen: der /sw.js-Abruf von navigator.serviceWorker.register()
sendet das Sitzungscookie mit. Deshalb steht in core/routing.ts kein
Durchlass.

pnpm e2e:pwa laeuft in keiner CI. Der belastbare Teil sitzt im
Vitest-Fake-Worker, der Browser-Beweis kommt als Handlauf in Aufgabe 10."
```
---

## Aufgabe 10: End-to-End, PWA-Lauf und die zwei Handläufe vor dem Merge

Setzt Spec §8.3, §8.4, §9 (H1/H2) und §10 Commit 10 um.

**Dateien:**
- Neu: `e2e/helpers/zeichen.ts` (die eine Quelle für Host, Gruppe, Port, URLs, Warmlauf)
- Neu: `e2e/zeichen.spec.ts` (läuft im normalen Profil, `pnpm e2e`, **in der CI**)
- Neu: `e2e/zeichen-pwa.spec.ts` (läuft **nur** unter `playwright.pwa.config.ts`, **in keiner CI**)
- Ändern: `playwright.config.ts` (`testIgnore` **und** `...ZEICHEN_ENV` in `webServer.env`)
- Ändern: `playwright.pwa.config.ts` (`testMatch`, `ORIGINS`, `webServer.env`)
- **Keine** Release-Notiz: Tests und CI sind nach `CLAUDE.md` ausdrücklich notizfrei — eine Notiz
  über etwas, das niemand sehen kann, macht die Liste unglaubwürdig, nicht vollständig. Die vier
  Notizen dieses Moduls sind in den Aufgaben 6, 7, 8 und 9 geschrieben worden.

**Schnittstellen:**

- **Nutzt** (alles aus den Aufgaben 1 bis 9; wenn ein Haken hier fehlt, ist *dort* die Reparatur,
  nicht im Test):
  - Registry: Modulschlüssel `zeichen`, `requiresAuth: true`, `requiredGroups: []`,
    `adminGroups: ["iuk-zeichen-admin"]` (Aufgabe 1) → Dev-Host `zeichen.localtest.me`.
  - Demodaten aus `_lib/seedLokal.ts` und die Zeile
    `pnpm exec tsx scripts/seed-lokal.ts zeichen` in der `webServer`-Kette (Aufgabe 4).
  - Katalog-ID `rezept:C.1.1` aus der `ANKER`-Liste (`_lib/katalog.test.ts`, Aufgabe 2/4).
  - Routen aus Spec §2: `/`, `/katalog`, `/katalog/[id]`, `/merkliste`, `/baukasten`, `/meine`,
    `/lernen`, `/lernen/runde`, `/verwaltung/lernsets`, `/offline` (Aufgaben 5–9).
  - `_lib/boot.ts` mit `zeichenSwAn()`/`zeichenBootFehler()` und `RegisterSW` (Aufgabe 9),
    Cache-Name `zeichen-pwa-v1`, IndexedDB-Name `zeichen-merkliste`, Schalter `ZEICHEN_SW`.
  - **Diese Oberflächen-Haken sind der Vertrag mit den Aufgaben 5–9.** Sie stehen namentlich hier,
    weil ein e2e-Test die einzige Stelle ist, an der sie zusammenkommen:

    | Haken | Wo | Aufgabe |
    |---|---|---|
    | `<label>` „Zeichen suchen" am Suchfeld der `KatalogInsel` | `/katalog`, `/offline` | 6 |
    | `data-testid="zeichen-treffer"` (Container) | `/katalog`, `/offline` | 6 |
    | `data-testid="zeichen-treffer-eintrag"` je Treffer, online mit `<a href="/katalog/<id>">` | `/katalog`, `/offline` | 6 |
    | `data-testid="zeichen-detail"`, enthält das serverseitig gerenderte `<svg>` | `/katalog/[id]` | 6 |
    | Knopf „Merken" / „Nicht mehr merken" (Server Action) | `/katalog/[id]` | 6 |
    | `data-testid="zeichen-merkliste"` (Container) | `/merkliste` | 6 |
    | `data-testid="baukasten-insel"` · `data-testid="baukasten-art-formation"` · `data-testid="baukasten-vorschau"` · Knopf „Als SVG herunterladen" | `/baukasten` | 7 |
    | `data-testid="zeichen-vorbehalt"` (der Kasten aus §5.6) · Link „Runde starten" | `/lernen` | 8 |
    | `data-testid="quiz-frage"` · `data-testid="quiz-option"` (4×) · `data-testid="quiz-aufloesung"` | `/lernen/runde` | 8 |
    | `<h1>Lernsets</h1>` | `/verwaltung/lernsets` | 8 |
    | `data-testid="zeichen-offline"` · `data-testid="zeichen-offline-stand"` · Knopf „Von diesem Gerät löschen" | `/offline` | 9 |
  - Aus dem Repo: `devLogin` · `klickeWennRuhig` · `wechsleAnmeldung` (`e2e/fixtures.ts`).
- **Liefert:**
  - `e2e/helpers/zeichen.ts` mit `ZEICHEN_HOST` · `FREMDER_HOST` · `ZEICHEN_PORT` ·
    `ZEICHEN_ADMIN_GRUPPE` · `ZEICHEN_ENV` · `ANKER_ID` · `MODULROUTEN` · `zeichenUrl()` ·
    `fremdUrl()` · `warmeZeichenRouten()`.
  - `e2e/zeichen.spec.ts` mit acht Fällen, darunter der einzige Nachweis gegen einen RSC-Bruch.
  - `e2e/zeichen-pwa.spec.ts` mit fünf Fällen, eingetragen in **beide** Konfigurationen.
  - Zwei abgelesene Handläufe (H1, H2), deren Ergebnis in den Commit-Text gehört.

---

### Der wichtigste einzelne Fall dieser Aufgabe

**Ein Abruf von `/m/zeichen/katalog/[id]` mit `expect(html).toContain("<svg")`.**

Das ist das **einzige** Tor der Suite, das einen RSC-Bruch nach einem Paketupgrade sieht.
`typecheck` und `lint` prüfen Typen und Regeln, `vitest` startet keinen Server, und **Vitest kann
diese Klasse strukturell nicht sehen**: dort ist `"use client"` ein wirkungsloser String, es gibt
gar keine RSC-Grenze, und `react` lädt über die `default`-Bedingung statt über
`exports["."].node.import` — genau der Unterschied, an dem Falle 7 hängt. `pnpm build` sieht einen
Teil davon, aber erst spät und nicht die Serialisierung eines echten Requests (Falle 9).

Die Detailseite ist die schärfste Probe, die das Modul hat: sie ist eine **reine Server Component**,
sie zieht das SVG aus dem eingecheckten Generat und rendert es mit `dangerouslySetInnerHTML`. Bricht
irgendwo im Modul die RSC-Grenze — ein Paketimport im Server-Graph (M1), ein `@ant-design/icons`
irgendwo in der Kette (Falle 7), ein Wert aus einem `"use client"`-Modul (Falle 6) —, dann antwortet
genau diese Route mit HTTP 500 statt mit `<svg`.

---

- [ ] **Schritt 1: `e2e/helpers/zeichen.ts` schreiben**

Bauform 1:1 aus `e2e/helpers/uav.ts` und `e2e/helpers/radio.ts`.

```ts
import type { APIRequestContext } from "@playwright/test";

/**
 * DIE EINE QUELLE fuer Host, Admin-Gruppe, Port, Anker-ID und Warmlauf der
 * `zeichen`-e2e-Faelle (Aufgabe 10; Bauform 1:1 aus `e2e/helpers/uav.ts`).
 *
 * ⚠️ WARUM NICHT ALS LITERALE. Stuende ein Wert einmal in `playwright.config.ts`s
 * `webServer.env` und einmal im Spec, waeren es ZWEI Literale — und der Fehlerfall
 * ist nicht laut, sondern GEGENTEILIG: mit falscher `SUITE_ADMIN_GROUP_ZEICHEN`
 * bezeugte der Lauf den Riegel-404 und saehe dabei aus wie ein bestandener Test.
 * Derselbe Absatz steht fuer `radio` in `e2e/helpers/radio.ts:1-13`.
 *
 * ⛔ KEIN IMPORT AUS `src/`: e2e-Helfer und Modulcode laufen in verschiedenen
 * Prozessen mit verschiedenen `DATA_DIR`-Sichten, und ein Import zoege das ganze
 * Modul in den Testprozess.
 */

/** Der Modul-Host. Wildcard-DNS loest jeden `*.localtest.me` auf 127.0.0.1 auf. */
export const ZEICHEN_HOST = "zeichen.localtest.me";

/**
 * Der ZWEITE erreichbare Suite-Host. ⚠️ ER EXISTIERT BEREITS: `playwright.config.ts`
 * wartet heute schon auf `http://feedback.localtest.me:3100/login`. Es wird KEIN
 * dritter Host eingefuehrt.
 */
export const FREMDER_HOST = "feedback.localtest.me";

/** Derselbe Port wie in `playwright.config.ts` (`next dev -p 3100`). */
export const ZEICHEN_PORT = 3100;

/**
 * Die Gruppe, die die kuratierten Lernsets pflegen darf. Registry-Vorgabe aus
 * Aufgabe 1 (`adminGroups: ["iuk-zeichen-admin"]`), gelesen ueber `isModuleAdmin`
 * in `moduleAdminPageOrNotFound`/`canAdminModule`.
 *
 * ⚠️ SIE STEHT ZUSAETZLICH IN `webServer.env` (`SUITE_ADMIN_GROUP_ZEICHEN`), genau
 * wert-gleich mit dieser Konstanten: `next dev` laeuft im Repo-Wurzelverzeichnis und
 * liest `.env.local` mit — ein dort eingetragener produktiver Gruppenname
 * verschoebe den E2E-Server sonst still auf einen anderen Wert.
 */
export const ZEICHEN_ADMIN_GRUPPE = "iuk-zeichen-admin";

/**
 * Die eine Zeile fuer `webServer.env`.
 *
 * ⚠️ `SUITE_HOST_ZEICHEN` steht bewusst NICHT darunter: `moduleForHost` trifft
 * `zeichen.localtest.me` VOR und UNABHAENGIG von `prodHostsFor`
 * (`src/core/registry.ts:257-261`), der Dev-Lauf braucht die Variable also nicht.
 *
 * ⛔ `ZEICHEN_SW` steht ebenfalls NICHT darunter, und das ist eine Entscheidung:
 * `http://zeichen.localtest.me:3100` ist KEIN sicherer Kontext (kein TLS, keine
 * Chrome-Flags in diesem Profil). Mit gesetztem Schalter registrierte `RegisterSW`
 * dort einen Worker, der nie ankommt — eine stille Konsolenzeile, die nichts
 * beweist und nichts widerlegt. Die PWA wird ausschliesslich in
 * `playwright.pwa.config.ts` gemessen (Port 3101, voller Chromium-Kanal,
 * `--unsafely-treat-insecure-origin-as-secure`).
 */
export const ZEICHEN_ENV: Record<string, string> = {
  SUITE_ADMIN_GROUP_ZEICHEN: ZEICHEN_ADMIN_GRUPPE,
};

/**
 * DIE ID, AUF DIE DIESE DATEI SICH STUETZT — sie steht in der `ANKER`-Liste von
 * `src/app/m/zeichen/_lib/katalog.test.ts` und im lokalen Seed (Aufgabe 4).
 *
 * ⛔ Wer sie hier aendert, aendert sie DORT mit. Faellt die ID bei einem
 * Paketupgrade weg, wird `katalog.test.ts` rot — das ist die laute Stelle; dieser
 * Test faende danach nur noch einen 404 und klaenge nach einem kaputten Router.
 */
export const ANKER_ID = "rezept:C.1.1";

/**
 * Die Routen aus Spec §2, die eine EIGENE Server-Auswertung haben. `/lernen/runde`
 * fehlt bewusst: die Route kann ohne faellige Karte auf `/lernen` zurueckleiten,
 * und ein Statusvergleich waere dann eine Wette auf den Lernstand.
 */
export const MODULROUTEN = [
  "/",
  "/katalog",
  "/merkliste",
  "/baukasten",
  "/meine",
  "/lernen",
  "/verwaltung/lernsets",
  "/offline",
] as const;

/**
 * Absolute Per-Host-URL: `baseURL` zeigt auf den PORTAL-Host
 * (`playwright.config.ts`), und `portal` traegt `requiresAuth: true` — jeder
 * RELATIVE Aufruf landete dort im Login.
 */
export function zeichenUrl(pfad: string): string {
  return `http://${ZEICHEN_HOST}:${ZEICHEN_PORT}${pfad}`;
}

/** Dieselbe URL auf dem FREMDEN Suite-Host. */
export function fremdUrl(pfad: string): string {
  return `http://${FREMDER_HOST}:${ZEICHEN_PORT}${pfad}`;
}

/**
 * CLAUDE.md Falle 10: `next dev` uebersetzt eine Route erst beim ERSTEN Treffer.
 * Landet der eigentliche POST einer Server Action in genau diesem Fenster, loest
 * der HMR-Kanal einen vollen Reload aus, der Browser bricht die laufende Anfrage
 * mit ab (`net::ERR_ABORTED`, `canceled: true`), und es kommt NIE eine Antwort —
 * keine Datenbankzeile, keine Protokollzeile, ein Test, der in sein Zeitbudget
 * laeuft und dabei nach etwas ganz anderem klingt.
 *
 * ⛔ DER WARMLAUF MUSS ANGEMELDET LAUFEN, und das ist der Unterschied zu
 * `warmeUavRouten`: `zeichen` traegt `requiresAuth: true`. Ein anonymer GET
 * beantwortet der Proxy mit `307 -> /login` — er uebersetzt die Modulroute damit
 * gerade NICHT und der Warmlauf waere ein wirkungsloses Ritual. Deshalb bekommt
 * diese Funktion `page.request` NACH `devLogin` und nicht den `request`-Fixture
 * aus einem `beforeAll` (der traegt keine Cookies).
 *
 * Statuscodes sind hier bedeutungslos; tragend ist allein die einmalige Kompilation.
 */
export async function warmeZeichenRouten(request: APIRequestContext): Promise<void> {
  for (const pfad of MODULROUTEN) {
    await request.get(zeichenUrl(pfad)).catch(() => {});
  }
  await request.get(zeichenUrl(`/katalog/${encodeURIComponent(ANKER_ID)}`)).catch(() => {});
  await request.get(zeichenUrl("/lernen/runde")).catch(() => {});
}
```

- [ ] **Schritt 2: `e2e/zeichen.spec.ts` schreiben**

```ts
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig, wechsleAnmeldung } from "./fixtures";
import {
  ANKER_ID,
  MODULROUTEN,
  ZEICHEN_ADMIN_GRUPPE,
  ZEICHEN_HOST,
  fremdUrl,
  warmeZeichenRouten,
  zeichenUrl,
} from "./helpers/zeichen";

/**
 * DIE E2E-FAELLE DES MODULS `zeichen` (Spec §8.3).
 *
 * ⛔ SIE SIND PFLICHTBESTANDTEIL, NICHT NACHBESSERUNG. Vier Klassen von Fehlern
 * dieses Moduls sind AUSSCHLIESSLICH hier sichtbar (Spec §8.4):
 *   1. ein RSC-Bruch nach einem Paketupgrade (M1, Falle 6, Falle 7, Falle 9) —
 *      Vitest kann ihn strukturell nicht sehen, dort gibt es keine RSC-Grenze;
 *   2. dass die Detailseite ihr SVG wirklich SERVERSEITIG rendert;
 *   3. dass der 404-Riegel der Lernset-Verwaltung die RECHTESTUFE misst und nicht
 *      eine kaputte Route;
 *   4. dass die Offline-Flaeche keinen Klarnamen traegt — die Zusage, auf der der
 *      Inhaltsriegel des Service Workers ueberhaupt erst beruht (Spec §7.3).
 *
 * ⛔ JEDER AUFRUF GEHT UEBER `zeichenUrl(...)`, NIE RELATIV: `playwright.config.ts`
 * fuehrt genau EINEN `baseURL`, und der zeigt auf `http://portal.localtest.me:3100`.
 * Ein relativer Aufruf landete dort — und `portal` traegt `requiresAuth: true`,
 * also im Login.
 *
 * ⛔ VIER REGELN DIESES REPOS GELTEN IN JEDEM FALL DIESER DATEI:
 *   * jeder NAVIGIERENDE Klick ueber `klickeWennRuhig` (Falle 12);
 *   * Warmlauf-GET vor dem ersten POST, und `page.waitForResponse` statt Warten
 *     auf eine spaetere Zustandsaenderung (Falle 10);
 *   * kein `locator.dragTo()` (Falle 11);
 *   * Rollenwechsel ueber `wechsleAnmeldung`, nie blankes `clearCookies()`.
 */

/**
 * ⚠️ WIEDERHOLUNGSFEST GESCHRIEBEN. `retries: 2` in der CI faehrt denselben Fall
 * gegen DENSELBEN Dev-Server und DIESELBE Datenbank — nach Versuch 1 steht die
 * Merkzeile schon, und der Knopf heisst dann „Nicht mehr merken". Erst
 * zuruecksetzen, dann messen; sonst ist Versuch 2 rot aus einem Grund, den der
 * Testname nicht nennt.
 */
async function merkeSicher(page: Page, id: string): Promise<void> {
  await page.goto(zeichenUrl(`/katalog/${encodeURIComponent(id)}`));

  const entfernen = page.getByRole("button", { name: "Nicht mehr merken" });
  if ((await entfernen.count()) > 0) {
    const weg = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/katalog/"),
    );
    await entfernen.click();
    expect((await weg).status(), "das Entfernen aus der Merkliste wurde abgelehnt").toBe(200);
  }

  const merken = page.getByRole("button", { name: "Merken", exact: true });
  await expect(merken).toBeVisible();
  /*
   * DIE ANTWORT WIRD GEPRUEFT, NICHT DIE SPAETERE ZUSTANDSAENDERUNG (Falle 10,
   * zweite Testregel). Ohne `waitForResponse` liefe jede abgelehnte Antwort
   * (404, 405, 413, abgebrochen) still ins Zeitbudget und meldete sich als etwas
   * anderes — hier als „die Merkliste ist leer".
   */
  const antwort = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/katalog/"),
  );
  await merken.click();
  const res = await antwort;
  expect(res.status(), await res.text()).toBe(200);
}

test("die Detailseite liefert das SVG aus dem Server — das einzige Tor gegen einen RSC-Bruch", async ({
  page,
}) => {
  /*
   * ⛔ DER WICHTIGSTE EINZELNE FALL DES GANZEN MODULS (Spec §8.3, §8.4 Punkt 1).
   *
   * `/m/zeichen/katalog/[id]` ist eine REINE Server Component: `svgFuer(id)` ->
   * String -> `dangerouslySetInnerHTML`. Bricht irgendwo im Modul die RSC-Grenze —
   * ein `@einsatzzeichen/*`-Import im Server-Graph (M1), ein `@ant-design/icons`
   * in der Kette (Falle 7), ein Wert aus einem `"use client"`-Modul (Falle 6),
   * eine Funktion ueber die Grenze (Falle 9) —, dann antwortet GENAU DIESE Route
   * mit 500 statt mit `<svg`.
   *
   * ⛔ KEIN ANDERES TOR SIEHT DAS: `typecheck` und `lint` pruefen Typen und Regeln;
   * `pnpm vitest run` kann es STRUKTURELL nicht sehen (dort ist `"use client"` ein
   * wirkungsloser String, es gibt keine RSC-Grenze, und `react` laedt ueber die
   * `default`-Bedingung statt ueber `exports["."].node.import`); `pnpm build`
   * prueft Modulgrenzen statisch, nicht die Serialisierung eines Requests. Nur ein
   * echter Abruf zeigt den 500.
   *
   * Die INNERE Pfadform ist Absicht: `decideRoute` gatet den Direktzugriff auf
   * `/m/<key>/…` nach dem Segment und laesst ihn fuer eine angemeldete Person
   * durch (`src/core/routing.ts`, Zweig `internal`). Damit misst dieser Fall die
   * Seite und nicht den Rewrite.
   */
  await devLogin(page, { host: ZEICHEN_HOST });

  const antwort = await page.request.get(
    zeichenUrl(`/m/zeichen/katalog/${encodeURIComponent(ANKER_ID)}`),
  );
  expect(antwort.status(), await antwort.text()).toBe(200);

  const html = await antwort.text();
  expect(html, "die Detailseite rendert kein SVG — RSC-Bruch oder leeres Generat").toContain(
    "<svg",
  );
  // Positiver Nachweis, dass hier wirklich die Detailseite steht: ohne ihn bliebe
  // die Zusicherung oben auch ueber einer beliebigen anderen Seite mit einem
  // Icon-SVG gruen (dieselbe Lehre wie `qr-login-hint` in `pwa-spike.spec.ts`).
  expect(html).toContain('data-testid="zeichen-detail"');
  // Und dass wir nicht im Login gelandet sind — der 307 auf /login antwortet mit
  // 200 (HTML), der Statusvergleich oben allein sagt darueber nichts.
  expect(html).not.toContain("Dev-Login");
});

test("jede Modulroute antwortet 200 und traegt keine Fehlerseite", async ({ page }) => {
  /*
   * Die Breitenprobe zum Fall darueber: acht Routen, ein Abruf je Route. Sie
   * findet dieselbe Klasse (RSC-Bruch) an jeder anderen Flaeche des Moduls, und
   * sie kostet fast nichts — die Erstuebersetzung faellt ohnehin an.
   *
   * `test.setTimeout` hoch, und das ist keine Schikane: unter `next dev` mit
   * kaltem `.next` uebersetzt der Server jede dieser acht Routen beim ERSTEN
   * Treffer, samt antd und der Baukasten-Insel. Die 90 s der Konfiguration sind
   * fuer EINEN Test bemessen, nicht fuer acht Erstuebersetzungen.
   */
  test.setTimeout(300_000);

  await devLogin(page, { host: ZEICHEN_HOST, groups: ZEICHEN_ADMIN_GRUPPE });

  for (const pfad of MODULROUTEN) {
    const antwort = await page.request.get(zeichenUrl(pfad));
    expect(antwort.status(), `${pfad}: ${(await antwort.text()).slice(0, 400)}`).toBe(200);
    const html = await antwort.text();
    expect(html, `${pfad} zeigt Nexts Fehlerflaeche`).not.toContain("Application error");
    expect(html, `${pfad} ist im Login gelandet`).not.toContain("Dev-Login");
  }
});

test("die Offline-Flaeche traegt keinen Klarnamen — mit Positivkontrolle", async ({ page }) => {
  /*
   * ⛔ DIESE ZUSAGE TRAEGT DEN GANZEN OFFLINE-ENTWURF (Spec §7.3, M17.3): der
   * Service Worker cacht `/offline` und lehnt jedes HTML mit `"userName"` ab.
   * Waere `/offline` unter `SuiteRahmen` gebaut, stuende der Klarname im
   * Flight-Payload, der Inhaltsriegel griffe zu Recht — und die PWA cachte
   * schlicht NICHTS, ohne Fehlermeldung.
   *
   * ⚠️ DIESER FALL LAEUFT IN DER CI, der PWA-Lauf nicht. Er deckt die INHALTLICHE
   * Haelfte der Zusage ab; dass der Worker sie auch anwendet, misst
   * `_lib/sw-quelle.test.ts` (Aufgabe 9) und der Handlauf `pnpm e2e:pwa`.
   */
  await devLogin(page, { host: ZEICHEN_HOST });

  const offline = await page.request.get(zeichenUrl("/offline"));
  expect(offline.status()).toBe(200);
  const offlineHtml = await offline.text();
  expect(offlineHtml, "die Offline-Flaeche traegt den Klarnamen im Flight-Payload").not.toContain(
    "userName",
  );
  expect(offlineHtml).not.toContain("dev@localtest.me");
  // Positiver Nachweis, dass die Flaeche ueberhaupt gerendert hat.
  expect(offlineHtml).toContain('data-testid="zeichen-offline"');

  /*
   * POSITIVKONTROLLE, und ohne sie bewiese die Zusicherung oben nur, dass
   * irgendein String irgendwo fehlt: dieselbe Sitzung, eine Seite UNTER der
   * Huelle — dort MUSS `userName` stehen. Verschwaende die Zeichenkette eines
   * Tages aus dem Payload (anderer Prop-Name in `SuiteNav`), waere der Test oben
   * leer-gruen, und diese Zeile wird dann laut.
   */
  const mitHuelle = await page.request.get(zeichenUrl("/katalog"));
  expect(
    await mitHuelle.text(),
    "die Huelle traegt kein `userName` mehr — die Zusicherung oben misst nichts",
  ).toContain("userName");
});

test("Katalog: suchen, Treffer oeffnen, Zeichen sehen", async ({ page }) => {
  await devLogin(page, { host: ZEICHEN_HOST, callbackPath: "/katalog" });

  /*
   * „loeschgruppe" OHNE Umlaut, und das ist der Punkt: gemessen findet reine
   * Kleinschreibung 0 von 232 (Spec §3.3). Dieser eine Anschlag prueft die
   * Faltung `falte()` end-to-end — Generat, Naht und Insel auf einem Codepfad.
   * Auf einem Tablet mit Handschuhen ist genau das der Normalfall.
   */
  await page.getByLabel("Zeichen suchen").fill("loeschgruppe");

  const treffer = page.getByTestId("zeichen-treffer-eintrag");
  await expect(treffer.first()).toBeVisible();

  const ziel = treffer.first().getByRole("link");
  const href = await ziel.getAttribute("href");
  expect(href, "die Trefferkachel ist kein Link auf die Detailseite").toContain("/katalog/");

  /*
   * ⛔ `klickeWennRuhig` UND NICHT `.click()` — gemessener Anlass auf `main`
   * (Lauf 31951787232): Playwright meldete den Klick als gelungen, der Knoten war
   * ein echter `<a href>`, er trug danach sogar den Fokus, und im Netzwerkteil
   * stand fuer das Ziel KEIN einziger Aufruf. Die Huelle war zwischen `mousedown`
   * und `mouseup` um ~240 px gesprungen (`SessionProvider` holt
   * `/api/auth/session` nach), das `click`-Ereignis feuerte auf dem gemeinsamen
   * `<div>`-Vorfahren, und ein `<div>` navigiert nicht. Kein groesseres
   * Zeitbudget und keine Wiederholung heilt das.
   */
  await klickeWennRuhig(ziel);
  await page.waitForURL(/\/katalog\/.+/);

  await expect(page.getByTestId("zeichen-detail").locator("svg").first()).toBeVisible();
});

test("merken: die Server Action antwortet, und die Merkliste zeigt die Zeile", async ({ page }) => {
  await devLogin(page, { host: ZEICHEN_HOST });
  // Falle 10: der Warmlauf-GET uebersetzt die Routen, BEVOR der erste echte POST
  // faellt. Angemeldet, sonst uebersetzt er nur den Login-Redirect.
  await warmeZeichenRouten(page.request);

  await merkeSicher(page, ANKER_ID);

  await page.goto(zeichenUrl("/merkliste"));
  const zeile = page.getByTestId("zeichen-merkliste").locator(`a[href*="${encodeURIComponent(ANKER_ID)}"]`);
  await expect(zeile).toHaveCount(1);

  // Gegenprobe im selben Fall: der Weg zurueck raeumt auch wieder auf. Ohne sie
  // bliebe eine Merkliste, die nur waechst, unbemerkt.
  await klickeWennRuhig(zeile.first());
  await page.waitForURL(/\/katalog\/.+/);
  const weg = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/katalog/"),
  );
  await page.getByRole("button", { name: "Nicht mehr merken" }).click();
  expect((await weg).status(), await (await weg).text()).toBe(200);

  await page.goto(zeichenUrl("/merkliste"));
  await expect(page.getByTestId("zeichen-merkliste").locator(`a[href*="${encodeURIComponent(ANKER_ID)}"]`)).toHaveCount(
    0,
  );
});

test("Baukasten: ein Zeichen bauen und als SVG herunterladen", async ({ page }) => {
  /*
   * Die Baukasten-Insel laedt ueber `dynamic(..., { ssr: false })` (Spec §3.4) —
   * ihr Chunk wird unter `next dev` beim ersten Treffer uebersetzt und traegt den
   * Katalog-Code (gemessen 133 KB gzip). Das passt nicht in die 90 s der
   * Konfiguration, wenn `.next` kalt ist.
   */
  test.setTimeout(240_000);

  await devLogin(page, { host: ZEICHEN_HOST, callbackPath: "/baukasten" });

  const insel = page.getByTestId("baukasten-insel");
  await expect(insel).toBeVisible({ timeout: 120_000 });

  /*
   * Schritt 1 der erzwungenen Schrittfolge (Spec §6.1): die Grundzeichenart
   * entscheidet, welche Achsen ueberhaupt existieren. `formation` ist die Art, die
   * nackt komponiert — `circle-12` und `reduced-house` bekommen einen Platzhalter
   * und lieferten hier kein Bild.
   *
   * ⛔ KEIN `locator.dragTo()` (Falle 11) — im ganzen Modul wird nichts gezogen.
   * Der gemessene Anlass steht in `CLAUDE.md`: ein Zug lief reproduzierbar in den
   * vollen 90-Sekunden-Timeout, ohne dass je ein `drop` feuerte.
   */
  await insel.getByTestId("baukasten-art-formation").click();
  await expect(page.getByTestId("baukasten-vorschau").locator("svg")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Als SVG herunterladen" }).click();
  const datei = await download;

  expect(datei.suggestedFilename()).toMatch(/\.svg$/);
  const pfad = await datei.path();
  const inhalt = await readFile(pfad, "utf8");
  /*
   * Auf den INHALT pruefen, nicht nur auf das Ereignis: ein `<a download>` mit
   * leerem Blob loeste dasselbe Ereignis aus, und die Zusage „du bekommst dein
   * Zeichen" waere leer-gruen.
   */
  expect(inhalt.startsWith("<svg"), inhalt.slice(0, 120)).toBe(true);
  expect(inhalt).toContain("</svg>");
});

test("Lernen: eine Runde, eine Antwort, und der Server hat sie angenommen", async ({ page }) => {
  await devLogin(page, { host: ZEICHEN_HOST });
  await warmeZeichenRouten(page.request);

  await page.goto(zeichenUrl("/lernen"));

  /*
   * Der fachliche Vorbehalt steht UEBER dem ersten Startknopf (Spec §5.6): gemessen
   * ist `review.domain.status` bei 544 von 544 Zeilen `pending`. Dass der Kasten
   * dasteht, ist keine Option — nur sein Wortlaut ist Betreibersache. Deshalb
   * steht er hier als Zusicherung und nicht als Kommentar.
   */
  await expect(page.getByTestId("zeichen-vorbehalt")).toBeVisible();

  await klickeWennRuhig(page.getByRole("link", { name: "Runde starten" }));
  await page.waitForURL(/\/lernen\/runde/);

  await expect(page.getByTestId("quiz-frage")).toBeVisible();
  const optionen = page.getByTestId("quiz-option");
  await expect(optionen).toHaveCount(4);

  /*
   * Der Stand wird nach JEDER einzelnen Antwort serverseitig geschrieben (Spec
   * §5.4), nicht am Rundenende. Also gibt es hier eine Antwort zu pruefen — und
   * genau die wird geprueft, nicht eine spaetere Zahl auf `/lernen`.
   */
  const antwort = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/lernen/runde"),
  );
  await optionen.first().click();
  const res = await antwort;
  expect(res.status(), await res.text()).toBe(200);

  /*
   * Wort zuerst, Zeichen zweitens, Farbe zuletzt (Spec §5.5, Falle 3:
   * `colorError === colorPrimary === #c8000f`). Der Test liest deshalb das WORT —
   * eine Farbzusicherung waere hier die falsche Probe und in jsdom ohnehin keine.
   */
  await expect(page.getByTestId("quiz-aufloesung")).toHaveText(/Richtig|Nicht ganz/);
});

test("Lernsets: die Verwaltung gehoert der Admin-Gruppe — und nur ihr", async ({ page }) => {
  await devLogin(page, {
    host: ZEICHEN_HOST,
    groups: ZEICHEN_ADMIN_GRUPPE,
    callbackPath: "/verwaltung/lernsets",
  });
  await expect(page.getByRole("heading", { level: 1, name: "Lernsets" })).toBeVisible();

  const alsAdmin = await page.request.get(zeichenUrl("/verwaltung/lernsets"));
  expect(alsAdmin.status()).toBe(200);

  /*
   * ⛔ ROLLENWECHSEL UEBER `wechsleAnmeldung`, NIE BLANKES `clearCookies()`.
   * Gemessen auf `main` (Lauf 33173490683): eine noch laufende
   * `/api/auth/session`-Antwort setzte den Sitzungscookie Millisekunden NACH dem
   * Leeren neu, `/login` leitete die bestehende Sitzung sofort weiter, und der
   * Fehlschlag kam 80 Sekunden spaeter als „waiting for getByLabel('email')" —
   * eine Meldung, die nach einem kaputten Anmeldeformular klingt und keins meint.
   * `wechsleAnmeldung` geht vorher auf `about:blank` und prueft den leeren Krug.
   */
  await wechsleAnmeldung(page, { host: ZEICHEN_HOST, groups: "" });

  const ohneGruppe = await page.request.get(zeichenUrl("/verwaltung/lernsets"));
  expect(
    ohneGruppe.status(),
    "ohne Admin-Gruppe muss die Lernset-Verwaltung 404 antworten (moduleAdminPageOrNotFound)",
  ).toBe(404);

  /*
   * ⛔ DIE GEGENPROBE TRAEGT DEN FALL: ohne sie waere der 404 oben auch dann
   * gruen, wenn die Route gar nicht existiert oder das ganze Modul den Zugang
   * verweigert. Erst „mit Gruppe 200, ohne Gruppe 404, auf DERSELBEN Adresse,
   * und der Katalog bleibt beiden offen" benennt die STUFE statt der Huelle.
   * Dieselbe Lehre wie „V-L3 D" in `e2e/radio-verwaltung.spec.ts`.
   */
  expect(
    (await page.request.get(zeichenUrl("/katalog"))).status(),
    "das Modul selbst ist zu — der 404 oben misst dann nicht die Admin-Stufe",
  ).toBe(200);

  // Und der Navigationseintrag verschwindet mit dem Recht: `_lib/nav.ts` zeigt
  // „Lernsets" nur bei `canAdminModule("zeichen")` — DASSELBE Praedikat, das die
  // Route gatet. Ein sichtbarer Link auf einen 404 waere eine Sackgasse.
  await page.goto(zeichenUrl("/katalog"));
  await expect(page.getByRole("link", { name: "Lernsets" })).toHaveCount(0);
});

test("die Lernset-Verwaltung antwortet auf einem fremden Suite-Host mit 404", async ({ page }) => {
  /*
   * Der Direktzugriff auf die INNERE Pfadform von einem anderen Suite-Host —
   * `decideRoute`s `internal`-Zweig gatet nach dem Segment, nicht nach dem Host,
   * die Admin-Stufe muss also auch von dort greifen. `feedback.localtest.me`
   * existiert bereits (`playwright.config.ts` wartet auf dessen `/login`) und ist
   * die schaerfere Probe als ein erfundener Host, weil `moduleForHost` dort
   * tatsaechlich ein Modul liefert.
   */
  await devLogin(page, { host: ZEICHEN_HOST, groups: "" });
  const antwort = await page.request.get(fremdUrl("/m/zeichen/verwaltung/lernsets"));
  expect(antwort.status()).toBe(404);
});
```

- [ ] **Schritt 3: `playwright.config.ts` ergänzen — beide Stellen**

Erstens der `testIgnore` (heute `/pwa-spike\.spec\.ts/`):

```ts
  // Der PWA-Spike braucht Chrome-Flags für den sicheren Kontext und läuft
  // deshalb in playwright.pwa.config.ts (eigener Port). `zeichen-pwa` gehört seit
  // Aufgabe 10 dazu: ohne diesen Eintrag liefe die Datei im DEV-Profil auf Port
  // 3100, wo `navigator.serviceWorker` gar nicht existiert (kein sicherer
  // Kontext) — die Fälle scheiterten dann an einer Meldung über `undefined`
  // statt an ihrer Zusage.
  testIgnore: /(pwa-spike|zeichen-pwa)\.spec\.ts/,
```

Zweitens die Gruppenzeile in `webServer.env`, hinter `...UAV_ENV`:

```ts
        /*
         * Die zeichen-Zeile (`SUITE_ADMIN_GROUP_ZEICHEN`), aus derselben Quelle wie
         * `devLogin(…, { groups })` in `e2e/zeichen.spec.ts` (`e2e/helpers/zeichen.ts`) —
         * dieselbe Bauform wie `...UAV_ENV` darüber, und aus demselben Grund: ohne
         * Eintrag griffe der Registry-Vorgabewert, es sei denn, `.env.local` setzt
         * etwas anderes. Der Lauf wäre dann nicht rot, sondern GEGENTEILIG grün — die
         * Admin-Fälle bezeugten den Riegel-404, den die Gegenprobe ohnehin behauptet.
         *
         * ⚠️ `SUITE_ACCESS_GROUP_ZEICHEN` steht bewusst NICHT daneben: eine leer
         * gesetzte Zugangsgruppe meldet `validateGroupConfig` als Konfigurationsfehler
         * und bricht den Boot ab — für die GANZE Suite.
         */
        ...ZEICHEN_ENV,
```

und oben der Import neben den anderen Helfern:

```ts
import { ZEICHEN_ENV } from "./e2e/helpers/zeichen";
```

- [ ] **Schritt 4: Den Lauf sehen — und die Reparaturanweisung, falls er rot ist**

Kommando: `pnpm exec playwright test e2e/zeichen.spec.ts`

Erwartet:

```
Running 9 tests using 1 worker
  9 passed (2.1m)
```

**Ist er rot, ist die Fehlermeldung die Anweisung, und zwar in dieser Reihenfolge:**

- `Expected: 200 / Received: 500` auf einer Modulroute → ein RSC-Bruch. Die Datei steht in der
  Serverkonsole von `next dev`. Reihenfolge der Verdächtigen: `@einsatzzeichen/*` im Server-Graph
  (M1) · `@ant-design/icons` (Falle 7) · Wert aus einem `"use client"`-Modul (Falle 6) · Funktion
  über die RSC-Grenze (Falle 9).
- `locator resolved to hidden`/`Timeout … getByTestId(...)` → der Haken aus der Tabelle unter
  „Nutzt" fehlt in der Fläche. Er wird **dort** ergänzt, nicht hier weggelassen.
- `TimeoutError: page.waitForURL` nach einem `klickeWennRuhig` → **kein größeres Zeitbudget
  einsetzen.** Gewartet wird dann auf eine Navigation, die nie angestoßen wurde; die Ursache ist ein
  Umbruch der Hülle (Falle 12), und die Abhilfe steht schon im Test.
- `page.waitForResponse` läuft ab → der POST ist nie hinausgegangen oder wurde abgebrochen
  (Falle 10). Erst prüfen, ob `warmeZeichenRouten` **angemeldet** lief.

- [ ] **Schritt 5: Drei Gegenproben, damit die Zusicherungen nicht leer-grün sind**

Ein Test, der nicht rot werden kann, bewacht nichts. Drei Sonden, jede einzeln, jede danach
**zurückgenommen** (`git checkout -- <datei>`):

**Sonde 1 — sieht der SVG-Fall wirklich einen RSC-Bruch?** In
`src/app/m/zeichen/(shell)/katalog/[id]/page.tsx` vorübergehend oben ergänzen:

```ts
import { RECIPES } from "@einsatzzeichen/catalog";
console.log(RECIPES.length);
```

Kommando: `pnpm exec playwright test e2e/zeichen.spec.ts -g "das einzige Tor"`
Erwartet: **FAIL** mit `Expected: 200 / Received: 500` — das ist M1 im Betrieb. Danach zurücknehmen
und den Fall erneut grün sehen. (Nebenbefund: `pnpm vitest run` bleibt bei gesetzter Sonde **grün**.
Genau das ist der Grund, warum es diesen e2e-Fall gibt.)

**Sonde 2 — misst der 404 die Rechtestufe?** In `e2e/zeichen.spec.ts` im letzten
Verwaltungsfall `groups: ""` vorübergehend auf `groups: ZEICHEN_ADMIN_GRUPPE` setzen.
Kommando: `pnpm exec playwright test e2e/zeichen.spec.ts -g "gehoert der Admin-Gruppe"`
Erwartet: **FAIL** mit `Expected: 404 / Received: 200`. Danach zurücknehmen.

**Sonde 3 — greift der Klarnamen-Riegel?** In `src/app/m/zeichen/(rahmenlos)/offline/page.tsx`
vorübergehend `const { auth } = …; const s = await auth();` einsetzen und
`<span>{s?.user?.name}</span>` rendern.
Kommando: `pnpm exec playwright test e2e/zeichen.spec.ts -g "keinen Klarnamen"`
Erwartet: **FAIL** — `dev@localtest.me` steht im Markup. Danach zurücknehmen. Ohne diese Sonde ist
nicht belegt, dass der Test überhaupt Text aus der Seite liest.

- [ ] **Schritt 6: `e2e/zeichen-pwa.spec.ts` schreiben**

```ts
import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * DER PWA-LAUF DES MODULS `zeichen` (Spec §7, §8.3).
 *
 * ⛔ ER LAEUFT IN KEINER CI, UND DAS IST EINE BENANNTE SCHWAECHE DES ENTWURFS,
 * KEIN VERSEHEN (Spec §8.4, Punkt 6): `.github/workflows/ci.yml:148` faehrt
 * `pnpm e2e --shard=n/5`, also ausschliesslich das normale Profil. Dieser Lauf
 * ist ein HANDLAUF vor dem Merge — `pnpm e2e:pwa`.
 *
 * ⚠️ SEIT DER MERKLISTE-ENTSCHEIDUNG (Spec §7.5) WIEGT DAS SCHWERER ALS ZUVOR.
 * Bis dahin war die Zusage „auf dem Geraet liegt nichts Personenbezogenes" mit
 * einem Unit-Test gegen den Worker-Quelltext haltbar. Sie ist es nicht mehr: die
 * Merkliste liegt in IndexedDB, offline gibt es keine Authentifizierung (das
 * Sitzungscookie ist `HttpOnly` und fuer Seite wie Worker unsichtbar), und
 * IndexedDB ueberlebt den Logout genauso wie der Cache. Was davon eine
 * Maschinenpruefung hat, steht hier — und hier laeuft es nur, wenn ein Mensch es
 * startet.
 *
 * ⛔ ZWEI EINTRAEGE MACHEN DIESE DATEI ERST LAUFFAEHIG, und ohne BEIDE laeuft sie
 * entweder gar nicht oder im falschen Profil:
 *   * `testMatch` in `playwright.pwa.config.ts` (sonst wird sie dort nie gefunden),
 *   * `testIgnore` in `playwright.config.ts` (sonst laeuft sie zusaetzlich auf dem
 *     Dev-Server ohne sicheren Kontext, wo `navigator.serviceWorker` fehlt).
 */

const ZEICHEN = "http://zeichen.localtest.me:3101";

/**
 * Name aus `_lib/sw-quelle.ts` (Aufgabe 9). Bewusst dupliziert statt importiert:
 * der Test soll nach einem Versionssprung auffallen und nicht stillschweigend
 * mitwandern — `activate` loescht JEDEN anderen Cache-Namen, ein stiller
 * Gleichlauf verdeckte also genau den Fall, den man sehen will.
 */
const CACHE = "zeichen-pwa-v1";

/** Ebenfalls aus `_lib/sw-quelle.ts`, aus demselben Grund dupliziert. */
const IDB = "zeichen-merkliste";

/** Aus `e2e/helpers/zeichen.ts` — dort steht die Kopplung an `ANKER` ausgeschrieben. */
const ANKER_ID = "rezept:C.1.1";

/** Der Cache-Write haengt an `waitUntil` und ist nach der Navigation nicht zwingend durch. */
async function warteAufGecachteHuelle(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          async (c) => (await (await caches.open(c)).match("/offline")) !== undefined,
          CACHE,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test("der Modul-Host liefert Manifest, Icon und Worker — mit use-credentials", async ({
  page,
  request,
}) => {
  await devLogin(page, { host: "zeichen.localtest.me", port: 3101 });
  await page.goto(`${ZEICHEN}/katalog`);

  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute("href", "/manifest.webmanifest");
  /*
   * ⛔ OHNE `crossOrigin="use-credentials"` HOLT DER BROWSER DAS MANIFEST OHNE
   * COOKIES und bekommt Login-HTML (Spec §7.3). Das Attribut kommt im ganzen Repo
   * sonst nicht vor — es gibt also kein zweites Vorbild, an dem der Fehler
   * auffiele.
   */
  await expect(link).toHaveAttribute("crossorigin", "use-credentials");

  const manifest = await page.request.get(`${ZEICHEN}/manifest.webmanifest`);
  expect(manifest.status()).toBe(200);
  const json = await manifest.json();
  /*
   * ⛔ `start_url: "/offline"` UND NICHT `"/"` — und das ist der Unterschied zu
   * `qr` und `uav`, die beide `"/"` fuehren. Hier waere `/` die RSC-Startseite
   * unter `SuiteRahmen`, die ausdruecklich NICHT im Cache liegt: die installierte
   * PWA landete offline auf Chromiums Netzwerkfehlerseite, weil `caches.match("/")`
   * und `caches.match(NAV_FALLBACK)` beide leer sind und `respondWith` auf
   * `undefined` aufloest.
   */
  expect(json.start_url).toBe("/offline");
  expect(json.scope).toBe("/");

  const sw = await page.request.get(`${ZEICHEN}/sw.js`);
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");

  // Gegenprobe auf einem fremden Suite-Host: dort gibt es das alles nicht.
  const fremd = await request.get("http://portal.localtest.me:3101/sw.js");
  expect(fremd.headers()["content-type"] ?? "").not.toContain("javascript");
});

test("im Cache liegt die rahmenlose Offline-Flaeche — und sonst nichts Personenbezogenes", async ({
  page,
}) => {
  await devLogin(page, { host: "zeichen.localtest.me", port: 3101, callbackPath: "/katalog" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await warteAufGecachteHuelle(page);

  const inhalt = await page.evaluate(async (c) => {
    const cache = await caches.open(c);
    const huelle = await cache.match("/offline");
    return {
      pfade: (await cache.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search),
      html: huelle ? await huelle.text() : null,
    };
  }, CACHE);

  /*
   * DER INHALTSRIEGEL, gemessen statt behauptet (Spec §7.3): im HTTP-Cache landet
   * kein HTML mit `"userName"`. Diese Zusage bleibt scharf, auch nachdem §7.5 die
   * groessere Zusage aufgegeben hat.
   */
  expect(inhalt.html, "die gecachte Huelle traegt einen Klarnamen").not.toContain("userName");
  expect(inhalt.html).not.toContain("angemeldet");
  // ⛔ DER „LOGIN"-MARKER: ohne den `redirected`-Riegel kommt der gemessene
  // `307 -> /login` als `ok: true` an und braenne sich als Offline-Flaeche ein.
  expect(inhalt.html).not.toContain("Dev-Login");
  expect(inhalt.html).not.toContain("callbackUrl");
  // Positiver Nachweis, dass hier ueberhaupt die richtige Seite liegt — ohne ihn
  // bliebe alles oben auch ueber einem leeren Dokument gruen.
  expect(inhalt.html).toContain('data-testid="zeichen-offline"');

  // Keine gegatete Flaeche, keine RSC-Antwort einer Soft-Navigation (die Allowlist
  // `isCacheableAsset` gegen die Denylist, die `"/?_rsc=<hash>"` durchliess).
  expect(inhalt.pfade.some((p) => p.startsWith("/katalog"))).toBe(false);
  expect(inhalt.pfade.some((p) => p.startsWith("/merkliste"))).toBe(false);
  expect(inhalt.pfade.some((p) => p.includes("_rsc"))).toBe(false);
  expect(inhalt.pfade.some((p) => p.startsWith("/api/"))).toBe(false);
  // Und die Buendel liegen wirklich da — sonst traegt die Flaeche offline nicht.
  expect(inhalt.pfade.some((p) => p.startsWith("/_next/static/"))).toBe(true);
});

test("offline: start_url oeffnen, suchen, Treffer sehen", async ({ page, context }) => {
  await devLogin(page, { host: "zeichen.localtest.me", port: 3101, callbackPath: "/katalog" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await warteAufGecachteHuelle(page);

  await context.setOffline(true);

  /*
   * ⛔ `page.goto("/")` NACH `setOffline(true)` — DAS IST DER `start_url`-FALL.
   * Eine installierte PWA startet auf `/`; der Navigationszweig findet dafuer
   * nichts im Cache und faellt auf `/offline` zurueck. Faellt er es nicht, sieht
   * der Nutzer Chromiums Netzwerkfehlerseite — und zwar ausgerechnet in dem
   * Moment, fuer den das ganze Kapitel gebaut wurde.
   */
  await page.goto(`${ZEICHEN}/`);
  await expect(page.getByTestId("zeichen-offline")).toBeVisible();

  // Der Stand der Sammlung (Spec §7.4): ohne ihn kann niemand beurteilen, ob das,
  // was er offline sieht, aktuell ist — der Cache kann beliebig alt sein.
  await expect(page.getByTestId("zeichen-offline-stand")).toContainText("246 Zeichen");

  /*
   * ⛔ EINE ECHTE INTERAKTION, KEIN „SEITE LAEDT OFFLINE". Die Zusage lautet
   * „alle 246 Zeichen nachschlagen und durchsuchen", und Suchen braucht die
   * hydrierte Insel samt ihrem Datenpaket. Steht nur das Standbild, waere der
   * Test gruen und die Zusage falsch.
   */
  await page.getByLabel("Zeichen suchen").fill("loeschgruppe");
  await expect(page.getByTestId("zeichen-treffer-eintrag").first()).toBeVisible();

  // Und ein Lesezeichen auf eine nicht gecachte Route landet ebenfalls auf der
  // Offline-Flaeche statt in der Fehlerseite (Spec §7.3: die Adresszeile luegt,
  // und das ist der bewusst gewaehlte kleinere Schaden).
  await page.goto(`${ZEICHEN}/katalog`);
  await expect(page.getByTestId("zeichen-offline")).toBeVisible();

  await context.setOffline(false);
});

test("die Merkliste ist offline da — und der Loeschknopf raeumt sie vom Geraet", async ({
  page,
  context,
}) => {
  await devLogin(page, { host: "zeichen.localtest.me", port: 3101 });

  // Online merken (ueber die Server Action), wiederholungsfest wie im Dev-Profil:
  // `next start` behaelt seine Datenbank ueber alle Versuche eines Laufs.
  await page.goto(`${ZEICHEN}/katalog/${encodeURIComponent(ANKER_ID)}`);
  const entfernen = page.getByRole("button", { name: "Nicht mehr merken" });
  if ((await entfernen.count()) === 0) {
    const antwort = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/katalog/"),
    );
    await page.getByRole("button", { name: "Merken", exact: true }).click();
    expect((await antwort).status()).toBe(200);
  }

  // Die Insel schreibt die Merkliste bei jedem ONLINE-Aufruf nach IndexedDB
  // (Spec §7.5) — geschrieben wird nur online, gelesen offline.
  await page.goto(`${ZEICHEN}/katalog`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await warteAufGecachteHuelle(page);
  await expect
    .poll(
      () =>
        page.evaluate(async (name) => (await indexedDB.databases()).some((d) => d.name === name), IDB),
      { timeout: 30_000 },
    )
    .toBe(true);

  await context.setOffline(true);
  await page.goto(`${ZEICHEN}/`);

  await expect(page.getByTestId("zeichen-merkliste")).toContainText(/\S/);
  // Der Hinweis steht unmittelbar bei der Liste, nicht in einer Fusszeile: auf
  // einem geteilten Geraet sieht sie auch, wer sich nach dir anmeldet. Er ist
  // kein Riegel, er ist eine Aussage — und deshalb ist seine ANWESENHEIT die
  // Zusage, die hier geprueft wird.
  await expect(page.getByTestId("zeichen-merkliste")).toContainText("auf diesem Gerät");

  await page.getByRole("button", { name: "Von diesem Gerät löschen" }).click();

  await expect
    .poll(() =>
      page.evaluate(async (name) => (await indexedDB.databases()).some((d) => d.name === name), IDB),
    )
    .toBe(false);
  await expect.poll(() => page.evaluate(() => caches.keys().then((k) => k.length))).toBe(0);

  await context.setOffline(false);
});

test("der Logout-Haken loescht Cache und Merkliste", async ({ page }) => {
  /*
   * Der Logout-Haken ist seit Spec §7.5 keine Vorsorge mehr, sondern die tragende
   * Massnahme fuer den GEORDNETEN Fall — und ausdruecklich nicht fuer Ablauf,
   * Widerruf, Gruppenentzug oder ein weggelegtes Geraet. next-auth sendet genau
   * `POST /api/auth/signout` (`node_modules/next-auth/react.js:191`).
   *
   * ⚠️ DER WORKER LOESCHT BEIM ANBLICK DER ANFRAGE, nicht auf eine bestimmte
   * Antwort hin (`_lib/sw-quelle.ts`, Aufgabe 9). Ob die Antwort 302 oder wegen
   * fehlendem CSRF-Token 400 lautet, ist deshalb gleichgueltig. Loescht die
   * Umsetzung stattdessen erst nach einer 200er-Antwort, ist DIESER Fall die
   * Stelle, an der das auffaellt — dann hat Aufgabe 9 ihre Zusage nicht erfuellt,
   * und der Test wird nicht angepasst, sondern der Worker.
   */
  await devLogin(page, { host: "zeichen.localtest.me", port: 3101, callbackPath: "/katalog" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await warteAufGecachteHuelle(page);

  await page.evaluate(() =>
    fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined),
  );

  await expect
    .poll(() => page.evaluate(() => caches.keys().then((k) => k.length)), { timeout: 30_000 })
    .toBe(0);
  await expect
    .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)))
    .not.toContain(IDB);
});
```

- [ ] **Schritt 7: `playwright.pwa.config.ts` ergänzen — drei Stellen**

```ts
const ORIGINS = [
  "http://beta.localtest.me:3101",
  "http://portal.localtest.me:3101",
  "http://qr.localtest.me:3101",
  // Ohne diese Zeile ist `zeichen.localtest.me:3101` kein sicherer Kontext:
  // `isSecureContext` bleibt false, `navigator.serviceWorker` fehlt ganz, und
  // JEDER Fall aus `zeichen-pwa.spec.ts` scheitert an `undefined` statt an seiner
  // Zusage.
  "http://zeichen.localtest.me:3101",
].join(",");
```

```ts
  // `pwa-spike` UND `zeichen-pwa`: eine Datei, die hier nicht steht, wird von
  // dieser Config nie gefunden — und von der normalen Config (testIgnore)
  // ausgeschlossen. Sie liefe dann in KEINEM Profil, ohne dass ein Tor rot wird.
  testMatch: /(pwa-spike|zeichen-pwa)\.spec\.ts/,
```

und in `webServer.env`, hinter `PORT`:

```ts
      /*
       * ⛔ DIESE ZWEI ZEILEN GEHOEREN ZUSAMMEN, und die Reihenfolge ihrer Wirkung
       * ist scharf: `zeichenBootFehler()` (`src/app/m/zeichen/_lib/boot.ts`) meldet
       * genau dann, wenn `ZEICHEN_SW=1` gesetzt ist UND `SUITE_HOST_ZEICHEN` fehlt.
       * Die Meldung landet in `assertHostConfig`, das bei nichtleerer Liste WIRFT —
       * dann startet der Server gar nicht, und mit ihm faellt auch der
       * qr/beta-Teil dieser Suite aus. Wer `ZEICHEN_SW` hier setzt, setzt
       * `SUITE_HOST_ZEICHEN` mit.
       *
       * ⚠️ OHNE `ZEICHEN_SW=1` REGISTRIERT `RegisterSW` NICHTS (Plan-Abweichung zu
       * Spec §7.1, nach dem Muster von uavs `UAV_SW_MODUS`): der Cache-Zweig waere
       * in E2E unpruefbar, und alle fuenf Faelle liefen in einen Timeout auf
       * `navigator.serviceWorker.ready`.
       */
      SUITE_HOST_ZEICHEN: "zeichen.localtest.me",
      ZEICHEN_SW: "1",
      SUITE_ADMIN_GROUP_ZEICHEN: "iuk-zeichen-admin",
```

- [ ] **Schritt 8: Handlauf — `pnpm e2e:pwa` von Hand fahren**

```bash
pnpm exec playwright install chromium
pnpm e2e:pwa
```

`playwright install chromium` ist Pflicht und nicht Vorsorge: die Config fährt `channel: "chromium"`,
weil Playwrights Standard-Browser („chromium headless shell") `--unsafely-treat-insecure-origin-as-secure`
**ignoriert** — gemessen bleibt dort `isSecureContext` false und `navigator.serviceWorker` fehlt ganz.

Erwartet (`pwa-spike` läuft mit, das ist gewollt — die Config-Änderung betrifft beide Dateien):

```
Running 12 tests using 1 worker
  12 passed (3.4m)
```

**⛔ Dieser Lauf steht in keiner CI, und das ist eine benannte Schwäche des Entwurfs, kein
Versehen** (Spec §8.4, Punkt 6). `.github/workflows/ci.yml:148` fährt ausschließlich
`pnpm e2e --shard=${{ matrix.shard }}/5`, also das normale Profil; `playwright.pwa.config.ts` wird
dort nie gestartet. Der belastbare, dauerhaft laufende Teil des Offline-Datenschutzes sitzt im
Vitest-Fake-Worker (`_lib/sw-quelle.test.ts`, Aufgabe 9) und in
`e2e/zeichen.spec.ts` („die Offline-Fläche trägt keinen Klarnamen"); der **Browser-Beweis ist ein
Handlauf**. **Seit der Merkliste-Entscheidung (Spec §7.5) wiegt das schwerer als zuvor**: bis dahin
war die Zusage „auf dem Gerät liegt nichts Personenbezogenes" mit einem Unit-Test gegen den
Worker-Quelltext haltbar — jetzt liegt die Merkliste in IndexedDB, überlebt den Logout und ist auf
einem geteilten Gerät sichtbar. Wer den Worker anfasst, fährt diesen Lauf; wer ihn nicht fährt, hat
die Zusage nicht geprüft. Das gehört in den Commit-Text, nicht in eine Fußnote.

- [ ] **Schritt 9: Handlauf H1 — `docker build`, dann nach der Schrift suchen**

Die Frage (Spec §8.4 Punkt 7, §9 H1): **zieht Nexts File-Tracing im pnpm-Layout dieselben Assets wie
im gemessenen npm-Layout?** Alle Standalone-Messungen liefen im npm-Layout. Das Dockerfile trägt
bereits einen Hinweis, dass pnpm-Symlinks und `bare copy` hier schon einmal Ärger gemacht haben
(Zeilen 62–64: better-sqlite3 steckt nur deshalb im Output, weil **kein** separater `COPY` den
Symlink bricht).

```bash
docker build -t iuk-suite:h1-builder --target builder .
docker run --rm iuk-suite:h1-builder sh -c 'find .next/static -name "*.ttf"; echo "--- standalone ---"; find .next/standalone -name "*.ttf"'
```

Erwartet: mindestens eine Zeile unter `.next/static/media/…`, die Arimo mit Inhaltshash trägt, z. B.

```
.next/static/media/arimo.abc12345.ttf
--- standalone ---
```

Der leere Teil unter `--- standalone ---` ist **kein Befund**: `next/font/local` legt die Datei unter
`/_next/static/media/` ab, und `.next/static` wird im Runner separat kopiert (`Dockerfile:48`).
Deshalb die zweite Hälfte am fertigen Laufzeit-Image:

```bash
docker build -t iuk-suite:h1 .
docker run --rm --entrypoint sh iuk-suite:h1 -c 'find /app -name "*.ttf"'
```

Erwartet: dieselbe Datei unter `/app/.next/static/media/…`.

**Ist die erste Ausgabe leer, ist die Schrift nie in den Build gekommen** — und der Fehler ist still:
66 % der Zeichen tragen `<text font-family="Arimo">`, die Textgeometrie ist gegen Arimo vermessen,
und ohne die Schrift laufen „KatSL", „ÜMANV-S", „MLW IV Lbw" aus ihren Boxen. Dann wird der Befund
notiert und die Ursache in **Aufgabe 2** gesucht (`_fonts/arimo.ttf`, `next/font/local`).
**`next.config.ts` bleibt dabei unangetastet** — sie unangetastet zu lassen ist die tragende
Architekturentscheidung dieses Moduls (Spec §1), und ein `outputFileTracingIncludes` wäre eine
vierte Ecke am Dreieck aus `CLAUDE.md`. Eine Datei unter `public/m/zeichen/` ist **keine** Abhilfe:
sie liefe durch `decideRoute` und wäre bei `requiresAuth: true` gegatet.

- [ ] **Schritt 10: Handlauf H2 — ein Blick in einen echten Browser**

Die Frage (Spec §8.4 Punkt 3, §9 H2): **greift die CSS-Regel auf `svg text` gegen das
Präsentationsattribut, und steht Arimo?** Argumentativ ist es sicher (Attributspezifität 0), gemessen
ist es nicht — und **kein Gate kann es messen**: jsdom rechnet keine Glyphen, `build` sieht nur einen
String.

```bash
pnpm dev
```

Dann `http://zeichen.localtest.me:3000/katalog` öffnen, anmelden, nach `MLW` suchen und den Eintrag
mit der langen Beschriftung („MLW IV Lbw") öffnen. In der Browser-Konsole:

```js
const t = document.querySelector(".zeichenflaeche svg text");
console.log(getComputedStyle(t).fontFamily);          // muss die Arimo-Variable aufloesen
console.log(t.getAttribute("font-family"));           // steht weiterhin "Arimo" im Attribut
console.log(document.fonts.check(`16px ${getComputedStyle(t).fontFamily}`));  // true
console.log(t.getBBox().width, t.closest("svg").viewBox.baseVal.width);
```

Drei Ablesungen, alle drei in den Commit-Text:

1. `getComputedStyle(...).fontFamily` nennt die geladene Arimo-Familie — dann hat die Regel
   `.zeichenflaeche svg text { font-family: var(--tz-zeichenschrift); }` das Präsentationsattribut
   geschlagen.
2. `document.fonts.check(...)` ist `true` — die Schrift ist wirklich da und nicht nur benannt.
3. Der Text läuft **nicht** über seine Box hinaus (mit dem Auge zu sehen, die `getBBox`-Zeile
   beziffert es).

Zusätzlich **beide Themes** durchschalten (der Umschalter in der Kopfzeile, drei Zustände): das
Zeichen liegt auf einer hellen Platte (`--tz-blatt`), nie auf umgefärbtem Theme — die
Organisationsfarben sind fachlich festgelegt.

Fällt Ablesung 1 oder 2 negativ aus, ist das ein Befund für **Aufgabe 2** (Einbindung) bzw.
**Aufgabe 5** (die `.variable`-Klasse hängt am `<div>` in `layout.tsx`, dem einzigen gemeinsamen
Vorfahren **beider** Routengruppen — am `(shell)`-Layout hinge sie nicht über `/offline`).

- [ ] **Schritt 11: Alle Tore fahren**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm exec playwright test
```

Erwartet: vier grüne Läufe. `pnpm exec playwright test` läuft die **ganze** Suite, nicht nur die neue
Datei — diese Aufgabe fasst `playwright.config.ts` an, und eine Änderung an `webServer.env` oder
`testIgnore` betrifft jeden anderen Spec mit.

⚠️ `typecheck` läuft mit `--pretty false`, und **außerhalb dieser Umgebung wird der Exit-Code
geprüft**, nicht die Meldung — niemals mit `grep "error TS"` auf farbigem Output, dort steht eine
ANSI-Sequenz zwischen `error` und `TS`.

- [ ] **Schritt 12: Commit**

```bash
git add e2e/helpers/zeichen.ts e2e/zeichen.spec.ts e2e/zeichen-pwa.spec.ts playwright.config.ts playwright.pwa.config.ts
git commit -m "test(zeichen): e2e-Faelle, PWA-Lauf und die zwei Handlaeufe

Neun Faelle im normalen Profil (laufen in der CI) und fuenf im PWA-Profil
(laufen in KEINER CI).

Der tragende Fall ist der Abruf von /m/zeichen/katalog/<id> mit
toContain(\"<svg\"): das einzige Tor der Suite, das einen RSC-Bruch nach einem
Paketupgrade sieht. Vitest kann diese Klasse strukturell nicht sehen — dort ist
\"use client\" ein wirkungsloser String und es gibt gar keine RSC-Grenze. Die
Gegenprobe ist gefahren: ein voruebergehender @einsatzzeichen/catalog-Import in
der Detailseite macht den Fall rot (500) und laesst vitest gruen.

Vier Repo-Regeln stehen in jedem Fall: jeder navigierende Klick ueber
klickeWennRuhig (Falle 12), Warmlauf-GET vor dem ersten POST und
waitForResponse statt Warten auf eine spaetere Zustandsaenderung (Falle 10),
kein dragTo (Falle 11), Rollenwechsel ueber wechsleAnmeldung. Der Warmlauf
laeuft ANGEMELDET — anonym uebersetzt er nur den Login-Redirect.

zeichen-pwa.spec.ts ist in BEIDE Konfigurationen eingetragen (testMatch in
playwright.pwa.config.ts, testIgnore in playwright.config.ts) plus der
Modul-Host in ORIGINS und SUITE_HOST_ZEICHEN/ZEICHEN_SW in webServer.env;
ohne alle vier liefe die Datei in keinem oder im falschen Profil.

pnpm e2e:pwa laeuft in KEINER CI (ci.yml faehrt nur pnpm e2e). Das ist eine
benannte Schwaeche des Entwurfs, kein Versehen — und sie wiegt seit der
Merkliste-Entscheidung schwerer als zuvor: die Merkliste liegt in IndexedDB,
ueberlebt den Logout und ist auf einem geteilten Geraet sichtbar. Die
inhaltliche Haelfte der Zusage deckt der CI-Fall 'die Offline-Flaeche traegt
keinen Klarnamen' ab, samt Positivkontrolle auf der Flaeche unter der Huelle.

Handlauf H1 (docker build, find nach *.ttf): <Ergebnis eintragen>.
Handlauf H2 (echter Browser auf 'MLW IV Lbw'): <Ergebnis eintragen>.

Keine Release-Notiz: Tests und CI sind nach CLAUDE.md notizfrei."
```

⚠️ **Die zwei `<Ergebnis eintragen>` sind Pflichtfelder, keine Höflichkeit.** Beide Fehlerbilder sind
still — eine fehlende Schrift zeigt sich als „die Beschriftung sieht komisch aus", eine nicht
greifende CSS-Regel überhaupt nicht. Steht die Messung nicht im Commit, wiederholt der nächste sie in
einem halben Jahr von vorn.
