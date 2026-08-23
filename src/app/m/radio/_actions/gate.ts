"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpAus } from "@/core/ratelimit";
import { getDb } from "../_db/client";
import { normalisiereCode } from "../_lib/code";
import { gateFehlversuchBuchen, gateGesperrt } from "../_lib/gateSchranke";
import { gateMeldung } from "../_lib/gateTexte";
import { requireRadioHost } from "../_lib/host";
import { sanitizeReturnTo } from "../_lib/returnTo";
import {
  AUSLEIH_COOKIE,
  ausleihCookieOptionen,
  ausleihGueltigkeitSekunden,
} from "../_lib/ausleihSitzung";
import { loeseCodeEin } from "../_lib/schreibpfade/codeEinloesung";

/**
 * DIE ZWEITE GATE-FLAECHE — das Codefeld am Gate (Spec 1 §3.3.3, Zeilen 2338-2374). Die
 * anderen beiden sind `t/[code]/route.ts` (§3.3.2) und `erneuereSitzung` in
 * `_actions/sitzung.ts` (§3.4.4, Entscheidung E12). ALLE DREI tragen dieselben sechs
 * Schritte in derselben Reihenfolge (Spec:2256-2272), und `_lib/bauform.test.ts` misst das
 * an ihren Textpositionen.
 *
 * Sie gibt es fuer den Fall, dass die Kamera nicht will, der Code von einem Ausdruck
 * abgelesen wird oder der Scan im Browser nicht ankommt (Spec:2338-2340).
 *
 * ⚠️ AUSNAHMELISTE DES GUARD-SCANS, EINTRAG 1 (`_actions/guards.test.ts:57`). Diese Action
 * ERZEUGT die Sitzung; ein Sitzungsriegel davor waere die Tuer, die sich selbst abschliesst
 * (Spec:2359-2362). Wer den Scan „vervollstaendigt", indem er hier
 * `requireAusleihSchreibend` einsetzt, macht das GATE UNBENUTZBAR — und der Fehler sieht wie
 * eine Verbesserung aus.
 *
 * ⚠️ ⛔ DIE `useActionState`-SIGNATUR IST BINDEND (Spec:2350-2356). `_ui/GateFormular.tsx`
 * (A11) ruft `useActionState<GateZustand, FormData>(einloesenAmGate, {})`; der erste
 * Parameter ist der VORHERIGE Zustand und wird nicht gelesen. Eine Signatur OHNE ihn ist
 * typkorrekt kompilierbar und bekaeme zur Laufzeit `FormData` im falschen Parameter — die
 * Eingabe waere dann IMMER LEER, jeder Code wuerde als „unbekannt" beantwortet, und
 * `pnpm build` sieht das nicht.
 */
export type GateZustand = { fehler?: string };

export async function einloesenAmGate(
  _vorher: GateZustand,
  formData: FormData,
): Promise<GateZustand> {
  /*
   * SCHRITT 1 — der Host-Riegel, und er WIRFT. Das ist die eine Ausnahme vom Grundsatz
   * „Actions werfen nicht, sie geben zurueck" (Bauform-Zulaessigkeitstafel Zeile 11,
   * Spec:2360-2362): ein Action-POST auf dem falschen Host ist kein Betriebsfall, den ein
   * Formular anzeigen muesste, sondern ein manipulierter. Die Existenz eines Pfades auf
   * einem fremden Host wird nicht verraten (`_lib/host.ts:56-57`).
   *
   * ⛔ ER STEHT ALS ERSTE ANWEISUNG DA, UND ZWAR MIT `await headers()` DARIN — nicht hinter
   * einem `const kopf = await headers();`. `_actions/guards.test.ts:568-573` prueft fuer
   * jeden Eintrag der Ausnahmeliste die ERSTE Anweisung, und die endet am ersten `;` auf
   * oberster Ebene (`guards.test.ts:366`). Ein vorgezogenes `const kopf = …` schoebe den
   * Riegel auf Platz zwei und faerbte den Scan rot. Das zweite `await headers()` unten ist
   * derselbe, anfrage-zwischengespeicherte Wert.
   */
  requireRadioHost(await headers());

  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") ?? ""));

  /*
   * Der Buendelungsschluessel des Fehlerzaehlers — OHNE Zwischenschicht (Spec:3033-3035):
   * `radio` ruft `clientIpAus` unmittelbar an der Aufrufstelle, `lagerbuch`s
   * `_lib/absender.ts` wird hier NICHT nachgebaut (`_lib/gateSchranke.ts:53-56`).
   * Einmal ermittelt, zweimal benutzt — Schritt 2 und Schritt 6.
   */
  const absender = clientIpAus(await headers());

  /*
   * SCHRITT 2 — gesperrt? OHNE Datenbankzugriff. DIESER Schritt schuetzt die Datenbank,
   * nicht der Absender-Eimer: wer den Absenderschluessel rotiert, startet jeden Versuch mit
   * leerem Eimer und bekaeme so oder so genau einen Lookup. Gedeckelt wird das
   * ausschliesslich durch die beiden MODULWEITEN Zaehler, und die lesen ihre Sperrzeit VOR
   * jedem Datenbankzugriff (`_lib/gateSchranke.ts:165-169`).
   *
   * Und es wird hier KEIN Fehlversuch gebucht: sonst verlaengerte jeder Versuch waehrend
   * der Sperre die Sperre, und ein Funkraum, der es zweimal probiert, kaeme nie wieder
   * herein.
   *
   * `gateMeldung` liefert `null` nur fuer einen Grund ausserhalb des Satzes
   * (`_lib/gateTexte.ts:110`); `"zuviele"` steht darin (`_lib/gateTexte.ts:37-42`). Das
   * `?? undefined` ist deshalb der Typuebergang und kein Rueckfalltext — einen solchen gibt
   * es hier ausdruecklich nicht (Spec:2396-2398).
   */
  const sperrSekunden = gateGesperrt(absender);
  if (sperrSekunden !== null) {
    return { fehler: gateMeldung("zuviele", sperrSekunden) ?? undefined };
  }

  /*
   * SCHRITT 3 — normalisieren. `loeseCodeEin` normalisiert NICHT selbst
   * (`_lib/schreibpfade/codeEinloesung.ts:39-47`), und ein Aufruf ohne `normalisiereCode`
   * scheitert STILL am Erfolgspfad: die Gleichheitssuche gegen `zugangscodes.code` findet
   * die von Hand eingetippte Schreibweise nicht, und die Person sieht „unbekannt oder
   * gesperrt" — mit einem RICHTIGEN Code vom Aufsteller in der Hand.
   *
   * ⚠️ SIE STEHT ALS EIGENE ANWEISUNG DA, NICHT INLINE IM EINLOESEAUFRUF, und das ist keine
   * Formatierungsfrage: der Reihenfolge-Scan (`_lib/bauform.test.ts`) vergleicht die
   * TEXTPOSITIONEN der vier Riegel. In `loeseCodeEin(normalisiereCode(x), …)` steht
   * `loeseCodeEin(` textlich VOR `normalisiereCode(` — der Scan meldete dann „Einloesung
   * steht VOR normalisieren" fuer eine Datei, die sachlich richtig ist (Spec:2264-2268;
   * dieselbe Form traegt `lagerbuch/_actions/gate.ts:71`).
   */
  const code = normalisiereCode(String(formData.get("code") ?? ""));

  /*
   * SCHRITT 4 — `loeseCodeEin` NIMMT das Handle, es holt sich keins: `_db/client.ts#getDb()`
   * ist der einzige Opener des Moduls (`_lib/schreibpfade/codeEinloesung.ts:48-53`).
   */
  const res = await loeseCodeEin(code, getDb());

  if (!res.ok) {
    /*
     * SCHRITT 6 — erst JETZT wird gebucht. Die drei Zaehler liegen HINTER der Codepruefung
     * und zaehlen NUR Fehlversuche (`_lib/gateSchranke.ts:179-191`). „unbekannt" und
     * „gesperrt" sind von aussen nicht unterscheidbar; beide bekommen denselben Satz
     * (Spec:2334-2336).
     */
    gateFehlversuchBuchen(absender);
    return { fehler: gateMeldung("code", null) ?? undefined };
  }

  /*
   * SCHRITT 5 — Erfolg, und er verbraucht KEIN BUDGET. Bei `radio` ist „ein Funkraum voller
   * Personen, die denselben Aufsteller nacheinander scannen, teilen sich einen Uplink und
   * damit einen Absenderschluessel" der REGELFALL, nicht der Randfall
   * (`_lib/gateSchranke.ts:185-189`); hundert erfolgreiche Einloesungen in Folge schliessen
   * das Gate nicht.
   *
   * `ausleihCookieOptionen` fuehrt KEIN `domain` — das Cookie ist host-only
   * (`_lib/ausleihSitzung.ts:207-219`), und genau diese Eigenschaft ist die zweite Haelfte
   * des Host-Riegels aus §3.4.6.
   */
  (await cookies()).set(
    AUSLEIH_COOKIE,
    res.cookieValue,
    ausleihCookieOptionen(ausleihGueltigkeitSekunden()),
  );

  /*
   * AEUSSERER Pfad (Spec:2374: „dann `redirect(returnTo ?? '/')`"). `/` ist die Gate-Weiche;
   * sie leitet mit gueltigem Zugang selbst auf `/geraete` weiter (Entscheidung E1,
   * `briefs/A11.md:25`). Ein ausdrueckliches `returnTo` hat Vorrang.
   *
   * ⚠️ `redirect()` NICHT in einem `try`/`catch` — es arbeitet ueber einen geworfenen
   * Sentinel, ein `catch` verschluckt ihn und die Weiterleitung findet still nicht statt
   * (Bauform-Zulaessigkeitstafel Zeile 6).
   */
  redirect(returnTo ?? "/");
}
