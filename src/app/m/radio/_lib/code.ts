/**
 * DER CODERAUM DES ZUGANGS: 28 Zeichen Crockford-Base32 in sieben Vierergruppen
 * (Spec 1 §3.2.1, `docs/superpowers/specs/2026-08-17-radio-modul-design.md:2053-2124`).
 *
 * KEIN "use client" in dieser Datei — Falle 6 (`CLAUDE.md`): ein WERT aus einem
 * Client-Modul kommt in einer Server Component nicht an, sondern als Client-Referenz,
 * HTTP 500 fuer die ganze Seite. `pnpm build` sieht es nicht, und Vitest KANN es
 * strukturell nicht sehen. Durchgesetzt von `src/app/m/radio/riegel.test.ts:786-805`.
 * ⚠️ WER SIE LESEN WIRD, IST ZUKUNFT UND NICHT GEGENWART — heute existiert KEINE dieser
 * Dateien: die Server Actions `_actions/codes.ts` (A8) und `_actions/gate.ts` (A9), der
 * Route Handler `t/[code]/route.ts` (A10), die Formularvalidierung unter `/admin/zugaenge`
 * (Planteil 4). ⛔ NICHT `_lib/schreibpfade/codeEinloesung.ts` (A6): sie normalisiert nicht.
 *
 * ⛔ DIE 28 WIRD NICHT VERKUERZT, UND DAS IST KEIN AESTHETIK-ARGUMENT. Spec:3056-3068,
 * woertlich: „Wer … den Coderaum aus 3.2.1 verkuerzt, macht sie [die CWE-348-Umstellung]
 * zur ECHTEN Voraussetzung — dann gilt Rechnung A, und dann ist die Umstellung
 * blockierend. Die zwei Entscheidungen haengen aneinander und duerfen nicht getrennt
 * geaendert werden."
 *
 * ⚠️ OB RECHNUNG A HEUTE GILT, IST UNBESTIMMT — ⬜ A-L12. Der Befund vom 2026-08-22 sagt
 * nein: auf einem Modul-Host bekommt jede Anfrage denselben Absenderschluessel
 * (`src/core/ratelimit.ts:98-111`). Der Umbau dagegen ist gebaut
 * (`src/core/routing.ts:59-61`). Die Abnahme am Server steht aus
 * (`docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:29-32` — P1 und P6
 * offen). ⛔ Diese Datei setzt KEINE der beiden Antworten voraus. Sie muss es auch nicht:
 * der Coderaum ist die Mauer, die Schranke ist nur die Notbremse. Rechnung B
 * (Spec:2964-2969) rechnet bei 28 Zeichen 2,2 × 10^28 Jahre OHNE jede Schranke bei 10^6
 * Versuchen je Sekunde.
 */

/**
 * Die Laenge des Codes OHNE Bindestriche, in Zeichen. 28 × 5 bit = 140 bit Entropie —
 * die kleinste Vielfache-von-vier-Laenge ueber der 128-bit-Schwelle aus
 * `docs/radio-portierung-analyse.md:476-480` (24 Zeichen waeren 120 bit und rissen sie,
 * 26 traefen 130 bit und braechen die Vierergruppierung).
 *
 * ⛔ EINE EINZIGE KONSTANTE FUER ALLE DREI FUNKTIONEN. Erzeuger, Normalisierung und
 * Praedikat lesen von hier; drei eigene Zahlen liefen auseinander, und der Schaden waere
 * still: ein frisch ausgestellter Code bestuende die Formularvalidierung nicht.
 */
const CODE_LAENGE = 28;

/** Zeichen je Gruppe. Sieben Gruppen à vier ergeben die kanonische Form. */
const GRUPPEN_LAENGE = 4;

/**
 * 32 Zeichen. Crockford-Base32: OHNE I, L, O, U (Spec:2062-2063, woertlich uebernommen).
 *
 * Die vier fehlen KONSTRUKTIV, nicht durch eine Nachbehandlung: `1`/`I`/`l`, `0`/`O` und
 * das versehentlich gelesene `U` sind damit nicht verwechselbar (Spec:2073-2076). Das ist
 * die Verwechslungsfestigkeit fuer den Ausweichweg Handeingabe; der Regelweg ist der Scan.
 */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Setzt eine bindestrichfreie Zeichenkette in Gruppen zu `GRUPPEN_LAENGE`.
 *
 * ⛔ EIN HELFER UND NICHT ZWEIMAL ABGESCHRIEBEN: `erzeugeCode` und `normalisiereCode`
 * muessen dieselbe Gestalt liefern, sonst findet die Gleichheitssuche im Schreibpfad
 * (A6) einen frisch ausgestellten Code nicht wieder. Der Bindestrich ist TEIL DES
 * GESPEICHERTEN WERTS, nicht der Anzeige (Spec:2055-2059); die Spalte `zugangscodes.code`
 * traegt kein `COLLATE NOCASE` und wird nie normalisiert
 * (`src/app/m/radio/_db/schema.ts:166-171`).
 */
function gruppiere(zeichen: string): string {
  const gruppen: string[] = [];
  for (let i = 0; i < zeichen.length; i += GRUPPEN_LAENGE) {
    gruppen.push(zeichen.slice(i, i + GRUPPEN_LAENGE));
  }
  return gruppen.join("-");
}

/**
 * Ein neuer Zugangs-Code in kanonischer Form.
 *
 * ⛔ DIE QUELLE IST `crypto.getRandomValues` — Web Crypto, unter Node 26.7.0 global
 * (gemessen am 2026-08-22 mit `node -e` auf `process.version` und
 * `typeof crypto.getRandomValues`: `v26.7.0 object function`). BEWUSST KEIN
 * `node:crypto`-Import: der machte die Datei in einer kuenftigen Edge-Umgebung
 * unbrauchbar. Die nicht-kryptografische Standardquelle ist hier verboten (Spec:2089-2091)
 * — sie liefert Codes mit der richtigen Laenge und dem richtigen Alphabet, besteht also
 * jeden Verhaltenstest, und die Vorhersagbarkeit wird erst mit Kenntnis mehrerer
 * ausgestellter Codes messbar. Deshalb bewacht `code.test.ts` sie mit einem
 * QUELLTEXT-SCAN und nicht mit einem Verhaltensfall.
 *
 * ⛔ `b % 32` IST HIER BIAS-FREI, UND DAS IST DER GRUND, WARUM DAS ALPHABET 32 ZEICHEN
 * HAT UND NICHT 33: 256 = 8 × 32, jedes Byte faellt also auf genau acht Bytewerte je
 * Zeichen. Bei einer Alphabetlaenge, die 256 nicht teilt, bevorzugte der Rest die ersten
 * Zeichen — der Coderaum SCHRUMPFTE, ohne dass Laenge oder Alphabet sich aenderten.
 * ⚠️ WER DAS HIER ZU EINER REJECTION-SCHLEIFE „REPARIERT", verbessert nichts: sie
 * verwuerfe Bytes, die nie verworfen werden muessen, und macht die Laufzeit unbestimmt.
 * `code.test.ts` haelt die Gleichverteilung mit einer groben Schranke fest.
 */
export function erzeugeCode(): string {
  const bytes = new Uint8Array(CODE_LAENGE);
  crypto.getRandomValues(bytes);
  let zeichen = "";
  for (const b of bytes) zeichen += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return gruppiere(zeichen);
}

/**
 * Eingabe → Erzeugerform. Reihenfolge verbindlich (Spec:2093-2098): `trim` →
 * `toUpperCase` → `I`/`L`→`1`, `O`→`0` → alles ausser `[0-9A-Z]` entfernen → bei GENAU
 * `CODE_LAENGE` Zeichen gruppieren, sonst unveraendert zurueck.
 *
 * ⛔ SIE WIRFT NIE. Der Wert kommt aus einer URL oder einem Formularfeld; ein Wurf machte
 * aus einem Tippfehler einen 500 im Route Handler (Spec:2093-2098;
 * Bauform-Zulaessigkeitstafel Zeile 9, `.superpowers/sdd/planteil3/briefs/KOPF.md:350`).
 *
 * SIE BILDET ZURUECK, STATT ZU VERWERFEN. Wer vom Ausdruck abliest und `O` statt `0`
 * tippt, bekommt einen Treffer, keinen Fehler (Spec:2077-2079). Damit kann die
 * Normalisierung nur Treffer HINZUFUEGEN, nie einen bestehenden verlieren — genau deshalb
 * ist sie sicher; die Suche laeuft auf Gleichheit gegen `zugangscodes.code`, und die
 * Spalte wird nicht aufgeweicht (Spec:2105-2108, Vorbild
 * `src/app/m/lagerbuch/_lib/code.ts:4-8`).
 *
 * ⛔ SONST UNVERAENDERT HEISST: DIE GEREINIGTE ZEICHENKETTE, UNGRUPPIERT — nicht die rohe
 * Eingabe. Wer stattdessen jede Laenge gruppierte, machte aus einem Tippfehler eine
 * Zeichenkette, die AUSSIEHT wie ein Code (Spec:2097).
 *
 * Der `[^0-9A-Z]`-Filter ist bewusst weiter als das Alphabet: er entfernt Bindestriche,
 * Leerzeichen und Trennzeichen jeder Art, laesst aber ein `U` stehen — ein Zeichen, das
 * im Alphabet gar nicht vorkommt (Spec:2062-2063). `code.test.ts:212-233` haelt diese
 * Breite als Entscheidung fest.
 *
 * ⛔ DAS `.trim()` UNTEN BLEIBT, OBWOHL ES KEINEN ZEUGEN HABEN KANN — und der Grund steht
 * hier, damit der naechste Leser es nicht „aufraeumt". Jedes Zeichen, das `trim()`
 * entfernt, ist Leerraum, und Leerraum faellt ohnehin am `[^0-9A-Z]`-Filter vier Zeilen
 * spaeter: der Filter SUBSUMIERT es. Kein Eingabewert kann seine Anwesenheit von seiner
 * Abwesenheit unterscheiden, also kann auch kein Test es tun (gemessen, Fund F6,
 * `.superpowers/sdd/planteil3/REVIEW-A2.md`: die Zeile gestrichen, 19 von 19 gruen).
 * Die Zeile steht allein wegen der WOERTLICHEN Reihenfolge der Spec (Spec:2093-2098), und
 * Spec-Woertlichkeit ist an dieser Stelle der Zweck.
 *
 * ⚠️ FOLGE FUER A6 UND A10: das Ergebnis dieser Funktion ist eine SUCHANFRAGE, keine
 * zugesicherte Form. `istCodeForm` kann es verwerfen. Ueber die Gueltigkeit entscheidet
 * die Gleichheitssuche gegen `zugangscodes.code`, nicht diese Funktion.
 */
export function normalisiereCode(roh: string): string {
  const nur = roh
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/[^0-9A-Z]/g, "");
  return nur.length === CODE_LAENGE ? gruppiere(nur) : nur;
}

/**
 * Praedikat auf die KANONISCHE Form — also auf das ERGEBNIS von `normalisiereCode`, nicht
 * auf die Eingabe (Spec:2101-2103). Fuer die Formularvalidierung in Kapitel 5
 * (Planteil 4, `/admin/zugaenge`).
 *
 * ⛔ SIE RUFT `normalisiereCode` NICHT. Ein Praedikat, das erst normalisiert, naehme jede
 * Eingabe an, die sich in die kanonische Form bringen LAESST — und beantwortete damit eine
 * andere Frage als die gestellte. Die Formularvalidierung will wissen, ob der Wert, der
 * gespeichert wird, die Erzeugerform hat.
 *
 * Sie prueft ueber `gruppiere` und `CODE_LAENGE` statt ueber ein eigenes Muster, damit sie
 * mit dem Erzeuger nicht auseinanderlaufen kann.
 */
export function istCodeForm(wert: string): boolean {
  const ohneTrenner = wert.split("-").join("");
  if (ohneTrenner.length !== CODE_LAENGE) return false;
  for (const z of ohneTrenner) if (!CODE_ALPHABET.includes(z)) return false;
  return wert === gruppiere(ohneTrenner);
}
