import { withAuditContext } from "@/core/audit/server";
import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import type { DB } from "../../_db/client";
import { newId, tokens } from "../../_db/schema";
import { etikettOrte, type EtikettOrtZeile } from "../lesepfade/ortEtiketten";
import { gruppiereCode, istLangerCode } from "../code";
import { TOKEN_ALPHABET, TOKEN_ZEICHEN, TOKEN_ZIEHUNGEN } from "../tokenForm";

/**
 * DIE ORTSCODES — DRK-406. Ein aktiver Zugangs-Code je Ortskarte, ohne
 * Handgriff erzeugt und einzeln zurücksetzbar.
 *
 * SIE LIEGT UNTER `_lib/schreibpfade/`, WEIL SIE SCHREIBT (§2.1 h ist
 * kategorisch). Sie liegt NICHT in `_actions/`, und das ist keine
 * Geschmacksfrage: eine `"use server"`-Datei macht aus JEDEM Export eine
 * global aufrufbare Server Action. `ziehFreienCode` von dort exportiert wäre
 * ein Endpunkt, der auf Zuruf Codes zieht.
 *
 * ⚠️ KEIN "use client" (Falle 6) und KEIN Icon-Import (Falle 7): drei Aufrufer,
 * alle serverseitig — die Ortsetiketten-Seite, das Anlegen einer Einheit und
 * die Zurücksetz-Action. Das SPERREN steht bewusst nicht hier, sondern in
 * `tokenSperre.ts` — Begründung dort, kurz: es braucht die Ziehung nicht.
 *
 * ⚠️ DIE MENGE DER ORTE KOMMT AUS `etikettOrte`, NICHT AUS EINER EIGENEN
 * ABFRAGE. Das ist dieselbe Zusage, die der Kopf jener Datei schon für den
 * Etikettenbogen und die Weiche `o/[ortId]` ausschreibt: eine zweite
 * `where`-Klausel hier ergäbe irgendwann eine Karte ohne Code oder einen Code
 * ohne Karte — und beides fällt erst auf dem Papier auf.
 */

/**
 * DIE ZIEHUNG. Wortgleich aus `_actions/tokens.ts` hierher gezogen, wo sie bis
 * DRK-406 als modulprivate Funktion neben `createToken` stand; jene Action ist
 * mit dem Anlegen von Hand entfallen.
 *
 * ENTSCHEIDUNG 8-F: Die Kollisionsprüfung läuft gegen ALLE vorhandenen Zeilen,
 * ohne `aktiv`-Bedingung. Das ist beim Zurücksetzen die tragende Zeile: ein
 * missbrauchter Code wird gesperrt und bleibt damit für immer belegt — er kann
 * nie wieder gezogen werden und nie wieder eine Karte treffen, von der jemand
 * ein Foto hat. Eine Ziehung nur gegen die aktiven Zeilen machte das
 * Zurücksetzen auf Dauer wirkungslos.
 *
 * Gibt `null` zurück, wenn nach `TOKEN_ZIEHUNGEN` Versuchen kein freier Code
 * gefunden ist — sie wirft nicht, die Aufrufer verwandeln das in einen
 * benannten deutschen Fehler.
 *
 * ⚠️ `customAlphabet` AUS nanoid, NIE `Math.random()`. Seit DRK-442 IST der
 * Coderaum die Abwehr (140 bit, `_lib/tokenForm.ts`): die Schranke laesst eine
 * Eingabe in dieser Form ungebremst an die Datenbank — ein vorhersagbarer
 * Generator naehme dem Coderaum also die EINZIGE Grundlage, die er noch hat.
 * nanoid zieht aus `crypto.getRandomValues` und verteilt gleichmaessig; ein
 * `Math.random()`-Nachbau ist typkorrekt, lint-sauber und in keinem Tor von
 * dieser Zeile zu unterscheiden.
 *
 * ⚠️ DIE KOLLISIONSPRUEFUNG BLEIBT, obwohl sie bei 2^140 nie anschlaegt. Sie
 * ist billig, und sie ist der Riegel gegen einen kaputten Generator — ein
 * `UNIQUE`-Wurf beim `INSERT` waere die schlechtere Fehlerform.
 */
const zeichen = customAlphabet(TOKEN_ALPHABET, TOKEN_ZEICHEN);

function ziehFreienCode(db: DB): string | null {
  for (let versuch = 0; versuch < TOKEN_ZIEHUNGEN; versuch++) {
    // Der Bindestrich ist Teil des GESPEICHERTEN Werts (§4.7), nicht der
    // Anzeige — `normalisiereCode` setzt ihn beim Einlösen wieder ein.
    const code = gruppiereCode(zeichen());
    const belegt = db.select({ id: tokens.id })
      .from(tokens)
      .where(eq(tokens.code, code))
      .get();
    if (!belegt) return code;
  }
  return null;
}

/**
 * WOHIN EIN ORTSCODE FÜHRT — die einzige Stelle, die aus einer Ortszeile die
 * beiden Zielspalten macht.
 *
 * ⚠️ DER HANDLAGER BEKOMMT `zielTyp: null`, UND DAS IST KEINE LÜCKE. `zielTyp`
 * beantwortet „wo landet jemand?", nicht „wem gehört der Code?" — die zweite
 * Frage beantwortet `ortId`. Für den Handlager ist die Landung die
 * Artikelliste, und die ist in `tokenZielPfad` genau der Fall „kein Ziel".
 * Ein erfundener dritter Wert `"lager"` in `tokens.ziel_typ` hätte jede der
 * Stellen, die heute auf `"fahrzeug"` oder `"artikel"` prüft, still auf „weder
 * noch" gestellt — ohne dass eine davon etwas meldet.
 */
function zielSpalten(ort: EtikettOrtZeile): {
  zielTyp: "fahrzeug" | null;
  zielId: string | null;
} {
  return ort.typ === "fahrzeug"
    ? { zielTyp: "fahrzeug", zielId: ort.id }
    : { zielTyp: null, zielId: null };
}

/**
 * DER AKTIVE CODE EINES ORTES, oder `null`.
 *
 * ⚠️ BEIDE BEDINGUNGEN, genau wie im Teilindex: ohne `aktiv` fände die Abfrage
 * die gesperrte Vorgängerzeile eines zurückgesetzten Codes und hielte den Ort
 * für versorgt — die Karte trüge danach dauerhaft einen gesperrten Code.
 */
export function aktiverOrtCode(db: DB, ortId: string): string | null {
  return db.select({ code: tokens.code })
    .from(tokens)
    .where(and(eq(tokens.ortId, ortId), eq(tokens.aktiv, true))!)
    .get()?.code ?? null;
}

/**
 * ⚠️ DER LABEL IST EINE MOMENTAUFNAHME UND WIRD NICHT NACHGEFÜHRT. `label` ist
 * der Anzeigename IM JOURNAL (`_db/schema.ts`), und ein Journal soll den Namen
 * tragen, unter dem eine Buchung entstanden ist — nicht den von heute. Die
 * VERWALTUNG zeigt daneben den aktuellen Ortsnamen, weil sie ihn ohnehin über
 * `ort_id` auflöst; wer eine Tasche umbenennt, sieht dort sofort den neuen.
 */
function ortLabel(ort: EtikettOrtZeile): string {
  return ort.name;
}

function legeAn(db: DB, ort: EtikettOrtZeile, ausstellerSub: string): string | null {
  const code = ziehFreienCode(db);
  if (!code) return null;
  db.insert(tokens).values({
    id: newId(),
    code,
    label: ortLabel(ort),
    ortId: ort.id,
    ...zielSpalten(ort),
    aktiv: true,
    createdAt: new Date(),
    createdBy: ausstellerSub,
  }).run();
  return code;
}

/**
 * ZIEHT NACH, WAS FEHLT — idempotent, rein additiv, für EINEN Ort.
 *
 * Aufrufer ist das Anlegen einer Einheit (`_actions/fahrzeuge.ts`): eine neue
 * Tasche hat ihren Code, bevor jemand zum ersten Mal die Ortsetiketten öffnet.
 *
 * ⚠️ SIE GIBT JEDEN FEHLSCHLAG ALS `null` ZURÜCK UND WIRFT NIE. Das ist der
 * Unterschied, der an dieser Stelle zählt: die Einheit ist das, was jemand
 * anlegen wollte, der Code ist die Beigabe. Ein Wurf machte aus einer
 * erschöpften Ziehung — 20 Fehlversuche in Folge — einen
 * fehlgeschlagenen Anlegevorgang. Der Nachzug beim Öffnen der Ortsetiketten
 * holt es beim nächsten Mal.
 *
 * ⚠️ DER `catch` IST DIE ZWEITE HÄLFTE DIESER ZUSAGE, und er hat gefehlt
 * (Durchsicht zu DRK-406). Ohne ihn galt „wirft nie" nur für die erschöpfte
 * Ziehung — das `INSERT` selbst kann sehr wohl werfen: eine belegte
 * Eindeutigkeit, wenn zwei Anfragen denselben leeren Ort sehen, oder eine
 * gesperrte Datenbank. `createFahrzeug` ruft diese Funktion AUSSERHALB seines
 * eigenen `try`, damit ein fehlgeschlagener Code die angelegte Einheit nicht
 * zurücknimmt — genau dort wäre der Wurf durchgeschlagen und hätte die Aktion
 * abgebrochen, NACHDEM die Einheit schon in der Datenbank stand.
 *
 * ⚠️ DER WETTLAUF-FALL WIRD DABEI RICHTIG BEANTWORTET, nicht nur geschluckt:
 * verliert dieser Aufruf ihn, hat der andere den Code bereits angelegt. Die
 * Karte ist versorgt; `aktiverOrtCode` gibt ihn beim nächsten Blick heraus.
 */
export function stelleOrtCodeSicher(
  db: DB,
  ort: EtikettOrtZeile,
  ausstellerSub: string,
): string | null {
  return versorge(db, ort, ausstellerSub).code;
}

/**
 * ⚠️ `neu` SAGT „DIESER AUFRUF HAT EINGEFUEGT" — nicht „es gibt jetzt einen
 * Code". Gefunden in der Durchsicht, und der Unterschied steht am Ende auf dem
 * Bildschirm: `stelleOrtCodesSicher` zaehlt damit die Karten, die WIRKLICH neu
 * gedruckt werden muessen. Zaehlte es jeden nicht-leeren Rueckgabewert, meldete
 * der Verlierer eines Wettlaufs den Code des Gewinners als seinen eigenen —
 * die Seite naennte eine Zahl zu viel und schickte jemanden zum Drucker fuer
 * eine Karte, die sich nicht geaendert hat.
 *
 * ⚠️ ALLE DREI ZUGRIFFE LIEGEN IM `try`, UND DAS IST DER VERTRAG „wirft nie" —
 * gefunden in der Durchsicht, nachdem ein erster Anlauf nur das `INSERT`
 * abgesichert hatte. Auch eine LESENDE Abfrage wirft, wenn die Datenbank
 * gerade gesperrt ist (`SQLITE_BUSY`), und die erste stand davor. Sie ist
 * damit der wahrscheinlichste Wurf von allen: sie laeuft unmittelbar nach dem
 * `INSERT` der Einheit, also genau dann, wenn der Schreiber noch haelt.
 *
 * ⚠️ AUCH DER RUECKFALL IM `catch` IST EINE ABFRAGE und kann dasselbe tun. Ein
 * `catch`, das selbst wirft, hebt den Vertrag auf, ohne dass es auffiele —
 * `createFahrzeug` ruft ueber `stelleOrtCodeSicher` ausserhalb seines eigenen
 * `try`, und ein durchgeschlagener Wurf meldete der Bedienenden einen
 * Fehlschlag, NACHDEM die Einheit schon stand. Der zweite Versuch legte sie ein
 * zweites Mal an.
 */
function versorge(
  db: DB,
  ort: EtikettOrtZeile,
  ausstellerSub: string,
): { code: string | null; neu: boolean } {
  try {
    const vorhanden = aktiverOrtCode(db, ort.id);
    if (vorhanden) return { code: vorhanden, neu: false };
    const code = legeAn(db, ort, ausstellerSub);
    return { code, neu: code !== null };
  } catch {
    // Der Wettlauf ist verloren, die Karte aber versorgt: der andere Aufruf hat
    // eingefuegt. Sein Code ist das richtige Ergebnis — nur eben nicht unseres.
    try {
      return { code: aktiverOrtCode(db, ort.id), neu: false };
    } catch {
      return { code: null, neu: false };
    }
  }
}

/**
 * ZIEHT NACH, WAS FEHLT — für ALLE Ortskarten. Der Nachzug beim Öffnen der
 * Ortsetiketten (Betreiberentscheidung 17.09.2026).
 *
 * ⚠️ SIE LÄUFT AUS EINER SERVER COMPONENT, ALSO IN EINEM GET. Das ist
 * ungewöhnlich und hier richtig: die Zusage lautet „jede Karte trägt einen
 * Code", und eine Zusage, die an einem Knopfdruck hängt, ist am Papier keine.
 * Sie ist idempotent und rein additiv — ein doppeltes Rendern, ein Reload, ein
 * paralleler Aufruf ändern nichts an ihrem Ergebnis; der Teilindex
 * `idx_tokens_ort_aktiv` ist der Riegel darunter, falls zwei Anfragen
 * gleichzeitig denselben leeren Ort sehen.
 *
 * ⚠️ SIE FÄNGT DEN WURF DIESES WETTLAUFS, statt ihn durchzulassen: verliert
 * dieser Aufruf ihn, hat der andere den Code bereits angelegt — die Karte ist
 * versorgt, und eine Fehlerseite wäre die falsche Antwort auf einen Zustand,
 * der erreicht ist.
 *
 * @returns Wie viele Codes NEU entstanden sind. Null ist der Normalfall.
 */
export function stelleOrtCodesSicher(db: DB, ausstellerSub: string, name: string | null): number {
  return withAuditContext(
    { actor: { kind: "user", id: ausstellerSub, ...(name ? { name: name.slice(0, 256) } : {}) } },
    () => {
      let neu = 0;
      for (const ort of etikettOrte(db)) {
        /*
         * ⚠️ ÜBER `versorge` UND NICHT ÜBER `legeAn` DIREKT. Jene Funktion
         * trägt die ganze Fehlerbehandlung — vorhandener Code, erschöpfte
         * Ziehung, Wettlauf —, und eine zweite Fassung davon hier wäre die
         * Stelle, an der die beiden auseinanderlaufen.
         *
         * ⚠️ HIER STAND EIN `aktiverOrtCode`-VORLAUF UND DANEBEN `if (code)
         * neu++`, und beides war falsch (Durchsicht). Die Abfrage konnte den
         * Wettlauf nicht schließen — zwischen ihr und dem `INSERT` liegt das
         * Fenster, in dem der andere Aufruf einfügt —, und danach zählte der
         * Verlierer den Code des Gewinners als seinen eigenen. Die Seite nannte
         * eine Zahl zu viel und schickte jemanden zum Drucker für eine Karte,
         * die sich nicht geändert hat. `versorge` beantwortet beides in einem
         * Zug und sagt mit `neu`, wer wirklich eingefügt hat.
         *
         * ⚠️ UND DIE ABFRAGE LAG AUSSERHALB JEDES `try` — in einer Server
         * Component, also mit einem HTTP 500 für die ganze Seite als Preis.
         * `versorge` nimmt sie mit hinein.
         */
        if (versorge(db, ort, ausstellerSub).neu) neu++;
      }
      return neu;
    },
  );
}

/**
 * ZURÜCKSETZEN — der missbrauchte Code wird gesperrt, ein neuer tritt daneben.
 *
 * ⚠️ ES WIRD NICHT IN DER ZEILE ÜBERSCHRIEBEN, und das ist die ganze Wirkung
 * der Funktion. Der Namensraum ist gesperrt (Entscheidung 8-F): nur eine Zeile,
 * die STEHEN BLEIBT, hält ihren Codewert dauerhaft belegt. Ein `UPDATE … SET
 * code = …` gäbe die alte Ziffernfolge wieder frei — sie wäre wieder ziehbar
 * und träfe irgendwann wieder eine Karte, von der jemand ein Foto hat. Genau
 * dagegen setzt man zurück.
 *
 * ⚠️ UND DIE ALTE ZEILE BEHÄLT IHRE `ort_id`. Sie ist danach die einzige
 * Auskunft darüber, an welcher Karte ein gesperrter Code einmal hing.
 *
 * ⚠️ `ersetztAm` IST NICHT DIE DOPPELUNG VON `aktiv = false`, sondern der
 * Unterschied zwischen „gesperrt" und „verbrannt" — gefunden in der Durchsicht.
 * Sperren ist rücknehmbar und soll es am Altbestand bleiben; ein
 * zurückgesetzter Code darf es nie sein. Ohne die Spalte führte ein erlaubter
 * Handgriff zurück: erst den NACHFOLGER sperren, dann am Vorgänger
 * „Reaktivieren" — der Riegel dort fragte „hat dieser Ort schon einen aktiven
 * Code?", und nach dem ersten Klick hat er keinen. Das weggeworfene Kärtchen
 * gälte wieder. Gelesen wird die Spalte in `_actions/tokens.ts`.
 *
 * ⚠️ EINE TRANSAKTION, keine zwei Anweisungen. Bräche es dazwischen ab, stünde
 * der Ort ohne aktiven Code da — die Karte am Fahrzeug führte ab dann aufs Gate,
 * und niemand wüsste, warum.
 *
 * ⚠️ UND DIE ERSCHÖPFTE ZIEHUNG MUSS WERFEN, NICHT `null` DURCHREICHEN. Das ist
 * der Unterschied zwischen „nichts passiert" und „der alte Code ist gesperrt,
 * ein neuer gibt es nicht": better-sqlite3 rollt eine Transaktion nur bei einem
 * WURF zurück: ein zurückgegebenes `null` committet das `UPDATE` mit. Die
 * Sperrung des alten Codes bliebe stehen, und die Karte am Fahrzeug führte ab
 * dann aufs Gate. Der Wurf wird hier gleich wieder gefangen — nach außen ist
 * das Ergebnis `null`, wie bei den anderen beiden Funktionen auch.
 */
class ZiehungErschoepft extends Error {}

/**
 * ⚠️ DER ZWEITE AUSGANG, UND ER IST KEIN FEHLER: der Code, den die Bedienende
 * VOR SICH SIEHT, ist nicht mehr der aktive. Gefunden in der Durchsicht.
 * Zwei Verwaltende (oder zwei Tabs) auf derselben Karte serialisiert SQLite
 * sauber — nur sperrte der zweite Durchlauf dann den Code, den der erste
 * gerade erzeugt hat, und die erste Oberflaeche zeigte stolz eine Zahl, die
 * schon wieder verbrannt war. Die naechste gedruckte Karte fuehrte ins Leere.
 */
export class StandVeraltet extends Error {}

/**
 * ⚠️ `bisher` IST DER CODE, DEN DIE BEDIENENDE GESEHEN HAT — nicht „der
 * aktive". Der Unterschied ist die ganze Absicht: ein `WHERE aktiv = 1` allein
 * traefe immer irgendetwas und damit im Wettlauf das Falsche. Mit dem Code als
 * Bedingung sperrt dieser Aufruf genau die Zeile, auf die sich die Rueckfrage
 * im Bildschirm bezog — oder gar keine, und dann ist der Stand veraltet.
 */
export function setzeOrtCodeNeu(
  db: DB,
  ort: EtikettOrtZeile,
  ausstellerSub: string,
  bisher: string,
): string | null {
  try {
    return db.transaction((tx) => {
      const gesperrt = tx.update(tokens)
        .set({ aktiv: false, ersetztAm: new Date() })
        .where(and(
          eq(tokens.ortId, ort.id),
          eq(tokens.aktiv, true),
          eq(tokens.code, bisher),
        )!)
        .run();
      /*
       * ⚠️ DER WURF MUSS INNERHALB DER TRANSAKTION STEHEN, sonst bleibt die
       * halbe Arbeit stehen — dieselbe Falle wie bei `ZiehungErschoepft`
       * darunter: better-sqlite3 rollt nur bei einem WURF zurueck.
       */
      if (gesperrt.changes !== 1) throw new StandVeraltet();
      const code = legeAn(tx as unknown as DB, ort, ausstellerSub);
      if (!code) throw new ZiehungErschoepft();
      return code;
    });
  } catch (e) {
    /*
     * NUR DIESE EINE KLASSE. Jeder andere Wurf — eine verletzte Eindeutigkeit,
     * ein Datenbankfehler, ein veralteter Stand — fällt an den Aufrufer durch
     * und wird dort zu einer anderen Meldung. Ein `catch`, das alles schluckt,
     * machte aus einem defekten Schreibpfad ein stilles „bitte erneut
     * versuchen", das nie gelingt.
     */
    if (e instanceof ZiehungErschoepft) return null;
    throw e;
  }
}

/**
 * DER NEUDRUCK — DRK-442. Jeder Ort, dessen aktiver Code noch die ALTE Form hat
 * (6 Ziffern), bekommt einen langen; der alte wird verbrannt wie bei jedem
 * Zurücksetzen.
 *
 * ⚠️ ÜBER `setzeOrtCodeNeu` JE ORT, NICHT ALS EIGENES `UPDATE`. Jene Funktion
 * trägt die ganze Sorgfalt des Zurücksetzens — `ersetzt_am`, der gesehene
 * Code als Bedingung, die Transaktion je Ort. Eine Sammelfassung daneben wäre
 * die Stelle, an der beide auseinanderlaufen.
 *
 * ⚠️ JEDER ORT IST EINE EIGENE TRANSAKTION, und das ist gewollt: scheitert der
 * zwölfte, sind die elf davor trotzdem lang — und die Seite zählt nur, was
 * wirklich neu ist. Ein veralteter Stand (jemand war schneller) ist kein
 * Fehler: der Ort hat dann schon einen neuen Code, und der ist lang.
 *
 * ⚠️ NUR ORTSCODES. Der Altbestand ohne Karte hat keinen Nachfolger, an den
 * sein Code übergehen könnte; er bleibt, bis jemand ihn sperrt.
 *
 * @returns Wie viele Codes neu entstanden sind — so viele Karten müssen neu
 *   gedruckt werden.
 */
export function ersetzeAlteOrtCodes(db: DB, ausstellerSub: string): number {
  let neu = 0;
  for (const ort of etikettOrte(db)) {
    const bisher = aktiverOrtCode(db, ort.id);
    if (!bisher || istLangerCode(bisher)) continue;
    try {
      if (setzeOrtCodeNeu(db, ort, ausstellerSub, bisher)) neu++;
    } catch (e) {
      if (!(e instanceof StandVeraltet)) throw e;
    }
  }
  return neu;
}
