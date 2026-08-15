/*
 * ZEIT UND KALENDER — die eine Stelle. KEIN "use client".
 *
 * DIE ZONE STEHT GENAU HIER. In UTC gerechnet liefert `isoTag` zwischen 00:00
 * und 02:00 deutscher Sommerzeit den VORTAG, und davon haengen die
 * Ueberfaelligkeitsrechnung und die „heute"-Markierung im Wochenplan ab.
 *
 * DIE TAGESARITHMETIK RECHNET DAGEGEN IN UTC UM 12:00 — bewusst.
 * `montagDerWoche` und `wochenTage` verschieben KALENDERTAGE, und ein
 * Tageswechsel um Mittag kreuzt keine Sommerzeitgrenze. In Ortszeit muesste jede
 * Verschiebung die Umstellungsnacht behandeln, in der ein Tag 23 oder 25 Stunden
 * hat.
 */

export const ZONE = "Europe/Berlin";

/** `en-CA` ist das Gebietsschema mit dem Format `YYYY-MM-DD` — kein eigener Zusammenbau. */
const ISO_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Der Kalendertag, an dem dieser Zeitpunkt in Deutschland liegt. */
export function isoTag(zeitpunkt: Date): string {
  return ISO_FORMAT.format(zeitpunkt);
}

/** 12:00 UTC des genannten Tages — der sommerzeitfeste Anker fuer Tagesarithmetik. */
function anker(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function ausAnker(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 0 = Montag … 4 = Freitag; Samstag und Sonntag ergeben `null` — das Modul kennt
 * eine Fuenftagewoche, und eine 5 waere ein Index neben das Wochengitter.
 */
export function wochentagVon(iso: string): number | null {
  const tag = anker(iso).getUTCDay();
  return tag >= 1 && tag <= 5 ? tag - 1 : null;
}

/**
 * Der Montag der Woche, in der dieser Tag liegt.
 *
 * `getUTCDay()` gibt am Sonntag 0. Ein naives `tag - wochentag + 1` landet dann
 * auf dem Montag der FOLGENDEN Woche — fachlich gehoert der Sonntag zur Woche,
 * die am Montag davor begann.
 */
export function montagDerWoche(iso: string): string {
  const d = anker(iso);
  const wochentag = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (wochentag === 0 ? -6 : 1 - wochentag));
  return ausAnker(d);
}

/** Montag bis Freitag der Woche, die mit `montagIso` beginnt. */
export function wochenTage(montagIso: string): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = anker(montagIso);
    d.setUTCDate(d.getUTCDate() + i);
    return ausAnker(d);
  });
}

/**
 * `iso`, um `n` Kalendertage verschoben (negativ = rueckwaerts) — ueber denselben
 * sommerzeitfesten Anker wie `wochenTage`. DIE EINE STELLE fuer Tagesarithmetik
 * im Modul: `new Date(Date.now() + n * TAG_MS)` rechnet auf dem rohen Instant und
 * verlegt danach nur die Zone, nicht die Arithmetik — an einer Umstellungsnacht
 * verschiebt sich das Ergebnis um eine Stunde und damit moeglicherweise um einen
 * Kalendertag.
 */
export function tagePlus(iso: string, n: number): string {
  const d = anker(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return ausAnker(d);
}

/** Ein Kalendertag in Millisekunden — nur fuer die Differenz zweier 12:00-UTC-Anker. */
const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * VOLLE KALENDERTAGE VON `von` BIS `bis` (Oberflaechen-Spec 2026-08-16 §6.2) — positiv, wenn `bis`
 * spaeter liegt, negativ sonst. DIE EINE STELLE, DIE „seit N Tagen" RECHNET: `_ui/Frist.tsx` und
 * die Liegezeiten der Fuehrungskarte lesen dieselbe Zahl, und zwei Fassungen liefen an genau der
 * Angabe auseinander, die die Schwere einer Ueberfaelligkeit traegt.
 *
 * UEBER DENSELBEN 12:00-UTC-ANKER WIE `tagePlus`, und das ist keine Formsache: eine Differenz auf
 * dem rohen Instant zweier MITTERNACHTS-Zeitpunkte in Ortszeit ergibt ueber eine
 * Sommerzeitumstellung hinweg 30,96 statt 31 Tage — `Math.floor` machte daraus 30, und die
 * Ueberfaelligkeit waere fuer einen halben Herbst um einen Tag zu klein. Um 12:00 UTC kreuzt keine
 * Verschiebung eine Umstellungsgrenze, die Differenz ist damit exakt ein Vielfaches von 24 Stunden;
 * `Math.round` ist die Absicherung gegen eine kuenftige Schaltsekunde, keine Korrektur.
 */
export function tageZwischen(von: string, bis: string): number {
  return Math.round((anker(bis).getTime() - anker(von).getTime()) / TAG_MS);
}

/**
 * DIE ISO-8601-KALENDERWOCHE eines Tages (Oberflaechen-Spec 2026-08-16 §3.5) — die Kontextzeile der
 * BuFDi beginnt mit „KW <n>", und ohne diese Funktion entstuende die Zahl in der Oberflaeche als
 * zweite, ungeteste Fassung.
 *
 * ISO 8601 RECHNET UEBER DEN DONNERSTAG: die Woche gehoert dem Jahr, in dem ihr Donnerstag liegt.
 * Deshalb wird der Tag zuerst auf den Donnerstag SEINER Woche geschoben und erst dann gegen den
 * 1. Januar DIESES Jahres gezaehlt. Ein naives „Tag des Jahres durch sieben" laege am Jahreswechsel
 * regelmaessig daneben: Fr 01.01.2027 gehoert zu KW 53 des Jahres 2026, nicht zu KW 1 von 2027.
 *
 * `getUTCDay() || 7` macht den Sonntag zur SIEBEN statt zur Null — dieselbe fachliche Zuordnung,
 * die `montagDerWoche` ueber ihren `-6`-Zweig trifft: der Sonntag gehoert zur Woche davor. Ohne
 * diese Zeile stuende am Sonntag die naechste Kalenderwoche in der Kontextzeile, waehrend die Achse
 * darunter die abgelaufene zeigt.
 */
export function kalenderwoche(iso: string): number {
  const d = anker(iso);
  const tag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tag);
  const jahresBeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 12));
  return Math.round((d.getTime() - jahresBeginn.getTime()) / TAG_MS / 7) + 1;
}

const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

/**
 * „Do, 13.08." — nie ISO. Der Wochentag ist bei einer Wochenplanung die
 * eigentliche Information.
 *
 * Eigene Tabelle statt `Intl`: dessen Kurzform traegt einen Punkt („Do.") und
 * die Abkuerzungen sind zwischen ICU-Fassungen nicht stabil — auf einem
 * Linux-Runner also moeglicherweise andere als auf der Entwicklermaschine.
 */
export function fmtTagKurz(iso: string): string {
  const d = anker(iso);
  const tag = String(d.getUTCDate()).padStart(2, "0");
  const monat = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${WOCHENTAGE_KURZ[d.getUTCDay()]}, ${tag}.${monat}.`;
}

/**
 * "HH:MM" seit Mitternacht in Minuten — GEPRUEFT, nicht bloss geparst.
 *
 * BIS AUFGABE 7 HATTE DIESE FUNKTION KEINEN AUFRUFER MIT UNVALIDIERTEN WERTEN.
 * `tagesOrdnung` (`_lib/tagesplan.ts`) ist der erste: `planUhrzeit` und
 * `routinen.uhrzeit` kommen aus der Datenbank und damit letztlich aus einem
 * Formular. Ein leerer String oder eine fehlende ":" ergaben vorher STILL
 * `NaN` — und `NaN` vergleicht sich mit `<`/`>` immer als `false`, macht die
 * stabile Sortierung eines ganzen Tages also unbrauchbar, OHNE dass irgendwo
 * etwas rot wird: die Anker-Reihenfolge zerfaellt lautlos in die urspruengliche
 * Feldreihenfolge.
 *
 * ENTSCHEIDUNG: WERFEN, NICHT AUF DEN TAGESBEGINN ZURUECKFALLEN. Diese Suite
 * behandelt einen fehlerhaften Eingabewert grundsaetzlich als sichtbaren
 * Fehler, nie als leise Ersetzung (vgl. `SeitenKopf` — wirft bei leerem
 * `kontext`, statt eine leere Zeile zu rendern; `routineAmTag` — prueft
 * `undefined` explizit, statt sich auf eine zufaellig richtige `NaN`-Rechnung
 * zu verlassen). Ein Ruecksprung auf `TAGESBEGINN_MINUTEN` waere hier die
 * schlimmere Wahl: er saehe wie ein plausibler Anker aus und wuerde denselben
 * Fehler erzeugen, den `minutenVon` gerade verhindern soll — nur eine Stufe
 * subtiler, weil der Wert jetzt eine echte Uhrzeit TRAEGT statt `NaN` zu SEIN.
 * Diese Funktion ist zudem die letzte Verteidigungslinie, nicht die erste:
 * `planUhrzeit`/`uhrzeit` sollten durch Formularvalidierung (spaetere
 * Aufgaben) nie ungueltig hier ankommen — der Wurf ist die Ausnahmesicherung,
 * die genau das ausspricht, wenn sie doch einmal umgangen wird.
 *
 * DAS MUSTER VERLANGT ZWEI STELLEN FUER STUNDE UND MINUTE — `schema.ts`
 * dokumentiert die Spalten ausdruecklich als "HH:MM", nicht als "H:MM", und
 * `minutenVon` prueft genau den dokumentierten Vertrag, keinen laxeren. Ein
 * Aufrufer, der eine einzelne Ziffer braucht, aendert das hier bewusst, statt
 * dass die Pruefung stillschweigend mehr zulaesst, als die Spalte verspricht.
 */
/**
 * DER MONTAG AUS DEM SUCHPARAMETER `woche` (Aufgabe 13) — oder die aktuelle Woche, wenn der
 * Parameter fehlt oder kein verwertbares Kalenderdatum ist. `montagDerWoche`/`anker` werfen ueber
 * `toISOString` bei einer echten Invalid Date (z. B. `param === "abc"`); der `try/catch` faengt
 * genau das. EIN URL-PARAMETER IST KEIN FORMULARFELD: eine grobe Fehleingabe (auch ein Tag, den
 * es laut `_lib/eingabe.ts`s `istGueltigerIsoTag` gar nicht gibt, z. B. „2026-02-30", das JS
 * still auf den 2. Maerz vorrollt) zeigt hier bewusst eine nahegelegene Woche statt einer
 * Fehlerseite — anders als ein Formularfeld verlangt eine Adresszeile keine Feldablehnung.
 */
export function montagAusParam(param: string | undefined, heute: string): string {
  if (!param) return montagDerWoche(heute);
  try {
    return montagDerWoche(param);
  } catch {
    return montagDerWoche(heute);
  }
}

/**
 * DER AUSGEWAEHLTE TAG FUER DEN MOBILEN TAGESWAEHLER (Aufgabe 13, Spec §9.6) — der Suchparameter
 * `tag`, wenn er EINER DER FUENF TAGE der angezeigten Woche ist (das schliesst einen manipulierten
 * oder veralteten Wert automatisch aus, ohne eine zweite Gueltigkeitspruefung); sonst „heute", wenn
 * es in dieser Woche liegt; sonst der erste Tag (Montag) — eine kuenftige oder vergangene Woche hat
 * kein „heute" unter ihren fuenf Tagen.
 */
export function ausgewaehlterTag(tage: readonly string[], heute: string, tagParam?: string): string {
  if (tagParam && tage.includes(tagParam)) return tagParam;
  if (tage.includes(heute)) return heute;
  return tage[0]!;
}

/**
 * Numerische Teile eines echten Zeitpunkts in Deutschland — `en-CA` wie `ISO_FORMAT`, wieder wegen
 * der stabilen, rein numerischen Ausgabe, diesmal zusaetzlich mit Uhrzeit. `hourCycle: "h23"`
 * erzwingt 24-Stunden-Anzeige unabhaengig vom Standardverhalten des Gebietsschemas.
 */
const ZEITPUNKT_TEILE = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * „13.08.2026, 09:14" — fuer Verlaufszeilen (`_ui/AktionsZone.tsx`, `a/[id]/page.tsx`), die einen
 * ECHTEN Zeitpunkt zeigen (`verlauf.ts`), nicht einen Kalendertag wie `fmtTagKurz`. Eigene
 * Zusammensetzung aus `formatToParts` statt `format()` direkt: die Satzzeichen ("." und ", ")
 * bleiben damit FEST, unabhaengig davon, welche Interpunktion eine ICU-Fassung fuer „en-CA" waehlt
 * — dieselbe Vorsicht wie bei `fmtTagKurz`, das aus demselben Grund keine Intl-Wochentagsnamen
 * uebernimmt.
 */
export function fmtZeitpunkt(zeitpunkt: Date): string {
  const teile = Object.fromEntries(
    ZEITPUNKT_TEILE.formatToParts(zeitpunkt).map((teil) => [teil.type, teil.value]),
  );
  return `${teile.day}.${teile.month}.${teile.year}, ${teile.hour}:${teile.minute}`;
}

export function minutenVon(uhrzeit: string): number {
  const treffer = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(uhrzeit);
  if (!treffer) {
    throw new Error(`"${uhrzeit}" ist keine gueltige Uhrzeit im Format HH:MM.`);
  }
  return Number(treffer[1]) * 60 + Number(treffer[2]);
}

/**
 * Die Umkehrung von `minutenVon` — fuer die Anker-Spur der Tagesordnung
 * (`_ui/Wochenplan.tsx`), die nur echte Anker anzeigt und dafuer ihre
 * Uhrzeit als Text braucht. Nimmt bewusst KEINE Tagesgrenze an (1500 Minuten
 * ergeben "25:00"): eine spaete Routine ueber Mitternacht ist eine denkbare
 * Eingabe, und ein Modulo-Wrap waere die still falsche Uhrzeit.
 */
export function fmtUhrzeit(minuten: number): string {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
