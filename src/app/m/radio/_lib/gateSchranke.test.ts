// src/app/m/radio/_lib/gateSchranke.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * DIE GATE-SCHRANKE (Spec 1 §3.7.2, Zeilen 2996-3035; Testauftrag §3.8, Zeilen 3095-3098).
 *
 * ⛔ DIE ABWEHR SIND DIE ZWEI MODULWEITEN ZAEHLER, NICHT DER ABSENDER-EIMER. Woertlich
 * aus dem Bestand (`src/app/m/lagerbuch/_lib/absender.ts:30-33`): „Der Per-Absender-
 * Zaehler ist damit eine Bequemlichkeitsgrenze gegen Tippfehler und ungezieltes Klopfen —
 * NICHT die Brute-Force-Abwehr. Die Abwehr sind die beiden modulweiten Zaehler in
 * `gateSchranke.ts`, WEIL IHR SCHLUESSEL DER EINZIGE IST, DEN NIEMAND ROTIEREN KANN."
 *
 * ⬜ A-L12 — OB `cf-connecting-ip` AUF EINEM MODUL-HOST HEUTE DIE CLIENT-ADRESSE TRAEGT,
 * IST UNBESTIMMT. Der Befund vom 2026-08-22 sagt nein: dort bekommt jede Anfrage die
 * Egress-Adresse dieses Servers als Absenderschluessel (`src/core/ratelimit.ts:98-111`).
 * Der Umbau dagegen ist gebaut (`src/core/routing.ts:59-61`). Die Abnahme am Server steht
 * aus (`docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:29-32` — P1 und P6
 * offen). ⛔ Diese Datei setzt KEINE der beiden Antworten voraus, und sie muss es nicht:
 * die Abwehr sind so oder so die zwei modulweiten Zaehler, deren Schluessel
 * Modulkonstanten sind.
 *
 * ⚠️ JEDER FALL IMPORTIERT DAS MODUL FRISCH. Die drei `RateLimiter` und die
 * `gesperrtBis`-Map sind Modul-Singletons; ohne frischen Import truege ein Fall die
 * Sperre des vorigen mit, und die Reihenfolge der Faelle entschiede das Ergebnis.
 *
 * ⛔ DIE EINE ZAHL, DIE JEDER FALL DIESER DATEI BRAUCHT: `RateLimiter.check` VERWEIGERT
 * ERST DEN (max+1)-TEN AUFRUF, NICHT DEN max-TEN. `src/core/ratelimit.ts:29-30` prueft
 * `if (recent.length >= this.max)`, und `recent` enthaelt den LAUFENDEN Aufruf noch
 * nicht — Aufruf Nr. N sieht `N-1`. Und `gateFehlversuchBuchen` schreibt `gesperrtBis`
 * NUR im `false`-Zweig (`lagerbuch/_lib/gateSchranke.ts:151-157`); ohne dieses eine
 * `false` bleibt die Map leer und `gateGesperrt` liefert `null`.
 *
 * ⛔ FOLGE, UND SIE IST DER GRUND FUER JEDE 6 / 31 / 301 UNTEN: eine Sperre entsteht bei
 * `max+1` Buchungen, nicht bei `max`. Das Vorbild sagt es im TESTNAMEN
 * (`lagerbuch/_lib/gateSchranke.test.ts:79`: „weist den 6. Fehlversuch desselben
 * Absenders ab" — fuenf Buchungen mit `toBeNull()`, DANN die sechste).
 *
 * ⛔ WER STATTDESSEN DIE GRENZEN IN `_lib/grenzen.ts` AUF 4/29/299 SENKT, DAMIT DIE
 * FAELLE GRUEN WERDEN, bricht Spec:3006-3009 und Eigenschaft 3 aus Spec:3022-3028. Die
 * Zahlen 5/30/300 sind gesetzt; die Buchungszahl im Test ist es, die um eins hoeher
 * liegt.
 */
const frisch = async () => {
  vi.resetModules();
  return import("./gateSchranke");
};

beforeEach(() => { vi.useRealTimers(); });

describe("radio-Gate-Schranke: der Absender-Eimer", () => {
  it("weist den 6. Fehlversuch desselben Absenders ab", async () => {
    // RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN, Vorgabe 5 (A1, Spec:3006) — und die
    // Sperre entsteht beim SECHSTEN Versuch, nicht beim fuenften (Kopfkommentar oben,
    // `src/core/ratelimit.ts:29-30`). Der Testname nennt die Zahl, wie im Vorbild
    // `lagerbuch/_lib/gateSchranke.test.ts:79`.
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) {
      expect(gateGesperrt("cf:1.2.3.4"), `nach ${i} Fehlversuchen`).toBeNull();
      gateFehlversuchBuchen("cf:1.2.3.4");
    }
    expect(gateGesperrt("cf:1.2.3.4")).not.toBeNull();
  });

  it("sperrt einen ANDEREN Absender dabei nicht mit", async () => {
    // Die Trennung ist der ganze Zweck des Absender-Eimers. ⚠️ Ob sie im Betrieb auf
    // einem Modul-Host WIRKT, ist ⬜ A-L12 und unbestimmt (Kopfkommentar oben) — dieser
    // Fall sichert die FUNKTION zu, nicht die Wirkung im Betrieb.
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) gateFehlversuchBuchen("cf:1.2.3.4");   // 6, nicht 5 — Kopfkommentar
    expect(gateGesperrt("cf:1.2.3.4")).not.toBeNull();
    expect(gateGesperrt("cf:9.9.9.9")).toBeNull();
  });
});

describe("radio-Gate-Schranke: die zwei modulweiten Zaehler — DIE Abwehr", () => {
  it("weist die 31. Buchung modulweit ab, auch bei rotierendem Absender", async () => {
    /*
     * ⛔ DER FALL, DER DIE ABWEHR BELEGT. Sechs Absender x fuenf Fehlversuche = 30 — jeder
     * einzelne bleibt unter seinem eigenen Limit von 5, und alle 30 gehen bis in den
     * modulweiten Minutenzaehler durch. Genau das ist gemeint mit „= sechs
     * Absender-Budgets" (Spec:3007).
     *
     * ⛔ DIE 31. BUCHUNG IST DIE, DIE SPERRT, und sie kommt von einem SIEBTEN Absender:
     * `RateLimiter.check` verweigert erst den (max+1)-ten (Kopfkommentar oben). Ein
     * sechster Versuch eines der ersten sechs Absender taugt dafuer NICHT — er wuerde am
     * Absender-Eimer kurzschliessen (`gateSchranke.ts:151`) und den modulweiten Zaehler
     * gar nicht erst erreichen.
     *
     * ⛔ WER DEN ABSENDER ROTIERT, KOMMT AN DIESEM ZAEHLER NICHT VORBEI — sein Schluessel
     * ist eine Modulkonstante.
     */
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let a = 0; a < 6; a++) {
      for (let i = 0; i < 5; i++) gateFehlversuchBuchen(`cf:10.0.0.${a}`);
    }
    expect(gateGesperrt("cf:10.0.0.99"), "nach 30 Buchungen darf noch NICHTS gesperrt sein")
      .toBeNull();
    gateFehlversuchBuchen("cf:10.0.0.6");                 // die 31., von einem siebten Absender
    expect(gateGesperrt("cf:10.0.0.99"), "ein FRISCHER Absender muss jetzt gesperrt sein")
      .not.toBeNull();
  });

  it("der Stundenzaehler traegt ueber die Minutensperre hinaus", async () => {
    /*
     * ⛔ DER TRAGENDE ZAEHLER (Spec:3008-3009): 300 = 5/min x 60. Er stellt genau die
     * Zusage wieder her, die das Per-Absender-Limit nur unter der Annahme einer
     * wahrhaftigen Adresse je hatte.
     *
     * Bauform: die Uhr um jeweils gut eine Minute vorstellen, damit die Minutensperre
     * ablaeuft, aber die Stunde weiterlaeuft. ⚠️ `vi.setSystemTime` und NICHT ein
     * injizierter `now`-Parameter: `gateGesperrt`/`gateFehlversuchBuchen` nehmen keinen —
     * ihre Signatur ist von der Spec gesetzt (Spec:3001-3003), und ein zusaetzlicher
     * Testparameter waere eine Naht, die im Betrieb niemand benutzt.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();

    // 60 Minutenfenster x 5 Fehlversuche = 300 — der Stundendeckel ist damit ERREICHT,
    // aber noch nicht ueberschritten.
    for (let m = 0; m < 60; m++) {
      vi.setSystemTime(new Date(start.getTime() + m * 61_000));
      for (let i = 0; i < 5; i++) gateFehlversuchBuchen(`cf:10.1.${m}.1`);
    }
    /*
     * ⛔ DIE 301. BUCHUNG, UND DIE UHR BLEIBT DAFUER STEHEN. Zwei Gruende, beide zaehlen:
     *  (a) `RateLimiter.check` verweigert erst den (max+1)-ten Aufruf (Kopfkommentar).
     *  (b) Das Stundenfenster ist GLEITEND (3_600_000 ms). Stellte man die Uhr vor der
     *      301. Buchung weiter, fiele die erste Buchung (t=0) aus dem Fenster — `check`
     *      saehe 299 statt 300 und liesse durch. Bei t = 59*61_000 = 3_599_000 liegt der
     *      cutoff bei -1_000, alle 300 Zeitstempel sind also im Fenster.
     * Und ein FRISCHER Absenderschluessel, sonst schliesst der Absender-Eimer kurz.
     */
    gateFehlversuchBuchen("cf:10.2.0.1");
    vi.setSystemTime(new Date(start.getTime() + 61 * 61_000));
    expect(gateGesperrt("cf:10.9.9.9"), "der Stundendeckel muss greifen").not.toBeNull();
    vi.useRealTimers();
  });
});

describe("radio-Gate-Schranke: die vier Eigenschaften aus Spec:3013-3031", () => {
  it("ein Erfolg verbraucht kein Budget", async () => {
    /*
     * ⛔ DER `feedback`-VORFALL (Spec:3037-3054). Es gibt hier keine Funktion, die einen
     * Erfolg bucht — der Fall haelt genau das fest: `gateFehlversuchBuchen` ist der
     * EINZIGE Schreibweg, und die Aufrufer rufen ihn nur im Fehlerzweig (Reihenfolge-Scan
     * in A9 sichert die Stelle zu).
     *
     * ⚠️ DIESER FALL PRUEFT DIE MODULOBERFLAECHE, NICHT DIE AUFRUFSTELLE. Dass die
     * Aufrufer ihn wirklich nur im Fehlerzweig rufen, ist Sache von A9/A10 — hier steht
     * nur, dass es keinen zweiten, erfolgsbuchenden Weg gibt.
     */
    const mod = await frisch();
    expect(Object.keys(mod).sort(), "genau zwei Exporte, kein Erfolgsweg")
      .toEqual(["gateFehlversuchBuchen", "gateGesperrt"]);
  });

  it("gateGesperrt liefert nie 0", async () => {
    /*
     * Spec:3020-3022: „Rueckgabe `number | null`, NIE 0 — `if (gateGesperrt(x))` waere in
     * der letzten Sekunde still falsch." Aufgerundet und mindestens 1.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) gateFehlversuchBuchen("cf:1.2.3.4");   // 6, nicht 5 — Kopfkommentar
    // 59,9 Sekunden spaeter: noch gesperrt, Restzeit unter einer Sekunde.
    vi.setSystemTime(new Date(start.getTime() + 59_900));
    expect(gateGesperrt("cf:1.2.3.4")).toBe(1);
    vi.setSystemTime(new Date(start.getTime() + 60_001));
    expect(gateGesperrt("cf:1.2.3.4")).toBeNull();
    vi.useRealTimers();
  });

  it("waehrend einer Sperre wird kein weiterer Fehlversuch gebucht", async () => {
    /*
     * Die SELBSTVERLAENGERNDE SPERRE, gegen die `restMs(...) > 0 -> return` steht
     * (Vorbild `lagerbuch/_lib/gateSchranke.ts:150`). Ohne diese Zeile schoebe jeder
     * weitere Klopfer die Deadline nach vorn, und die Sperre endete nie.
     *
     * ⛔ DIE SPERRE MUSS BEI t=0 ENTSTEHEN, NICHT ERST BEIM HAEMMERN. Mit nur FUENF
     * Buchungen bei t=0 gibt es dort noch keine Sperre; die erste Buchung bei +30_000
     * waere dann die sechste, sie erzeugte die Sperre erst dort, und deren Deadline
     * laege bei +90_000 — der Fall waere bei +60_001 rot, und zwar bei RICHTIGER
     * Implementierung. Also SECHS Buchungen bei t=0 (Deadline +60_000), erst danach das
     * Haemmern.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) gateFehlversuchBuchen("cf:1.2.3.4");   // Sperre bis +60_000
    expect(gateGesperrt("cf:1.2.3.4"), "die Sperre muss BEI t=0 stehen").not.toBeNull();
    vi.setSystemTime(new Date(start.getTime() + 30_000));
    for (let i = 0; i < 50; i++) gateFehlversuchBuchen("cf:1.2.3.4");
    vi.setSystemTime(new Date(start.getTime() + 60_001));
    expect(gateGesperrt("cf:1.2.3.4"), "die Sperre hat sich selbst verlaengert").toBeNull();
    vi.useRealTimers();
  });

  it("ein gesperrter Absender verbraucht das modulweite Budget nicht", async () => {
    /*
     * ⛔ DIE GLEITENDE-FENSTER-LUECKE (Spec:3023-3031). `RateLimiter.check()` ist ein
     * GLEITENDES Fenster und oeffnet FRUEHER, als die feste Deadline ablaeuft. Fragte der
     * Kurzschluss in dieser Luecke erneut nur `check()`, bekaeme er „erlaubt" zurueck —
     * waehrend `gateGesperrt` fuer denselben Schluessel weiterhin „gesperrt" meldet — und
     * liesse den Fehlversuch bis zur naechsten Stufe DURCHFALLEN.
     *
     * Der Schaden ist gross und still: EIN EINZELNER, LAENGST GESPERRTER KLOPFER legte
     * die Ausgabe fuer alle lahm — bei der Minutenbremse sogar fuer eine ganze STUNDE,
     * nicht nur eine Minute.
     *
     * ⛔ ABWEICHUNG VOM PLAN, GEMESSEN UND BEGRUENDET (Sonde S-A3c). Die Bauform, die A3
     * fuer diesen Fall vorschlug — bei STEHENDER Uhr hundertmal denselben Absender buchen
     * und danach einen Unschuldigen pruefen —, faerbt die Mutation NICHT: bei stehender
     * Uhr gibt es die Luecke gar nicht. `check()` sieht dort unveraendert fuenf Treffer
     * und liefert weiter `false`; die Buchung bleibt am `false`-Zweig samt seinem `return`
     * haengen (`gateSchranke.ts:208`) und erreicht den modulweiten Zaehler nie — mit
     * Kurzschluss wie ohne. Gemessen: S-A3c in der Planfassung ergab 1 rot statt 2, und
     * dieser Fall war KEINER der roten. Ein Fall, den keine Mutation faerbt, prueft nicht,
     * was er zu pruefen vorgibt.
     *
     * ⛔ DIE LUECKE BRAUCHT AUSEINANDERLIEGENDE TREFFER, und deshalb steht die Uhr hier
     * nicht still. Sie oeffnet zwischen `t_aeltester_Treffer + Fenster` und
     * `t_ausloesender_Treffer + Fenster`; ihre Laenge ist der Abstand zwischen dem
     * AELTESTEN Treffer und dem, der die Sperre AUSLOESTE. Bei stehender Uhr ist dieser
     * Abstand null.
     *
     * Bauform des Falls, mit der Rechnung, die jede Zahl traegt:
     *   t=0        ein Treffer von A          → proAbsender [0]          · gateMinute [0]
     *   t=59_000   vier weitere Treffer von A → proAbsender [0, 59k x4]  · gateMinute [0, 59k x4]
     *   t=59_000   der sechste Versuch        → `check` sieht 5 >= 5, `false`, Sperre bis 119_000
     *   t=60_001   DIE LUECKE: `cutoff` = 1, der Treffer bei t=0 faellt aus dem Fenster,
     *              `check` saehe nur noch 4 und liesse DURCH — die feste Deadline laeuft
     *              aber noch 58_999 ms. Hier haemmert A.
     *              MIT Kurzschluss: kein einziges Leck, `gateMinute` steht bei 4 im Fenster.
     *              OHNE Kurzschluss: GENAU EIN Leck (der zweite Schlag scheitert wieder an
     *              `check`), `gateMinute` steht bei 5.
     *   danach     26 Buchungen von 26 FRISCHEN Absendern, alle bei t=60_001:
     *              MIT  Kurzschluss: 4 + 26 = 30 Treffer, kein `check` sah je 30 → offen.
     *              OHNE Kurzschluss: 5 + 25 = 30 vor der 26., die sieht 30 >= 30 → `false`
     *              → MODULWEIT_MIN gesperrt, und ein Unschuldiger ist mitgesperrt.
     *
     * ⚠️ 26 UND NICHT 25: `RateLimiter.check` verweigert erst den (max+1)-ten Aufruf
     * (Kopfkommentar oben). Mit 25 blieben beide Faelle offen, und die Mutation faerbte
     * wieder nichts.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();

    gateFehlversuchBuchen("cf:1.2.3.4");
    vi.setSystemTime(new Date(start.getTime() + 59_000));
    for (let i = 0; i < 5; i++) gateFehlversuchBuchen("cf:1.2.3.4");   // der 6. sperrt bis +119_000
    expect(gateGesperrt("cf:1.2.3.4"), "A muss gesperrt sein").not.toBeNull();

    vi.setSystemTime(new Date(start.getTime() + 60_001));              // in der Luecke
    for (let i = 0; i < 50; i++) gateFehlversuchBuchen("cf:1.2.3.4");
    expect(gateGesperrt("cf:1.2.3.4"), "A ist waehrend des Haemmerns weiter gesperrt")
      .not.toBeNull();

    for (let k = 0; k < 26; k++) gateFehlversuchBuchen(`cf:172.16.0.${k}`);
    expect(gateGesperrt("cf:9.9.9.9"), "ein Unschuldiger ist mitgesperrt worden").toBeNull();
    vi.useRealTimers();
  });

  it("liefert die GROESSTE der drei Restzeiten", async () => {
    /*
     * Spec (Vorbild `lagerbuch/_lib/gateSchranke.ts:92-93`): „wer den Stundendeckel
     * gerissen hat, soll nicht ‚noch 12 Sekunden' lesen." Die Zahl ist das `n` aus dem
     * Text zu `grund=zuviele` (A5) — eine zu kleine Zahl macht daraus eine falsche Zusage
     * an den Menschen vor dem Aufsteller.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let m = 0; m < 60; m++) {
      vi.setSystemTime(new Date(start.getTime() + m * 61_000));
      for (let i = 0; i < 5; i++) gateFehlversuchBuchen(`cf:10.1.${m}.1`);
    }
    // Die 301. Buchung, Uhr bleibt stehen, frischer Absender — Begruendung wie im Fall
    // „der Stundenzaehler traegt ueber die Minutensperre hinaus".
    gateFehlversuchBuchen("cf:10.2.0.1");
    const rest = gateGesperrt("cf:10.9.9.9");
    expect(rest, "die Stundensperre muss die Minutensperre ueberstimmen").toBeGreaterThan(120);
    vi.useRealTimers();
  });

  it("gateGesperrt macht keinen Datenbankzugriff — Quelltext-Scan", async () => {
    /*
     * ⛔ SPEC:3013-3019, EIGENSCHAFT 1, WOERTLICH: „`gateGesperrt` liest nur, kein
     * DB-Zugriff — UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT."
     *
     * Der Scan ist DATEIWEIT und deshalb streng: diese Datei darf ueberhaupt keinen
     * Datenbankzugriff kennen. Ein Import von `_db/client` oder `getDb` waere die
     * naheliegende „Verbesserung" (etwa: die Sperre in einer Tabelle fuehren, damit sie
     * einen Neustart ueberlebt) — und sie machte aus der Vorpruefung genau den
     * Datenbankzugriff, den sie deckeln soll.
     */
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    /*
     * ⛔ DER SCAN LIEST DEN ROHTEXT, ALSO AUCH DIE KOMMENTARE — und Schritt 3 dieser
     * Aufgabe verlangt eine Begruendung IM KOPF der Datei. Schriebe jemand dort „kein
     * Import von `getDb`", faerbte er den Scan auf seiner eigenen Begruendung rot. Der
     * Bestand hat genau diese Lehre gezogen (`riegel.test.ts:152-155`).
     *
     * ⛔ AUFLAGE AN SCHRITT 3, DAMIT DER SCAN NICHT AUFGEWEICHT WERDEN MUSS: der
     * Kopfkommentar von `gateSchranke.ts` nennt die drei verbotenen Zeichenketten NICHT
     * beim Namen — er schreibt „kein Datenbankzugriff, in keiner Form". Dieselbe Form
     * wie bei `Math.random` in A2.
     */
    const quelle = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/gateSchranke.ts"), "utf8");
    expect(quelle, "gateGesperrt schuetzt den DB-Zugriff, sie darf ihn nicht selbst tun")
      .not.toMatch(/\bgetDb\b|_db\/client|drizzle/);
  });
});
