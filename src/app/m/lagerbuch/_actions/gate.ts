"use server";
import { auditEvent, auditAccessActor, auditDenied } from "@/core/audit/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "../_lib/host";
import { absenderAus } from "../_lib/absender";
import { gateGesperrt, gateFehlversuchBuchen } from "../_lib/gateSchranke";
import { GERAET_COOKIE, gateMerkmal, geraetCookieOptionen, geraetCookieWert } from "../_lib/gateSchrankeMerkmal";
import { gateMeldung } from "../_lib/gateTexte";
import { normalisiereCode } from "../_lib/code";
import { sanitizeReturnTo } from "../_lib/returnTo";
import { ortcodeZielPfad } from "../_lib/ortZiel";
import {
  HELFER_COOKIE, helferCookieOptionen, helferGueltigkeitSekunden,
} from "../_lib/helferSitzung";
import { redeemToken } from "../_lib/schreibpfade/tokenEinloesung";
import { getDb } from "../_db/client";

/**
 * DIE ZWEITE GATE-FLAECHE — §7.2.4, §7.5.2. Die anderen beiden sind
 * `t/[code]/route.ts` (T82) und `erneuereSitzung` (T74); alle drei tragen
 * DIESELBEN Riegel in DERSELBEN Reihenfolge.
 *
 * ⚠️ AUSNAHMELISTE DES GUARD-SCANS, EINTRAG 1 (§3.8.2,
 * `_actions/guards.test.ts:38-40`). Diese Action ERZEUGT die Sitzung; ein
 * Sitzungsriegel davor waere die Tuer, die sich selbst abschliesst. Wer den Scan
 * „vervollstaendigt", indem er hier `requireHelferSchreibend` einsetzt, macht
 * das Gate unbenutzbar — und der Fehler sieht wie eine Verbesserung aus.
 *
 * ⚠️ DIE `useActionState`-SIGNATUR IST BINDEND. `_ui/Gate.tsx` (T77) ruft
 * `useActionState<GateZustand, FormData>(einloesenAmGate, {})`; der erste
 * Parameter ist der VORHERIGE Zustand und wird nicht gelesen. Eine Signatur
 * ohne ihn ist typkorrekt kompilierbar und bekaeme zur Laufzeit `FormData` im
 * falschen Parameter — die Eingabe waere dann IMMER LEER, und das Gate
 * antwortete auf jeden Code mit „unbekannt".
 */
export type GateZustand = { fehler?: string };

export async function einloesenAmGate(
  _vorher: GateZustand,
  formData: FormData,
): Promise<GateZustand> {
  const kopf = await headers();

  // SCHRITT 1 — der Host-Riegel, und er WIRFT. Das ist die eine Ausnahme vom
  // Grundmuster aus §7.3: ein Action-POST auf dem falschen Host ist kein
  // Betriebsfall, den ein Formular anzeigen muesste, sondern ein manipulierter.
  // Die Existenz eines Pfades auf dem falschen Host wird nicht verraten
  // (docs/design/README.md:237-242).
  requireLagerbuchHost(kopf);

  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") ?? ""));
  const absender = absenderAus(kopf);   // §3.5.2 — einmal ermittelt, zweimal benutzt
  const keks = await cookies();
  // DRK-291: ein bekanntes Geraet zaehlt in eigene Eimer (`gateSchrankeMerkmal.ts`).
  const anfrage = { merkmal: await gateMerkmal((n) => keks.get(n)?.value) };

  // SCHRITT 2 — gesperrt? OHNE Datenbankzugriff, VOR der Codesuche (§3.5.3): der
  // Absender-Eimer ist rotierbar, gedeckelt wird die Codesuche durch die
  // modulweiten Zaehler der Gruppe dieser Anfrage. Ein richtiger Code von einem
  // UNBEKANNTEN Geraet wartet waehrend einer modulweiten Sperre — der bewusste
  // Rest aus §3.5.3a. KEINE Buchung hier — sonst verlaengerte jeder Versuch
  // waehrend der Sperre die Sperre.
  const sperrSekunden = gateGesperrt(absender, anfrage);
  if (sperrSekunden !== null) {
    return { fehler: gateMeldung("zuviele", sperrSekunden) ?? undefined };
  }

  // SCHRITT 3 — normalisieren (§7.5.3, Falle 24). `482137` findet `482-137`
  // ohne diese Zeile NICHT, und die Bereitschaft, die zu Schichtbeginn von Hand
  // eintippt, sperrt sich selbst aus — MIT RICHTIGEN CODES.
  const code = normalisiereCode(String(formData.get("code") ?? ""));

  // SCHRITT 4 — `redeemToken` NIMMT das Handle, es holt sich keins:
  // `_db/client.ts#getDb()` ist der einzige Opener des Moduls (§5.13.2).
  const res = await redeemToken(code, getDb());

  if (!res.ok) {
    auditDenied("lagerbuch");
    // SCHRITT 6 — erst JETZT wird gebucht. Die drei Zaehler liegen HINTER der
    // Codepruefung und zaehlen NUR Fehlversuche (§3.5.3).
    gateFehlversuchBuchen(absender, anfrage);
    return { fehler: gateMeldung("code", null) ?? undefined };
  }

  // SCHRITT 5 — Erfolg. KEIN Budgetverbrauch: hundert erfolgreiche
  // Einloesungen in Folge schliessen das Gate NICHT.
  //
  // `helferCookieOptionen()` fuehrt KEIN `domain` — das Cookie ist host-only,
  // und genau diese Eigenschaft laesst die Sitzungen den Cutover ueberleben,
  // SOFERN `SUITE_HOST_LAGERBUCH` zeichengleich die heutige APP_BASE_URL ist
  // (Runbook-Eingabe R1, §7.4.1).
  keks.set(HELFER_COOKIE, res.cookieValue, helferCookieOptionen(helferGueltigkeitSekunden()));
  // Ab jetzt ein bekanntes Geraet (DRK-291) — auch fuer die naechste Schicht;
  // es zaehlt dann nicht mehr in die Eimer der Unbekannten (§3.5.3a).
  // Eine vorhandene Kennung bleibt, sonst begaenne das Geraet mit frischem Budget.
  keks.set(GERAET_COOKIE, await geraetCookieWert(keks.get(GERAET_COOKIE)?.value), geraetCookieOptionen());

  /*
   * AEUSSERER Pfad. Ein ausdrueckliches `returnTo` (Deep-Link) hat Vorrang;
   * sonst fuehrt der Code an sein hinterlegtes Ziel (§7.2.5).
   *
   * ⚠️ UEBER DEN ORT, NICHT UEBER DIE ZIELART — DRK-417, und diese Zeile ist
   * dieselbe wie im gescannten `/t/<code>`. Hier stand `tokenZielPfad`, und der
   * kennt „sonst" nur als Artikelliste: ein von Hand GETIPPTER Box-Code landete
   * damit auf `/helfer`, wo die Reichweite ihn abweist — der Riegel schrieb ein
   * `access_denied` und leitete weiter auf `/helfer/box`. Die Person kam also
   * an, und im Protokoll stand trotzdem eine Ablehnung.
   *
   * ⚠️ DAS IST TEURER ALS EIN UMWEG. Das Zugriffsprotokoll ist die Grundlage
   * fuer „welche Karte muss zurueckgesetzt werden?"; ein Eintrag, den jede
   * erfolgreiche Anmeldung mit diesem Code erzeugt, macht genau diese Frage
   * unbeantwortbar. Gefunden hat es die Codex-Review zu PR #205 — kein Tor sah
   * es, weil beide Seiten je fuer sich richtig antworteten.
   *
   * ⚠️ BEIDE EINSTIEGE RECHNEN JETZT MIT DERSELBEN FUNKTION, und das ist der
   * Punkt: Tippen und Scannen sind derselbe Code auf zwei Wegen. Zwei
   * Rechnungen dafuer liefen beim naechsten Ort auseinander.
   */
  auditEvent({ module: "lagerbuch", action: "sign_in", objectType: "session", result: "success", origin: "server" }, auditAccessActor("lagerbuch", res.tokenId));
  redirect(returnTo ?? ortcodeZielPfad(res.ortId, res.zielTyp, res.zielId));
}
