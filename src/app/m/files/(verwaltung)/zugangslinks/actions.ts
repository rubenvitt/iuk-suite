"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/app/m/files/_db/client";
import { zugangslinks } from "@/app/m/files/_db/schema";
import { requireFilesAccess } from "@/app/m/files/_lib/access";
import { grenzen } from "@/app/m/files/_lib/grenzen";
import { erzeugeToken, tokenHash } from "@/app/m/files/_lib/token";

/**
 * DIE DREI SCHREIBWEGE DER ABGABELINKS (Spec §4.7, §8.4, §8.6; Plan T30).
 *
 * Anlegen, Kontingent aufstocken, widerrufen — mehr gibt es nicht, und
 * ausdrücklich **kein** Löschen: `revoked_at` ist der Widerruf, weil mit der
 * Zeile sonst die `token_id`-Zuordnung der schon empfangenen Uploads
 * verschwände (§8.6; `drop` löscht die Zeile und hat deshalb keine Historie).
 *
 * **Jede** exportierte Funktion ruft `requireFilesAccess()` als ERSTES, vor
 * jedem Lesen der Nutzlast. Eine Seiten-Prüfung erstreckt sich NICHT auf die
 * Actions darunter (Next-Doku `data-security.md:282,329`), und in der Alt-App
 * fehlte sie in allen drei Actions. Der Quelltext-Scan aus T26 (Punkt 7)
 * erfasst diese Datei mit.
 *
 * **Warum Rückgabewerte statt `throw`** für Eingabefehler: eine geworfene
 * Ausnahme landet auf der technischen Fehlerseite und nimmt die Eingaben mit.
 * Fehler gehören ans Feld (`useActionState`, §8.5). Ein fehlender ZUGANG ist
 * dagegen kein Feldfehler und wirft weiter — eine gerenderte Meldung „darfst du
 * nicht" wäre eine Auskunft über einen fremden Datenbestand.
 */

/** Feldfehler auf `name`-Attribute geschlüsselt, plus die eingetippten Werte
 *  zum Wiedereinsetzen. Ein LEERER `fieldErrors`-Satz ist der Startwert für
 *  `useActionState` — er rendert keine Meldung. */
type Fehlerlage = { ok: false; fieldErrors: Record<string, string>; values: Record<string, string> };

/**
 * Das Ergebnis des Anlegens. Der Rohtoken steht GENAU HIER und nirgends sonst:
 * er wird einmal ausgegeben (Link, QR, PNG, Druckansicht) und existiert danach
 * nirgends mehr (§4.7). Die Oberfläche darf ihn deshalb nicht in einen zweiten
 * Zustand kopieren, der einen Neuaufbau überlebt.
 */
export type AnlegenErgebnis = { ok: true; id: string; token: string } | Fehlerlage;

/** Aufstocken und Widerrufen tragen nichts zurück außer „hat geklappt". */
export type ZugangslinkFormState = { ok: true } | Fehlerlage;

/**
 * 1–72 GANZE Stunden. Die 72 sind 1:1 aus dem Alt-System (an zwei unabhängigen
 * Stellen korrekt erzwungen); sie zu erhöhen ist eine Beauftragung, keine
 * Nebenwirkung des Ports (§8.6, §13.2 Frage 9).
 */
const MIN_LAUFZEIT_STUNDEN = 1;
const MAX_LAUFZEIT_STUNDEN = 72;

/**
 * Die Einheit steht im Namen (§9.1). `Date.getTime()` liefert MILLISEKUNDEN;
 * die Spalte führt SEKUNDEN und Drizzle rechnet mit `mode: "timestamp"` um.
 * Wer hier mit 3600 rechnete, legte einen Link mit 24 SEKUNDEN Laufzeit an —
 * und der Fehler ist still, weil beide Zahlen plausibel aussehen.
 */
const MILLISEKUNDEN_PRO_STUNDE = 60 * 60 * 1000;

/**
 * Die ersten SIEBEN Zeichen im Klartext: `dz-` plus vier Geheimzeichen — so
 * benennt §4.7 die Form selbst, und `_db/migrations.test.ts:443` setzt sie so.
 * Die Spec-TABELLE schreibt daneben „8"; `"dz-2345-6789-abcd".slice(0, 8)`
 * ergäbe `"dz-2345-"` mit hängendem Bindestrich und ein achtes Zeichen ohne
 * Aussage. Genug zum Wiedererkennen in der Liste, zu wenig zum Benutzen.
 */
const TOKEN_START_LAENGE = 7;

/**
 * Ganze Dezimalzahl ohne Vorzeichen — bewusst NICHT `Number()` und NICHT
 * `parseInt`. `Number("0x10")` ist 16 und `Number("1e1")` ist 10: die geltende
 * Grenze wäre eine andere als die eingegebene, und zwar still (die in
 * `grenzen.ts:196-199` ausgeschriebene Falle). `parseInt("1.5")` wäre 1 — die
 * Ablehnung gebrochener Stunden fiele damit lautlos aus. `GANZZAHL` dort ist
 * nicht exportiert; hier stehen ohnehin nur MENGEN, also ohne Vorzeichen.
 */
const GANZZAHL_OHNE_VORZEICHEN = /^\d+$/;

/**
 * Eine Zahl aus dem Formular, oder `null` mit Feldfehler. `leerErlaubt` trennt
 * die beiden Fälle, die sonst zusammenfielen: ein leeres Budgetfeld heißt
 * „Vorbelegung benutzen", eine leere Laufzeit ist ein Fehler.
 */
function zahl(
  formData: FormData,
  feld: string,
  regel: { min: number; max?: number; leerErlaubt?: boolean },
  fieldErrors: Record<string, string>,
): number | null {
  const roh = String(formData.get(feld) ?? "").trim();
  if (roh === "") {
    if (regel.leerErlaubt) return null;
    fieldErrors[feld] = `Bitte eine ganze Zahl von ${regel.min} bis ${regel.max} angeben.`;
    return null;
  }
  if (!GANZZAHL_OHNE_VORZEICHEN.test(roh)) {
    fieldErrors[feld] = `„${roh}" ist keine ganze Zahl.`;
    return null;
  }
  const wert = Number(roh);
  if (wert < regel.min || (regel.max !== undefined && wert > regel.max)) {
    fieldErrors[feld] =
      regel.max === undefined
        ? `Der Wert muss mindestens ${regel.min} sein.`
        : `Der Wert muss zwischen ${regel.min} und ${regel.max} liegen.`;
    return null;
  }
  return wert;
}

/**
 * EIN Aufruf mit `"layout"` statt zweier mit `"page"`. Die Route-Group
 * `(verwaltung)` taucht in keinem URL-Pfad auf — der interne Pfad der Liste ist
 * `/m/files/zugangslinks`. `"layout"` frischt das Segment MIT allen Unterrouten
 * auf und trifft damit auch den Posteingang, der die Links als Filter zeigt.
 * Der INTERNE Pfad, nicht der per Host geroutete (dieselbe Falle wie im Portal).
 */
function auffrischen(): void {
  revalidatePath("/m/files", "layout");
}

function textfelder(formData: FormData, felder: string[]): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const feld of felder) werte[feld] = String(formData.get(feld) ?? "");
  return werte;
}

/**
 * Ein Abgabelink entsteht — mit 1–72 ganzen Stunden Laufzeit, Budget und
 * `token_start` im Klartext.
 *
 * **Der Rohtoken wird einmal zurückgegeben und nie gespeichert** (§4.7).
 * Gespeichert werden `token_hash` (SHA-256 über den vollen Token) und die
 * ersten sieben Zeichen. Wer den Zettel verliert, legt einen neuen Link an;
 * bei ≤ 72 h Laufzeit ist das der Normalfall.
 *
 * Die Budgets sind VORBELEGT aus §9.3 und keine Obergrenze — sie sind
 * nachträglich erhöhbar (`kontingentAufstockenAction`), und genau das ist Teil
 * der Entscheidung: der Link ist gedruckt.
 */
export async function zugangslinkAnlegenAction(
  _vorher: AnlegenErgebnis,
  formData: FormData,
): Promise<AnlegenErgebnis> {
  const viewer = await requireFilesAccess();

  const values = textfelder(formData, ["name", "laufzeitStunden", "budgetDateien", "budgetBytes"]);
  const fieldErrors: Record<string, string> = {};

  const name = values.name.trim();
  if (name === "") fieldErrors.name = "Bitte eine Bezeichnung angeben.";

  const laufzeitStunden = zahl(
    formData,
    "laufzeitStunden",
    { min: MIN_LAUFZEIT_STUNDEN, max: MAX_LAUFZEIT_STUNDEN },
    fieldErrors,
  );

  // Die Vorbelegungen sind ein STARTWERT, keine harte Obergrenze (§8.4) — nach
  // oben offen, damit ein Einsatz nicht am Formular scheitert.
  const vorgabe = grenzen();
  const budgetDateien =
    zahl(formData, "budgetDateien", { min: 1, leerErlaubt: true }, fieldErrors) ??
    vorgabe.inboxBudgetDateien;
  const budgetBytes =
    zahl(formData, "budgetBytes", { min: 1, leerErlaubt: true }, fieldErrors) ??
    vorgabe.inboxBudgetBytes;

  if (Object.keys(fieldErrors).length > 0 || laufzeitStunden === null) {
    return { ok: false, fieldErrors, values };
  }

  // EINE Uhr für beide Spalten. Zwei `new Date()`-Aufrufe lägen an einer
  // Sekundengrenze um eine Sekunde auseinander, und die Laufzeit wäre dann
  // nicht mehr exakt das, was der Betreiber eingetragen hat.
  const jetzt = new Date();
  const token = erzeugeToken();
  const id = nanoid(10);

  try {
    getDb()
      .insert(zugangslinks)
      .values({
        id,
        name,
        tokenStart: token.slice(0, TOKEN_START_LAENGE),
        tokenHash: tokenHash(token),
        createdAt: jetzt,
        createdBy: viewer.sub,
        expiresAt: new Date(jetzt.getTime() + laufzeitStunden * MILLISEKUNDEN_PRO_STUNDE),
        budgetDateien,
        budgetBytes,
      })
      .run();
  } catch (fehler) {
    // LAUT, nicht still: `token_hash` ist UNIQUE, weil der Hash beim Upload den
    // Link AUFLÖST (§4.9). Eine zweite Zeile mit demselben Hash wäre dort ein
    // stiller Mehrtreffer. Kein Wiederholungsschleifen-Zweig: bei 60 Bit
    // Entropie und ≤ 72 h Laufzeit ist das kein erwartbarer Vorgang, und ein
    // ungetesteter Zweig ist teurer als ein benannter Abbruch.
    if (istEindeutigkeitsverletzung(fehler)) {
      throw new Error(
        "Der Abgabelink konnte nicht angelegt werden: der erzeugte Token ist bereits vergeben. " +
          "Bitte den Vorgang wiederholen.",
      );
    }
    throw fehler;
  }

  auffrischen();
  return { ok: true, id, token };
}

/**
 * Erhöht `budget_dateien` und/oder `budget_bytes` DERSELBEN Zeile — der
 * gedruckte Code bleibt gültig, und das ist der ganze Zweck (§8.4): ein mitten
 * im Einsatz erschöpftes Budget wäre ohne diesen Weg keine Grenze, sondern eine
 * Sackgasse (neuer Link, neuer Ausdruck, neu verteilen).
 *
 * **Angegeben wird der ZUWACHS, nicht die neue Summe.** Zwei Gründe: das
 * `UPDATE` bleibt ein `budget + ?` und kann damit keinen gleichzeitig laufenden
 * Upload überschreiben (dieselbe Regel wie in `_db/zaehler.ts`), und eine
 * absolute Zahl ließe sich versehentlich NACH UNTEN setzen — mitten in einem
 * Vorgang. Die Feldnamen sagen es (`zusatzDateien`, `zusatzBytes`).
 *
 * Beschränkt auf gültige, nicht widerrufene Links: ein widerrufener Link soll
 * durch Aufstocken nicht wieder auferstehen, ein abgelaufener nicht heimlich
 * weiterleben — die Laufzeit ist die andere Grenze und hier nicht verhandelbar.
 */
export async function kontingentAufstockenAction(
  _vorher: ZugangslinkFormState,
  formData: FormData,
): Promise<ZugangslinkFormState> {
  await requireFilesAccess();

  const values = textfelder(formData, ["id", "zusatzDateien", "zusatzBytes"]);
  const fieldErrors: Record<string, string> = {};

  const id = values.id.trim();
  if (id === "") fieldErrors.id = "Kein Abgabelink angegeben.";

  const zusatzDateien = zahl(formData, "zusatzDateien", { min: 1, leerErlaubt: true }, fieldErrors);
  const zusatzBytes = zahl(formData, "zusatzBytes", { min: 1, leerErlaubt: true }, fieldErrors);

  // OHNE diese Prüfung wäre `budget + 0` für SQLite eine geänderte Zeile:
  // `changes === 1`, also „hat geklappt" für einen Vorgang, der nichts getan
  // hat. Der Betreiber sähe eine Erfolgsmeldung und dasselbe Restbudget.
  if (zusatzDateien === null && zusatzBytes === null && Object.keys(fieldErrors).length === 0) {
    fieldErrors.zusatzDateien = "Bitte angeben, um wie viel aufgestockt werden soll.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  const jetzt = new Date();
  const ergebnis = getDb()
    .update(zugangslinks)
    .set({
      budgetDateien: sql`${zugangslinks.budgetDateien} + ${zusatzDateien ?? 0}`,
      budgetBytes: sql`${zugangslinks.budgetBytes} + ${zusatzBytes ?? 0}`,
    })
    .where(
      and(
        eq(zugangslinks.id, id),
        isNull(zugangslinks.revokedAt),
        gt(zugangslinks.expiresAt, jetzt),
      ),
    )
    .run();

  // Die Entscheidung ist die Zahl betroffener Zeilen, nie ein vorher gelesener
  // Wert (`_db/zaehler.ts`). Ein `SELECT` davor und ein `UPDATE` danach wären
  // zwei Schritte mit einem Fenster dazwischen.
  if (ergebnis.changes !== 1) {
    return {
      ok: false,
      fieldErrors: {
        id: "Dieser Abgabelink ist nicht (mehr) gültig — abgelaufen, widerrufen oder unbekannt.",
      },
      values,
    };
  }

  auffrischen();
  return { ok: true };
}

/**
 * Setzt `revoked_at` und löscht die Zeile NICHT (§8.6). `drop` löscht sie — mit
 * ihr verschwände die Zuordnung der schon empfangenen Dateien
 * (`inbox_files.token_id`), und nachvollziehbar wäre danach weder, welcher Link
 * wann abgeschaltet wurde, noch woher ein Upload kam.
 *
 * Ein ABGELAUFENER Link ist weiterhin widerrufbar: der Widerruf ist eine
 * Zustandsmarke, keine Wirkung auf die Laufzeit. Ein bereits widerrufener nicht
 * — sonst überschriebe ein zweiter Klick den Zeitpunkt des ersten.
 */
export async function zugangslinkWiderrufenAction(
  _vorher: ZugangslinkFormState,
  formData: FormData,
): Promise<ZugangslinkFormState> {
  await requireFilesAccess();

  const values = textfelder(formData, ["id"]);
  const id = values.id.trim();
  if (id === "") {
    return { ok: false, fieldErrors: { id: "Kein Abgabelink angegeben." }, values };
  }

  const ergebnis = getDb()
    .update(zugangslinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(zugangslinks.id, id), isNull(zugangslinks.revokedAt)))
    .run();

  if (ergebnis.changes !== 1) {
    return {
      ok: false,
      fieldErrors: { id: "Dieser Abgabelink ist unbekannt oder bereits widerrufen." },
      values,
    };
  }

  auffrischen();
  return { ok: true };
}

/**
 * better-sqlite3 wirft bei einer Verletzung des UNIQUE-Index einen Fehler mit
 * `code = "SQLITE_CONSTRAINT_UNIQUE"`. Geprüft wird der CODE und nicht der
 * Meldungstext: der Text ist nicht zugesichert, der Code schon.
 *
 * GENAU dieser Code, nicht `startsWith("SQLITE_CONSTRAINT")`: die breite Form
 * finge auch CHECK, NOT NULL und FOREIGN KEY ein und beantwortete sie mit
 * „Token bereits vergeben, bitte wiederholen" — eine Wiederholungsaufforderung
 * für eine Fehlerklasse, die durch Wiederholen nicht besser wird, und ein
 * Meldungstext, der von der Ursache wegführt. Solche Fehler sollen ROH auf der
 * technischen Fehlerseite landen, wo sie als das erscheinen, was sie sind.
 */
function istEindeutigkeitsverletzung(fehler: unknown): boolean {
  return (
    typeof fehler === "object" &&
    fehler !== null &&
    "code" in fehler &&
    (fehler as { code: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}
