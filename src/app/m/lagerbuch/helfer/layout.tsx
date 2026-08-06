import { requireHelferSitzung } from "../_lib/helferZugang";
import { getDb } from "../_db/client";

/**
 * DAS HELFER-LAYOUT TRAEGT NUR DEN RIEGEL, NICHT DEN RAHMEN (§7.4.3, §7.8.2).
 *
 * ⚠️ FALLE 17: Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (§2.1 d).
 * Dieses Layout ist eine BEQUEMLICHKEIT, keine Absicherung — die tragende
 * Zusage sind die aufrufbaren Funktionen. Genau deshalb ruft `helfer/page.tsx`
 * `requireHelferSitzung` SELBST noch einmal: nicht aus Misstrauen, sondern weil
 * ein Layout einer Seite keine Props reichen kann und `sitzungsetikett` und
 * `laeuftAb` von dort kommen.
 *
 * ⚠️ DER HOST-RIEGEL STEHT HIER NICHT NOCH EINMAL, und das ist eine bewusste
 * Abweichung vom abgedruckten Plan (Befund 37 des Preflight-Scans). Global
 * Constraint 24 lautet woertlich: „`requireHelferSitzung` und
 * `requireHelferSchreibend` rufen `requireLagerbuchHost` INTERN, als erste
 * Anweisung. Wer sie benutzt, ruft den Host-Riegel NICHT noch einmal."
 * `_lib/host.ts` schreibt denselben Satz in seiner Aufruftabelle aus, T75
 * erzwingt ihn fuer `_actions/sitzung.ts` mit einem eigenen `not.toMatch`, und
 * `helfer/page.tsx` wie `helfer/check/page.tsx` halten sich daran. Ein zweiter
 * Aufruf hier waere keine Haertung, sondern die Behauptung, der Riegel sei
 * host-blind — und genau die Behauptung macht die Zusage „host-gebunden durch
 * KONSTRUKTION" wieder zu einer Liste, die die naechste Datei vergisst.
 * `page.test.tsx` prueft es am Verhalten: die Kopfzeilen werden GENAU EINMAL
 * gelesen, und der Riegel weist einen fremden Host ab, BEVOR er das Cookie
 * anfasst.
 *
 * ⚠️ DIESE DATEI IST EINE SERVER COMPONENT UND KANN KEIN COOKIE RAEUMEN:
 * `cookies()` ist dort versiegelt, `delete` wirft
 * (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53` traegt
 * den Satz „Cookies can only be modified in a Server Action or Route Handler"
 * woertlich). Der Sperr- und der Ablauffall gehen darum ueber den Route
 * Handler `/abmelden` (Teil 2, T26) — `requireHelferSitzung` leitet dorthin um,
 * ALS STRING, nicht als Import.
 *
 * KEIN `<Shell>` (§7.1.1) und KEIN `viewport`-Export (§7.7.2).
 */
export const dynamic = "force-dynamic";

export default async function HelferLayout({ children }: { children: React.ReactNode }) {
  // §3.4.4 — prueft Host (intern, erste Anweisung), Cookie UND `tokens.aktiv`.
  await requireHelferSitzung(getDb());
  return <>{children}</>;
}
