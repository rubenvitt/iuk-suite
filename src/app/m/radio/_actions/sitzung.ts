"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpAus } from "@/core/ratelimit";
import { getDb } from "../_db/client";
import { normalisiereCode } from "../_lib/code";
import { gateFehlversuchBuchen, gateGesperrt } from "../_lib/gateSchranke";
import { gateMeldung } from "../_lib/gateTexte";
import { requireRadioHost } from "../_lib/host";
import {
  AUSLEIH_COOKIE,
  ausleihCookieOptionen,
  ausleihGueltigkeitSekunden,
} from "../_lib/ausleihSitzung";
import { loeseCodeEin } from "../_lib/schreibpfade/codeEinloesung";

/**
 * DIE INLINE-ERNEUERUNG UND DER BEENDEN-KNOPF — Spec 1 §3.4.4 (Zeilen 2563-2570) und §3.4.5
 * (Zeile 2774).
 *
 * ⚠️ BEIDE STEHEN AUF DER AUSNAHMELISTE DES GUARD-SCANS, EINTRAEGE 2 UND 3
 * (`_actions/guards.test.ts:57-61`). `erneuereSitzung` ERZEUGT die Sitzung — ein
 * Sitzungsriegel davor waere die Tuer, die sich selbst abschliesst (Spec:2359-2362).
 * `beenden` BEENDET sie und muss auch dann noch wirken, wenn sie laengst ungueltig ist; ein
 * Riegel machte den Abmeldeknopf ausgerechnet in dem Zustand unbrauchbar, in dem man ihn
 * braucht. ⛔ BEIDE tragen `requireRadioHost` als erste Anweisung und ausdruecklich KEINEN
 * Sitzungsriegel (Spec:6762).
 */

/**
 * ⛔ EIN BENANNTER TYP UND KEIN INLINE-OBJEKT IM RUECKGABETYP, UND DAS IST GEMESSEN, NICHT
 * STIL. `_lib/bauform.test.ts` schneidet den Funktionskoerper mit `funktionsKoerper` aus
 * (`riegel.test.ts:238-253`), und das sucht die erste `{` NACH dem Funktionsnamen. Stuende
 * hier `): Promise<{ ok: true } | { ok: false; text: string }> {`, liese der Scan
 * `{ ok: true }` als „Koerper" — nicht leer, also an der Leer-Zusicherung vorbei, und alle
 * vier Riegel „fehlten ganz" bei RICHTIGER Implementierung (Sonde vom 2026-08-23 ueber genau
 * diese Kopie).
 *
 * ⚠️ ABWEICHUNG VOM BRIEF, DIE FORM IST GLEICH: `briefs/A910.md:88-90` und KOPF.md:700
 * drucken den Typ inline. Struktur, Namen und `ok`-Zweige sind hier zeichengleich; nur der
 * Ort ist ein anderer.
 *
 * ⚠️ ER TRAEGT BEWUSST KEINEN `grund`. Der Aufrufer ist bereits das Erneuerungsfeld selbst
 * (A19, `_ui/SitzungErneuern.tsx`, gerendert nur bei `grund === "sitzung"`); ein
 * `grund: "sitzung"` von hier baute ein zweites Feld im ersten auf
 * (`lagerbuch/_actions/sitzung.ts:46-49`).
 */
export type ErneuerungErgebnis = { ok: true } | { ok: false; text: string };

/**
 * DIE DRITTE GATE-FLAECHE (Spec:2258: „Es gibt genau DREI Stellen, die eine Ausleih-Sitzung
 * ausstellen. ALLE DREI tragen dieselben sechs Schritte in derselben Reihenfolge"; §3.4.4
 * Spec:2563-2570 schreibt sie aus, Spec:3108 fuehrt diese Datei im Reihenfolge-Scan).
 * Planentscheidung E12, `briefs/KOPF.md:675-731`. Vorbild woertlich:
 * `src/app/m/lagerbuch/_actions/sitzung.ts:51-101`.
 *
 * Eine Ausleihe ist ein Formular mit eingetragenen Werten. Laeuft die Sitzung zwischen
 * Eingabe und Absenden ab, fuehrt JEDER naheliegende Weg — Redirect aufs Gate, Neuladen —
 * durch das Verwerfen dieser Arbeit.
 *
 * ⚠️ DAS IST KEINE VERLAENGERUNG „AUF KNOPFDRUCK", sondern das geforderte „erneut scannen" —
 * nur ohne die Seite zu verlassen. OHNE ERNEUTE CODE-EINGABE PASSIERT NICHTS. Deshalb laeuft
 * sie durch DIESELBE Schranke, DIESELBE Normalisierung und DENSELBEN Host-Riegel wie das
 * Gate; sie ist eine dritte Gate-Flaeche und kein Sonderweg.
 *
 * ⛔ SIE LEITET NICHT UM. Das ist der ganze Punkt: die Seite bleibt stehen, die eingetragenen
 * Werte bleiben stehen (Spec:2563-2567, `lagerbuch/_actions/sitzung.ts:42-44`).
 * `_lib/bauform.test.ts` sichert das mit `not.toMatch(/\bredirect\s*\(/)` auf ihrem Koerper
 * zu.
 */
export async function erneuereSitzung(rohCode: string): Promise<ErneuerungErgebnis> {
  /*
   * SCHRITT 1 — Host-Riegel, werfend (Bauform-Zulaessigkeitstafel Zeile 11, Spec:2360-2362).
   * ⛔ ERSTE ANWEISUNG, mit `await headers()` DARIN: `_actions/guards.test.ts:572-577` misst
   * fuer jeden Ausnahme-Eintrag die erste Anweisung, und die endet am ersten `;` auf
   * oberster Ebene. Ein vorgezogenes `const kopf = await headers();` schoebe den Riegel auf
   * Platz zwei.
   */
  requireRadioHost(await headers());

  // Ohne Zwischenschicht (Spec:3033-3035, `_lib/gateSchranke.ts:53-56`). Einmal ermittelt,
  // zweimal benutzt — Schritt 2 und Schritt 6.
  const absender = clientIpAus(await headers());

  /*
   * SCHRITT 2 — Sperre, OHNE Datenbankzugriff und OHNE Buchung. Buchte sie hier, verlaengerte
   * jeder Versuch waehrend der Sperre die Sperre.
   *
   * ⛔ `!` UND KEIN `?? "…"`: die Texte stehen an GENAU EINER Stelle (Spec:2387), und einen
   * Rueckfalltext gibt es ausdruecklich NICHT (Spec:2396-2398). `gateMeldung` liefert `null`
   * nur fuer einen Grund AUSSERHALB des Satzes (`_lib/gateTexte.ts:111`
   * `if (!istGateGrund(roh)) return null;`); `"zuviele"` steht namentlich darin
   * (`_lib/gateTexte.ts:37-42`). Der `??`-Zweig waere also tot — und truege doch eine ZWEITE,
   * verkuerzte Fassung desselben Satzes, die am Tag eines Umbaus an `gateMeldung` still
   * ausgeliefert wuerde. `_lib/bauform.test.ts` („kein Rueckfalltext hinter gateMeldung")
   * verbietet die Form modulweit, mit zwei Reichweiten.
   */
  const sperrSekunden = gateGesperrt(absender);
  if (sperrSekunden !== null) {
    return { ok: false, text: gateMeldung("zuviele", sperrSekunden)! };
  }

  /*
   * SCHRITT 3 — normalisieren, ⛔ ALS EIGENE ANWEISUNG, NICHT INLINE. Derselbe Grund wie in
   * `_actions/gate.ts:104-110`: der Reihenfolge-Scan vergleicht TEXTPOSITIONEN, und in
   * `loeseCodeEin(normalisiereCode(x), …)` stuende die Einloesung textlich vor dem
   * Normalisieren (Spec:2264-2268). Sachlich ist sie hier ausserdem die Stelle, an der die
   * eingetragene Arbeit auf dem Spiel steht.
   */
  const code = normalisiereCode(rohCode);

  // SCHRITT 4 — `loeseCodeEin` NIMMT das Handle (`_lib/schreibpfade/codeEinloesung.ts:48-53`).
  const res = await loeseCodeEin(code, getDb());

  if (!res.ok) {
    // SCHRITT 6 — erst jetzt buchen. „unbekannt" und „gesperrt" sind eine einzige Form
    // (Spec:2334-2336).
    gateFehlversuchBuchen(absender);
    // ⛔ `!` und kein Rueckfalltext — derselbe Beleg wie bei Schritt 2 oben; `"code"` steht
    // ebenfalls namentlich in `GATE_GRUENDE` (`_lib/gateTexte.ts:37-42`).
    return { ok: false, text: gateMeldung("code", null)! };
  }

  /*
   * SCHRITT 5 — Erfolg, KEIN Budgetverbrauch, ⛔ KEIN `redirect()`. Das Cookie geht ueber
   * dieselbe Optionen-Funktion wie ueberall (`_lib/ausleihSitzung.ts:207-219`).
   */
  (await cookies()).set(
    AUSLEIH_COOKIE,
    res.cookieValue,
    ausleihCookieOptionen(ausleihGueltigkeitSekunden()),
  );
  return { ok: true };
}

/**
 * DER BEENDEN-KNOPF — Spec §3.4.5 (Zeile 2774), der SICHTBARE Abmeldeweg. Er wird aus
 * `_ui/AusleihRahmen.tsx` (A16) als `<form action={beenden}>` gerufen.
 *
 * ⛔ WARUM KEIN `<Link href="/abmelden">` (Bauform-Zulaessigkeitstafel Zeile 15, NS-Z3):
 * Nexts Prefetch fordert das Ziel beim blossen Darueberfahren an und beendete die Sitzung
 * ungefragt. Ein POST-Formular ist nicht prefetch-faehig.
 *
 * ⚠️ WARUM ES IHN NEBEN `abmelden/route.ts` GIBT, und warum das KEIN Doppel ist:
 * `/abmelden` ist der Weg fuer den SPERR- UND DEN ABLAUFFALL. `requireAusleihZugang` laeuft
 * aus `(ausleihe)/layout.tsx`, und das ist eine SERVER COMPONENT — dort ist `cookies()`
 * versiegelt, `delete`/`set` werfen (`lagerbuch/abmelden/route.ts:12-20` mit Quellenbeleg).
 * Der Riegel kann das Cookie also nicht selbst raeumen und leitet per `redirect()` als
 * STRING dorthin; der Route Handler raeumt. `beenden` ist der Weg fuer den KNOPF, und eine
 * Server Action DARF Cookies setzen (Bauform-Zulaessigkeitstafel Zeile 1).
 *
 * ⛔ HIER WEICHT `radio` VON `lagerbuch` AB, UND DIE ABWEICHUNG IST BELEGT.
 * `lagerbuch`s `beenden` traegt KEINEN Host-Riegel (`lagerbuch/_actions/sitzung.ts:128-131`:
 * „der schlechteste Fall ist ein Cookie, das man nicht loswird"). `radio`s traegt einen:
 * §3.5.5 (Spec:2774) fuehrt sie mit `requireRadioHost`, werfend, und Spec:6762 sagt fuer
 * beide Ausnahmen dieser Datei ausdruecklich „beide tragen `requireRadioHost` und
 * ausdruecklich keinen Sitzungsriegel". `_actions/guards.test.ts:572-577` prueft genau das.
 *
 * ⚠️ ES RAEUMT NUR DAS COOKIE. Serverseitig wird NICHTS widerrufen — wer denselben Code
 * erneut eingibt, ist wieder drin. Das ist gewollt: der Knopf heisst „Beenden", nicht „Code
 * sperren"; sperren tut die Verwaltung (`_actions/codes.ts#setzeCodeAktiv`).
 *
 * ⛔ KEIN `signOut()`, KEIN Auth.js-Cookie (Spec:2610-2614) — sonst verloere eine angemeldete
 * Person ihre Suite-Sitzung auf ALLEN Modul-Hosts beim Beenden des anonymen Zugangs.
 */
export async function beenden(): Promise<void> {
  // SCHRITT 1 — Host-Riegel, werfend, erste Anweisung (siehe Kopfkommentar).
  requireRadioHost(await headers());

  /*
   * ⛔ `ausleihCookieOptionen(0)` STATT `cookies().delete(...)` — DIE ATTRIBUTE MUESSEN BEIM
   * LOESCHEN DIESELBEN SEIN WIE BEIM SETZEN (`_lib/ausleihSitzung.ts:195-201`, Spec:2596-2604),
   * und die eine Funktion, die das garantiert, gibt es schon.
   *
   * Nexts `delete(name)` erzeugt `set({name, value:"", expires: new Date(0)})` OHNE `path`
   * (`next/dist/compiled/@edge-runtime/cookies/index.js:302-304`, im Bestand nachgeschlagen
   * und in `lagerbuch/_actions/sitzung.ts:140-149` ausgeschrieben). Der Browser scopet ein
   * `Set-Cookie` ohne `Path` auf das Verzeichnis der Anfrage — ein Action-POST von
   * `/ausleihen` loeschte also unter `/ausleihen/`, waehrend das echte Cookie unter `Path=/`
   * UEBERLEBT. Der Knopf leitete trotzdem um und saehe aus wie ein Erfolg; die Sitzung
   * stuende noch. ⛔ `_lib/bauform.test.ts` verbietet die Form modulweit, mit zwei Scans.
   */
  (await cookies()).set(AUSLEIH_COOKIE, "", ausleihCookieOptionen(0));

  // AEUSSERER Pfad — die Modulwurzel ist das Gate (Entscheidung E1). ⚠️ NICHT in einem
  // `try`/`catch`: `redirect()` arbeitet ueber einen geworfenen Sentinel.
  redirect("/");
}
