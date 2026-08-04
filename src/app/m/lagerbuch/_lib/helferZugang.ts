import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DB } from "../_db/client";
import { tokens } from "../_db/schema";
import { requireLagerbuchHost } from "./host";
import { HELFER_COOKIE, verifyHelferSitzung } from "./helferSitzung";

/**
 * DIE AUTORITATIVE HELFER-PRUEFUNG — Host, Cookie-Signatur, Ablauf UND
 * `tokens.aktiv`. KEIN "use client" (Falle 6).
 *
 * ERSTE ANWEISUNG IST IMMER `requireLagerbuchHost(await headers())` (§2.6): nur so
 * ist die Zusage „jede Helfer-Action ist host-gebunden" durch KONSTRUKTION wahr
 * und nicht durch eine Liste, die die naechste Action vergisst.
 *
 * DER DB-RECHECK STEHT HEUTE NUR VOR SCHREIBENDEN AKTIONEN
 * (`lagerbuch/src/actions/session.ts:20-28`), und das WAR die Spezifikation
 * („der eine DB-Lookup pro Buchung"). Er wandert auf JEDEN Lesepfad, weil der
 * Riegel den Edge-Kontext verlaesst: dort war kein DB-Zugriff moeglich, hier ist
 * er einer von vielen auf derselben Seite. Der Lookup geht ueber den
 * Primaerschluessel `tokens.id` und liegt in derselben SQLite-Verbindung, die die
 * Seite ohnehin oeffnet. Ohne ihn liest ein gesperrter Code bis zu 12 Stunden
 * weiter den gesamten Bestand — was passiert, wenn ein laminiertes Etikett aus
 * einem Fahrzeug verschwindet.
 *
 * `code` und `label` kommen aus DIESER Zeile, nicht mehr aus der JWT-Nutzlast
 * (§3.4.3) — das ist der Grund, warum das Klartext-Secret aus dem Cookie
 * verschwinden konnte.
 */
export type HelferZugang = {
  tokenId: string;
  code: string;
  label: string;
  /**
   * Ablauf DIESER Sitzung, aus dem `exp` des verifizierten Cookies (§3.4.3).
   * Die einzige Angabe hier, die NICHT aus der Token-Zeile stammt — mit Absicht:
   * die Sperrung wirkt sofort und kommt deshalb aus der Datenbank, der Ablauf
   * steht seit der Ausstellung fest und kommt deshalb aus dem Cookie.
   * Sie kostet keinen zusaetzlichen Zugriff und traegt die Restzeit-Anzeige des
   * Helfer-Rahmens (§3.4.3 Punkt 1, §7.8.2).
   */
  laeuftAb: Date;
};

/**
 * Die zwei Gruende, mit denen eine schreibende Helfer-Action abgewiesen wird.
 *
 * ⚠️ SIE SIND DIE GETEILTE HAELFTE VON `HelferGrund` (§7.3, Teil 4). Verbindlich
 * fuer `_lib/actionTypen.ts`:
 *
 *     import type { SperrGrund } from "./helferZugang";
 *     export type HelferGrund = SperrGrund | "leer" | "netz";
 *
 * Zwei getrennte Literal-Unions fuer dieselben zwei Woerter waeren die
 * Typinkonsistenz, gegen die die Schnittstellenbloecke der Plaene geschrieben
 * sind — sie faellt erst auf, wenn jemand eine der beiden erweitert.
 *
 * DIE UNTERSCHEIDUNG IST NICHT KOSMETISCH: bei `sitzung` hilft ein erneutes
 * Einloesen, bei `gesperrt` NICHT — derselbe Code scheitert genauso. Genau daran
 * haengt, ob §7.4.4 das Inline-Feld zur Code-Erneuerung ueberhaupt anbietet.
 */
export type SperrGrund = "sitzung" | "gesperrt";

/**
 * Der gemeinsame Rumpf aller drei Riegel. `hatteCookie` bleibt INTERN: es
 * entscheidet allein darueber, ob `requireHelferSitzung` den /abmelden-Umweg
 * nimmt — fehlt das Cookie ganz, gibt es nichts zu raeumen (§3.4.4).
 */
type Befund =
  | { ok: true; zugang: HelferZugang }
  | { ok: false; grund: SperrGrund; hatteCookie: boolean };

async function befund(db: DB): Promise<Befund> {
  const roh = (await cookies()).get(HELFER_COOKIE)?.value;
  if (!roh) return { ok: false, grund: "sitzung", hatteCookie: false };

  const sitzung = await verifyHelferSitzung(roh);
  if (!sitzung) return { ok: false, grund: "sitzung", hatteCookie: true };

  // DER RECHECK. `!zeile || !zeile.aktiv` ist derselbe Doppeltest, den
  // `redeemToken` fuehrt (`token-redeem.ts:15`) — ein manipuliertes tokenId in
  // einem gueltig signierten Cookie verhaelt sich damit wie ein gesperrter Code.
  const zeile = db.select().from(tokens).where(eq(tokens.id, sitzung.tokenId)).get();
  if (!zeile || !zeile.aktiv) return { ok: false, grund: "gesperrt", hatteCookie: true };

  return {
    ok: true,
    zugang: {
      tokenId: zeile.id,
      code: zeile.code,
      label: zeile.label,
      laeuftAb: sitzung.laeuftAb,
    },
  };
}

/**
 * DAS PRAEDIKAT — fuer die beiden Rollen-Weichen `a/[artikelId]/page.tsx` und
 * `g/[code]/page.tsx` (§3.2.1, §7.4.3).
 *
 * Beide haben einen DRITTEN gueltigen Fall — „keine Sitzung → Gate mit
 * `returnTo`" —, den ein werfender Riegel nach `/login` umleitete. ⚠️ `/g` hat
 * ueberdies GAR KEINEN Zweig, der eine Helfer-Sitzung VERLANGT: der Bestand
 * liest sie dort nur als Praedikat, um Helfer nach `/helfer` zu schicken
 * (`g/[code]/page.tsx:23-24`).
 *
 * LEITET NICHT UM UND LOESCHT NICHTS.
 */
export async function helferZugangOderNull(db: DB): Promise<HelferZugang | null> {
  requireLagerbuchHost(await headers());
  const b = await befund(db);
  return b.ok ? b.zugang : null;
}

/**
 * Fuer Layouts und Seiten: leitet ans Gate, mit benanntem Grund (§3.9).
 * AUFRUFER: `helfer/layout.tsx`, SONST NIRGENDS (§2.8).
 *
 * WARUM DER UMWEG UEBER /abmelden — gemessen, nicht vermutet. Diese Funktion
 * wird aus einer SERVER COMPONENT gerufen, und dort ist `cookies()` versiegelt:
 * `delete`, `set` und `clear` sind durch einen Proxy ersetzt, der wirft
 * (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53` traegt
 * den Satz „Cookies can only be modified in a Server Action or Route Handler"
 * woertlich, `:171` haengt den Riegel an `cookies().delete`; nachgeschlagen im
 * Arbeitsbaum, Next 16.2.11). Ein `cookies().delete(HELFER_COOKIE)` an der
 * Stelle, an der der Sperrbefund auffaellt, ist also NICHT „unsauber", sondern
 * ein Laufzeitfehler. Ein totes Cookie darf nicht liegen bleiben — es sorgte
 * sonst bei jedem weiteren Aufruf fuer denselben Umweg.
 *
 * ⚠️ DER UMWEG GILT NUR, WENN EIN COOKIE DA WAR. Fehlt es ganz, gibt es nichts
 * zu raeumen und der Redirect geht unmittelbar aufs Gate — auf einem Telefon im
 * Fahrzeug ist das eine Runde statt zwei.
 */
export async function requireHelferSitzung(db: DB): Promise<HelferZugang> {
  requireLagerbuchHost(await headers());
  const b = await befund(db);
  if (b.ok) return b.zugang;
  if (!b.hatteCookie) redirect("/");
  redirect(b.grund === "gesperrt" ? "/abmelden?grund=gesperrt" : "/abmelden?grund=abgelaufen");
}

/**
 * Fuer schreibende Actions (`_actions/buchung.ts`, `_actions/check.ts`).
 *
 * WIRFT NICHT, sondern liefert ein Ergebnis (§7.3) — bis zur Portierung warf
 * dieser Riegel (`session.ts:25,28`), und ein Wurf liess sich nicht uebersehen.
 * Ein Rueckgabewert schon: `await requireHelferSchreibend(db)` OHNE Pruefung ist
 * typkorrekt, lint-sauber und oeffnet die Action fuer jeden. Das einzige Netz
 * dagegen ist der E2E „gesperrter Token wird an der Buchung abgewiesen" (§3.8.3)
 * — deshalb steht der Aufruf in BEIDEN Actions als ERSTE Anweisung, mit
 * ausgeschriebenem Kommentar, und der Guard-Scan haelt das fest.
 *
 * ⚠️ „WIRFT NICHT" GILT FUER DIE ERWARTBAREN LAGEN, nicht fuer den Host-Riegel.
 * §7.3 nimmt den Riegelfall ausdruecklich vom Rueckgabewert-Gebot aus („nicht
 * 'erwartbar', sondern 'manipuliert'"). Ein Action-POST auf dem falschen Host
 * ist kein Betriebsfall, den ein Formular anzeigen muesste — und wer den Aufruf
 * hier „aus Konsistenz" entfernt, oeffnet genau die Luecke, gegen die Falle 61
 * gebaut ist.
 *
 * NIMMT DEN /abmelden-UMWEG NIE: es leitet nicht um, sondern gibt zurueck, und
 * der naechste Seitenaufruf laeuft ohnehin durch das Layout.
 *
 * Laeuft die Sitzung zwischen Eingabe und Absenden ab, antwortet die Action mit
 * einem benannten Fehlerzustand AM FORMULAR (`useActionState`), NICHT mit
 * `redirect()`. Ein Redirect verwuerfe die eingetragenen Mengen — genau der
 * Datenverlust, den `docs/design/README.md` unter „Kommen Fehler aus
 * Server-Actions am Feld an?" ausschliesst.
 */
export async function requireHelferSchreibend(
  db: DB,
): Promise<{ ok: true; zugang: HelferZugang } | { ok: false; grund: SperrGrund }> {
  requireLagerbuchHost(await headers());
  const b = await befund(db);
  return b.ok ? { ok: true, zugang: b.zugang } : { ok: false, grund: b.grund };
}
