import { auditDenied } from "@/core/audit/server";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DB } from "../_db/client";
import { tokens } from "../_db/schema";
import { requireLagerbuchHost } from "./host";
import { HELFER_COOKIE, verifyHelferSitzung } from "./helferSitzung";
import { gateGrundFuerSperre } from "./gateTexte";
import { fahrzeugBindungAus } from "./tokenZiel";
import { istLagerbuchAdmin, viewerOderNull } from "./zugang";
import { merkeNutzer } from "./konto";

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
 *
 * ⚠️ SEIT DRK-305 GIBT ES ZWEI HERKUENFTE, NICHT EINE. Neben dem Kaertchen
 * traegt auch ein ANGEMELDETES Lagerbuch-Konto in den Helfer-Ast. Die beiden
 * werfenden Riegel unten probieren in dieser Reihenfolge: erst das Kaertchen,
 * dann das Konto. Die Reihenfolge ist NICHT beliebig — wer ein
 * Fahrzeug-Kaertchen gescannt hat, behaelt dessen Bindung (DRK-302), auch
 * wenn er nebenbei angemeldet ist.
 *
 * ⚠️ `helferZugangOderNull` BLEIBT DAVON UNBERUEHRT und rein kaertchenbasiert.
 * Es ist das Praedikat der beiden Rollen-Weichen, und dort lautet die Frage
 * „hat diese Person ein Kaertchen eingeloest?“ — nicht „darf diese Person
 * etwas?“. Wer das Konto auch dort einzieht, dreht `a/[artikelId]` still um:
 * ein Regaletikett fuehrte eine angemeldete Person dann in die Helfer-Ansicht
 * statt in die Verwaltung, und die drei Ausgaenge im Kopf jener Datei stimmten
 * nicht mehr.
 */
/**
 * EIN KAERTCHEN-ZUGANG — der Regelfall: eingelöster Code, Cookie, Ablauf.
 */
export type TokenZugang = {
  herkunft: "token";
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
  /**
   * DAS FAHRZEUG, AN DAS DAS GESCANNTE KAERTCHEN GEBUNDEN IST — `null`, wenn es
   * an keines gebunden ist (DRK-302).
   *
   * Sie kommt aus DERSELBEN Token-Zeile wie `code` und `label`, kostet also
   * keinen zusaetzlichen Zugriff: `befund()` liest die Zeile ohnehin vollstaendig.
   * Und sie kommt aus der DATENBANK, nicht aus dem Cookie — dieselbe Begruendung
   * wie bei `code`/`label` (§3.4.4): eine in der Verwaltung geaenderte Zuordnung
   * wirkt sofort, statt zwoelf Stunden lang eingefroren zu bleiben.
   *
   * ⚠️ SIE IST EINE ANZEIGE-ENTSCHEIDUNG, KEIN RIEGEL — die Begruendung steht
   * ausgeschrieben an `fahrzeugBindungAus` (`_lib/tokenZiel.ts`). Wer sie hier
   * zum Riegel macht, beantwortet die offene Betreiberfrage 5 im Vorbeigehen.
   */
  fahrzeugBindung: string | null;
};

/**
 * DER ZWEITE WEG IN DEN HELFER-AST — DRK-305: ein angemeldetes Lagerbuch-Konto.
 *
 * Er entsteht NICHT aus einem Kaertchen und traegt deshalb weder Code noch
 * Label noch Ablauf. Die beiden `null`-Felder sind kein Platzhalter, sondern die
 * Aussage:
 *
 *  * `laeuftAb: null` — eine Kontositzung laeuft nicht in zwoelf Stunden ab. Der
 *    Rahmen zeigt darum keine Restzeit und keinen „Beenden"-Knopf, sondern den
 *    Weg zurueck in die Verwaltung (`_ui/HelferRahmen.tsx`).
 *  * `fahrzeugBindung: null` — DAS IST DER GANZE PUNKT DES TICKETS. DRK-302
 *    begrenzt den Einstieg nach dem SCAN auf das Fahrzeug des Kaertchens; wer
 *    angemeldet kommt, hat kein Kaertchen gescannt und waehlt aus allen aktiven
 *    Fahrzeugen. Die beiden Wege bleiben dadurch getrennt nutzbar.
 *
 * ⚠️ ER IST KEINE ZWEITE RECHTEQUELLE. Das Praedikat ist `istLagerbuchAdmin` —
 * dieselbe EINE Stufe, die auch `/verwaltung` gatet (`_lib/zugang.ts`). Wer hier
 * eine eigene Gruppe einzieht, legt ein zweites Rollenkonzept an, das niemand
 * pflegt; die Frage „bekommt GF eine eigene Rolle?" ist auf dem Board offen und
 * wird hier ausdruecklich NICHT im Vorbeigehen beantwortet.
 */
export type KontoZugang = {
  herkunft: "konto";
  /** Der OIDC-`sub`. Er ist die Journal-Quelle (`quelleTyp: "oidc"`). */
  sub: string;
  name: string | null;
  laeuftAb: null;
  fahrzeugBindung: null;
};

export type HelferZugang = TokenZugang | KontoZugang;

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
  | { ok: true; zugang: TokenZugang }
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
      herkunft: "token",
      tokenId: zeile.id,
      code: zeile.code,
      label: zeile.label,
      laeuftAb: sitzung.laeuftAb,
      // ABGELEITET, NICHT NOCH EINMAL ENTSCHIEDEN: dieselbe Funktion, aus der
      // `tokenZielPfad` seinen Fahrzeug-Zweig baut. Landung nach dem Scan und
      // Begrenzung des Einstiegs koennen so konstruktiv nicht auseinanderfallen.
      fahrzeugBindung: fahrzeugBindungAus(zeile.zielTyp, zeile.zielId),
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
export async function helferZugangOderNull(db: DB): Promise<TokenZugang | null> {
  requireLagerbuchHost(await headers());
  const b = await befund(db);
  return b.ok ? b.zugang : null;
}

/**
 * DER KONTO-ZWEIG — DRK-305.
 *
 * Liefert einen Zugang, wenn eine ANGEMELDETE Person die Lagerbuch-Gruppe
 * traegt, sonst `null`. Er wird nur erreicht, wenn vorher KEIN gueltiges
 * Kaertchen gefunden wurde.
 *
 * ⚠️ ER PRUEFT DEN HOST NICHT SELBST, und das ist hier ausnahmsweise richtig:
 * beide Aufrufer haben `requireLagerbuchHost` als ERSTE Anweisung hinter sich,
 * und `viewerOderNull` ist ausdruecklich host-blind (`_lib/zugang.ts` schreibt
 * das aus). Ein dritter Aufruf machte aus dem Praedikat wieder einen Wurf.
 *
 * ⚠️ `merkeNutzer` LAEUFT HIER, NACH dem Praedikat — dieselbe Reihenfolge wie in
 * `requireLagerbuchAdmin` (§4.13). Ohne die `users`-Zeile zeigte das Journal fuer
 * jede Buchung aus diesem Weg die ROHE OIDC-Kennung statt des Klarnamens
 * (`_db/quelle.ts`), und zwar still: die Buchung gelaenge, nur laese sie niemand.
 * Wer diesen Weg spaeter auf einen reinen LESEpfad einschraenkt, darf die Zeile
 * trotzdem nicht streichen — der Rahmen zeigt den Namen ebenfalls.
 */
async function kontoZugang(db: DB): Promise<KontoZugang | null> {
  const viewer = await viewerOderNull();
  if (!istLagerbuchAdmin(viewer) || !viewer) return null;
  merkeNutzer(db, viewer);
  return {
    herkunft: "konto",
    sub: viewer.sub,
    name: viewer.name,
    laeuftAb: null,
    fahrzeugBindung: null,
  };
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

  /*
   * DRK-305 — ERST DAS KAERTCHEN, DANN DAS KONTO, und beides VOR jeder
   * Umleitung.
   *
   * ⚠️ DER KONTO-ZWEIG LIEGT AUCH HINTER `grund: "gesperrt"`, nicht nur hinter
   * `"sitzung"`. Wer sich anmeldet und ausserdem ein totes Kaertchen-Cookie im
   * Browser hat — gesperrter Code, geloeschte Token-Zeile —, laendete sonst auf
   * `/abmelden` und kaeme mit seinem eigenen, gueltigen Zugang nirgendwohin. Das
   * Cookie bleibt in diesem Fall liegen; es ist wirkungslos, weil `befund()` es
   * bei jedem Aufruf erneut gegen die Datenbank prueft.
   */
  const konto = await kontoZugang(db);
  if (konto) return konto;

  auditDenied("lagerbuch");
  if (!b.hatteCookie) redirect("/");
  redirect(`/abmelden?grund=${gateGrundFuerSperre(b.grund)}`);
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
  if (b.ok) return { ok: true, zugang: b.zugang };

  // DRK-305 — dieselbe Reihenfolge wie im lesenden Riegel. Eine Buchung aus
  // diesem Weg traegt `quelleTyp: "oidc"` und den Klarnamen der Person statt des
  // Kaertchen-Labels (`_lib/zugangHerkunft.ts`).
  const konto = await kontoZugang(db);
  if (konto) return { ok: true, zugang: konto };

  auditDenied("lagerbuch");
  return { ok: false, grund: b.grund };
}
