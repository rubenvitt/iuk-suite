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

/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise: die
 * Zeilenzahl bleibt gleich, damit eine `datei:zeile`-Meldung weiter stimmte.
 *
 * ⚠️ OHNE DAS IST DER DB-SCAN WEITER UNTEN AUF SEINER EIGENEN BEGRUENDUNG ROT — der
 * Kopfkommentar von `gateSchranke.ts` muss erklaeren duerfen, was er verbietet. Gemessen
 * als Fund W4 in `REVIEW-A3.md`: ein blosser Beleg-Kommentar faerbte die erste Fassung
 * rot, waehrend ein ECHTER Zugriff mit neutral formuliertem Kommentar gruen blieb.
 *
 * ⛔ ZEICHENGLEICH AUS DEM BESTAND UEBERNOMMEN (`src/app/m/radio/riegel.test.ts:181-201`,
 * Begruendung dort `:148-162`). Testdateien halten in diesem Repo jede ihre eigene Kopie
 * — `riegel.test.ts` und `src/app/m/lagerbuch/_lib/bauform.test.ts:142-162` tun es
 * ebenso (Begruendung dort `:124-141`); ein gemeinsames Modul unter `_lib/` waere eine Nicht-Test-Quelldatei und liefe
 * damit selbst in die modulweiten Scans von `riegel.test.ts`.
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 * BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 * Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte
 * damit eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie
 * falsch-negativ und still.
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
    /*
     * Die Trennung ist der ganze Zweck des Absender-Eimers. ⚠️ Ob sie im Betrieb auf
     * einem Modul-Host WIRKT, ist ⬜ A-L12 und unbestimmt (Kopfkommentar oben) — dieser
     * Fall sichert die FUNKTION zu, nicht die Wirkung im Betrieb.
     *
     * ⛔ ER MISST DEN EIMER, NICHT DIE SPERRMAP — und das ist der Unterschied, an dem die
     * erste Fassung dieses Falls vorbeimass (Fund K4 aus `REVIEW-A3.md`, gemessen). Sie
     * pruefte nur, dass B nach As Sperre frei ist; das erfuellt jede nach ihrem Argument
     * geschluesselte `gesperrtBis`-Map auch dann, wenn ALLE Absender in EINEM Eimer
     * liegen. Deshalb steht hier B's VOLLES eigenes Budget: fuenf Buchungen ohne Sperre,
     * und erst die sechste sperrt. Kollabiert der Eimerschluessel, ist B schon nach
     * seiner ERSTEN Buchung gesperrt, weil der gemeinsame Eimer durch A voll ist.
     */
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) gateFehlversuchBuchen("cf:1.2.3.4");   // 6, nicht 5 — Kopfkommentar
    expect(gateGesperrt("cf:1.2.3.4")).not.toBeNull();
    expect(gateGesperrt("cf:9.9.9.9"), "B darf von As Sperre nicht beruehrt sein").toBeNull();

    // B hat sein eigenes Budget noch VOLL — fuenf Buchungen, und nach jeder ist B frei.
    for (let i = 0; i < 5; i++) {
      gateFehlversuchBuchen("cf:9.9.9.9");
      expect(gateGesperrt("cf:9.9.9.9"), `B nach ${i + 1} eigenen Fehlversuchen`).toBeNull();
    }
    // Und erst die sechste sperrt B — sein Eimer ist ein anderer als der von A.
    gateFehlversuchBuchen("cf:9.9.9.9");
    expect(gateGesperrt("cf:9.9.9.9"), "erst der 6. eigene Fehlversuch sperrt B")
      .not.toBeNull();
    expect(gateGesperrt("cf:203.0.113.7"), "ein dritter Absender bleibt frei").toBeNull();
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
     * Absender-Eimer kurzschliessen (`gateSchranke.ts:218-219`) und den modulweiten Zaehler
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
     * ⛔ ABWEICHUNG VOM PLAN, GEMESSEN (Fund W3 aus `REVIEW-A3.md`). Die Planfassung
     * dieses Falls stellte die Uhr sechzigmal um 61 s vor und buchte je fuenf
     * Fehlversuche. Dabei sah `gateMinute` je Fenster hoechstens fuenf Treffer und
     * ERREICHTE DIE 30 NIE — es entstand also nie eine Minutensperre, ueber die der
     * Stundenzaehler haette hinaustragen koennen. Gemessen: entfernt man die
     * `gateMinute`-Stufe GANZ, blieb die Planfassung GRUEN. Ein Fall, der gruen bleibt,
     * wenn es den Zaehler gar nicht mehr gibt, dessen Sperre er ueberdauern soll,
     * bewacht die Zusage seines Namens nicht.
     *
     * ⛔ DIE TRAGENDE FASSUNG: ZEHN RUNDEN, JEDE MIT EINER ECHTEN MINUTENSPERRE. Je
     * Runde 31 Buchungen von sieben rotierenden Absendern — sechs mal fuenf = 30 gehen
     * bis in `gateMinute` durch, die 31. sieht `30 >= 30`, gibt `false` und sperrt
     * MODULWEIT_MIN fuer 60_000 ms. ⚠️ Genau diese 31. Buchung erreicht `gateStunde`
     * NICHT (`gateSchranke.ts:222` kehrt im `false`-Zweig zurueck) — je Runde kommen
     * also 30 Treffer im Stundeneimer an, nach zehn Runden 300.
     *
     * ⛔ 61_000 MS RUNDENABSTAND, DAMIT DIE MINUTENSPERRE JEDESMAL WIRKLICH ABLAEUFT:
     * ihre Deadline liegt bei `r*61_000 + 60_000` und damit 1_000 ms VOR dem Beginn der
     * naechsten Runde. Der Fall sichert beides zu — dass sie DA ist (`toBe(60)` direkt
     * nach der 31. Buchung) und dass sie WEG ist (`toBeNull()` zu Beginn der naechsten
     * Runde). Ueber alle zehn Runden traegt der Stundenzaehler unterdessen weiter.
     *
     * ⚠️ `vi.setSystemTime` und NICHT ein injizierter `now`-Parameter:
     * `gateGesperrt`/`gateFehlversuchBuchen` nehmen keinen — ihre Signatur ist von der
     * Spec gesetzt (Spec:3001-3003), und ein zusaetzlicher Testparameter waere eine Naht,
     * die im Betrieb niemand benutzt.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();

    for (let r = 0; r < 10; r++) {
      vi.setSystemTime(new Date(start.getTime() + r * 61_000));
      expect(gateGesperrt("cf:10.9.9.9"), `zu Beginn von Runde ${r} ist nichts gesperrt`)
        .toBeNull();
      for (let a = 0; a < 6; a++) {
        for (let i = 0; i < 5; i++) gateFehlversuchBuchen(`cf:10.${r}.${a}.1`);
      }
      // Die 31. Buchung der Runde, von einem SIEBTEN Absender — sie sperrt modulweit
      // fuer eine Minute und erreicht den Stundeneimer nicht.
      gateFehlversuchBuchen(`cf:10.${r}.6.1`);
      expect(gateGesperrt("cf:10.9.9.9"), `die Minutensperre der Runde ${r} steht`)
        .toBe(60);
    }

    /*
     * Zehn Runden x 30 Treffer = 300 im Stundeneimer, alle innerhalb der gleitenden
     * Stunde (die aelteste liegt 610_000 ms zurueck, das Fenster ist 3_600_000 ms lang).
     * Die Minutensperre der zehnten Runde ist bei `9*61_000 + 60_000 = 609_000`
     * abgelaufen — es steht jetzt NICHTS mehr, und genau das ist die Stelle, an der die
     * Zusage dieses Falls faellt oder haelt.
     */
    vi.setSystemTime(new Date(start.getTime() + 10 * 61_000));
    expect(gateGesperrt("cf:10.9.9.9"), "die Minutensperren sind alle abgelaufen")
      .toBeNull();

    // Die 301. Buchung, von einem frischen Absender: `gateStunde` sieht 300 >= 300.
    gateFehlversuchBuchen("cf:10.20.0.1");
    expect(gateGesperrt("cf:10.9.9.9"), "der Stundendeckel muss greifen").toBe(3600);
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
     * Spec:3020-3021: „Rueckgabe `number | null`, NIE 0 — `if (gateGesperrt(x))` waere in
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
     * ⛔ DIE GLEITENDE-FENSTER-LUECKE (Spec:3022-3031). `RateLimiter.check()` ist ein
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
     * haengen (`gateSchranke.ts:219`) und erreicht den modulweiten Zaehler nie — mit
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
     *
     * ⛔ ABWEICHUNG VOM PLAN, GEMESSEN (Fund W2 aus `REVIEW-A3.md`). Die Planfassung
     * brachte nie ZWEI der drei Sperren gleichzeitig in Kraft — `Math.max` ueber drei
     * Glieder hatte damit jedes GLIED bewacht und die AUSWAHL von nichts. Gemessen:
     * `Math.max(a, b, c)` durch „das erste Glied ungleich null" ersetzt, und die
     * Planfassung blieb GRUEN. Genau dieser Schaden ist gemeint: ein Absender mit 60 s
     * Restsperre laese „noch 60 Sekunden", waehrend der Stundendeckel noch 3600 s haelt.
     *
     * ⛔ DESHALB STEHEN HIER ZWEI SPERREN GLEICHZEITIG, mit VERSCHIEDENEN Deadlines, und
     * die Zusicherung ist `toBe(<die groessere Zahl>)` — nicht `toBeGreaterThan(120)`.
     * Eine lasche Zusicherung auf einem deterministischen Wert ist die Form, gegen die
     * dieser ganze Weg gebaut ist.
     *
     * Die Rechnung, die jede Zahl traegt:
     *   59 Fenster x 5 Fehlversuche = 295 Treffer im Stundeneimer, das letzte Fenster bei
     *              t = 58*61_000 = 3_538_000. `gateMinute` sieht je Fenster nur fuenf und
     *              sperrt nie.
     *   t=3_599_000  A bucht sechsmal. Die ersten fuenf laufen bis in den Stundeneimer
     *              (296..300); die sechste sieht `5 >= 5` am EIGENEN Eimer, gibt `false`
     *              und sperrt A bis 3_659_000. → nur A ist gesperrt, Restzeit 60 s.
     *   t=3_599_000  ein FRISCHER Absender bucht die 301. — `gateStunde` sieht `300 >= 300`
     *              (cutoff = -1_000, alle 300 Treffer liegen im gleitenden Fenster) und
     *              sperrt MODULWEIT_STD bis 7_199_000. → jetzt stehen ZWEI Sperren fuer A:
     *              die eigene mit 60 s und die modulweite mit 3600 s.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let m = 0; m < 59; m++) {
      vi.setSystemTime(new Date(start.getTime() + m * 61_000));
      for (let i = 0; i < 5; i++) gateFehlversuchBuchen(`cf:10.1.${m}.1`);
    }

    vi.setSystemTime(new Date(start.getTime() + 59 * 61_000));
    for (let i = 0; i < 6; i++) gateFehlversuchBuchen("cf:198.51.100.7");
    expect(gateGesperrt("cf:198.51.100.7"), "erst steht NUR die eigene Sperre von A")
      .toBe(60);

    gateFehlversuchBuchen("cf:10.2.0.1");                 // die 301., von einem frischen Absender
    expect(gateGesperrt("cf:10.2.0.1"), "die Stundensperre steht modulweit").toBe(3600);
    expect(gateGesperrt("cf:198.51.100.7"),
      "A hat zwei Sperren — die groessere von 60 und 3600 muss gewinnen").toBe(3600);
    vi.useRealTimers();
  });

  it("gateGesperrt macht keinen Datenbankzugriff — Quelltext-Scan", async () => {
    /*
     * ⛔ SPEC:3015-3019, EIGENSCHAFT 1, WOERTLICH: „`gateGesperrt` liest nur und braucht
     * keinen Datenbankzugriff — UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT."
     *
     * Der Scan ist DATEIWEIT und deshalb streng: diese Datei darf ueberhaupt keinen
     * Datenbankzugriff kennen. Ein Import der Datenhaltung waere die naheliegende
     * „Verbesserung" (etwa: die Sperre in einer Tabelle fuehren, damit sie einen Neustart
     * ueberlebt) — und sie machte aus der Vorpruefung genau den Datenbankzugriff, den sie
     * deckeln soll.
     *
     * ⛔ ZWEI FUNDE AUS `REVIEW-A3.md`, BEIDE GEMESSEN, BEIDE HIER BEHOBEN:
     *
     * W1 — die erste Fassung suchte nur nach `getDb`, `_db/client` und `drizzle`. Ein
     * ECHTER Datenbankzugriff ueber `@/core/db` (`openModuleDatabase(moduleDbPath(...))`,
     * gebaut nach dem Muster von `src/app/m/lagerbuch/_db/client.ts:1`) ging daran
     * vorbei: der Scan blieb GRUEN, waehrend genau das passierte, was er verbietet.
     * Deshalb faengt er jetzt die QUELLE eines Imports ab und nicht nur benannte Symbole
     * — jeder Bezug auf `_db`, `@/core/db`, `drizzle` oder `better-sqlite3`, egal ob als
     * `import ... from`, als dynamisches `import(...)` oder als `require(...)`.
     *
     * W4 — die erste Fassung las den ROHTEXT und faerbte damit auf PROSA statt auf
     * Anweisungen: ein Kommentar, der eine der Zeichenketten nannte, machte sie rot,
     * OHNE dass die Datei zugriff (gemessen: der Beleg-Kommentar einer Sonde reichte).
     * Deshalb werden die Kommentare jetzt VOR dem Vergleich geleert, mit demselben
     * Werkzeug, das der Bestand dafuer haelt (`src/app/m/radio/riegel.test.ts:181-201`,
     * Begruendung dort `:148-162`). ⛔ FOLGE: die Auflage aus A3 Schritt 3.6, der
     * Kopfkommentar von `gateSchranke.ts` duerfe die verbotenen Zeichenketten nicht beim
     * Namen nennen, ist damit GEGENSTANDSLOS — der Scan sieht Kommentare nicht mehr.
     *
     * ⚠️ ZWEI GRENZEN, DIE DIESER SCAN NICHT SCHLIESST, und sie sind hier benannt statt
     * verschwiegen:
     *  (a) `ohneKommentare` laesst einen NACHGESTELLTEN `// …` am Ende einer Codezeile
     *      bewusst stehen (`riegel.test.ts:175-179`: ein naiver Stripper koennte eine
     *      Verletzung VERSTECKEN). Ein nachgestellter Kommentar, der eine der
     *      Zeichenketten nennt, faerbt den Scan also weiterhin. Das ist die gewollte
     *      Richtung: laut und falsch-positiv, nie still und falsch-negativ.
     *  (b) Ein Quelltext-Scan sieht keinen Zugriff, der TRANSITIV ueber ein anderes
     *      `_lib/`-Modul erreicht wird. Die Auflage aus A3 ist dateiweit, also ist das
     *      ausserhalb dieses Falls — aber Eigenschaft 1 ist damit nicht restlos bewacht.
     */
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const roh = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/gateSchranke.ts"), "utf8");
    const quelle = ohneKommentare(roh);

    /*
     * Die QUELLE jedes Imports — `_db` deckt `_db/client`, `_db/schema` und jeden weiteren
     * Pfad darunter mit ab.
     *
     * ⛔ DAS `\(?` IST KEIN SCHOENHEITSFEHLER, ES SCHLIESST EINE GEMESSENE LUECKE. Die
     * Fassung davor verlangte vor der Zeichenkette ein `from`, ein `import(` oder ein
     * `require(` — ein REINER NEBENWIRKUNGS-IMPORT (`import "@/core/db";`,
     * `import "../_db/client";`) ging daran vorbei, weil er weder das eine noch das andere
     * traegt. Gemessen als Sonde R9 der Fix-Runde 2; die Zahlen stehen im Rumpf des Commits
     * `9880988` — verfolgt, anders als `.superpowers/`. Dieselbe Kopie von `gateSchranke.ts`
     * mit `import "@/core/db";` im Kopf blieb unter der alten Fassung `Tests 10 passed` und
     * faerbt unter dieser `Tests 1 failed | 9 passed` an genau dieser Zusicherung.
     *
     * ⚠️ WIE GROSS DIE LUECKE WIRKLICH WAR, damit sie hier nicht groesser aussieht als sie
     * ist: `import "drizzle-orm/better-sqlite3";` fiel schon vorher, aber an der ZWEITEN
     * Zusicherung unten — `drizzle` ist dort ein benanntes Symbol. Offen waren nur die
     * Formen ohne eines der Symbole im Pfad, also `@/core/db` und `_db/...`.
     *
     * ⚠️ UND WAS EIN SOLCHER IMPORT HEUTE TAETE: nichts. `src/core/db/index.ts:1-36` oeffnet
     * auf Modulebene keine Datenbank, ein Nebenwirkungs-Import bindet kein Symbol und kann
     * fuer sich keinen Lookup ausfuehren. Der Scan sichert aber die staerkere Zusage zu —
     * diese Datei KENNT die Datenhaltung ueberhaupt nicht — und die haelt auch dann noch,
     * wenn `core/db` eines Tages beim Laden etwas tut.
     */
    expect(quelle, "kein Import aus der Datenhaltung — in keiner Form")
      .not.toMatch(/(?:from|import|require)\s*\(?\s*["'`][^"'`]*(?:_db|@\/core\/db|drizzle|better-sqlite3)/);
    // Und die benannten Symbole, falls jemand sie ueber einen anderen Weg hereinholt.
    expect(quelle, "gateGesperrt schuetzt den DB-Zugriff, sie darf ihn nicht selbst tun")
      .not.toMatch(/\b(?:getDb|getModuleDb|openModuleDatabase|moduleDbPath|drizzle)\b/);
  });
});
