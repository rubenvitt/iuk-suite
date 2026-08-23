import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth";
import type { DB } from "../_db/client";
import { zugangscodes } from "../_db/schema";
import { AUSLEIH_COOKIE, verifyAusleihSitzung } from "./ausleihSitzung";
import { requireRadioHost } from "./host";
import { viewerAusSession } from "./zugang";

/**
 * DAS ZUGANGSPRAEDIKAT DER AUSLEIHE (Spec 1 §3.5, Zeilen 2632-2786).
 * KEIN "use client" (Falle 6, `CLAUDE.md:27`; durchgesetzt von `riegel.test.ts:684-703`).
 *
 * ZWEI WEGE, EINE FUNKTION, EIN ERGEBNISTYP (Spec:2636-2638) — nicht zwei Riegel, die
 * jede Flaeche einzeln nebeneinanderstellt. Das waere die Liste, die die naechste Datei
 * vergisst.
 *
 * ⬜ A-L9 — DIE GRENZE DIESER DATEI, BENANNT STATT BEHAUPTET: dass diese Riegel bei einem
 * ECHTEN Abruf GREIFEN, ist unbewiesen (Erbe von Z-L1, `riegel.test.ts:45-49`);
 * Eigentuemer ist Planteil 5 mit dem ersten e2e-Lauf. Was hier und in
 * `ausleihZugang.test.ts` belegt ist: die LOGIK des Praedikats.
 *
 * ⚠️ ABWEICHUNG VOM VORBILD `src/app/m/lagerbuch/_lib/helferZugang.ts`, ABSICHTLICH UND
 * TRAGEND: dort steht `requireLagerbuchHost(await headers())` als erste Anweisung JEDER
 * der drei oeffentlichen Funktionen (`:110`, `:135`, `:170`), und `befund` beginnt beim
 * Cookie. Hier steht der Host-Riegel als SCHRITT 1 DES GEMEINSAMEN RUMPFS (Spec:2677) und
 * dort nur einmal. Beides erfuellt „alle drei rufen ihn als erste Anweisung, intern"
 * (Spec:2668-2672) — denn alle drei rufen `befund` als erste Anweisung. Die hiesige Form
 * ist die pruefbare: sie liest die Kopfzeilen GENAU EINMAL je Aufruf (Testauftrag
 * Spec:3092), und eine zweite Lesung waere in der Vorbildform unsichtbar.
 */

/**
 * ⛔ EINE UNTERSCHEIDENDE VEREINIGUNG, KEIN OBJEKT MIT OPTIONALEN FELDERN (Spec:2719-2722).
 * `{ weg: "code" | "suite"; codeId?: string; sub?: string }` waere der Ort, an dem eine
 * Flaeche `codeId` liest, `undefined` bekommt und still den falschen Zweig nimmt. Mit der
 * Vereinigung erzwingt `pnpm typecheck` an jeder Verwendung eine Fallunterscheidung.
 *
 * ⛔ AUFLAGE 4 — KEINE DRITTE QUELLE (Spec:2723-2727): `weg: "suite"` entsteht
 * AUSSCHLIESSLICH aus `viewerAusSession(await auth())`, `weg: "code"` AUSSCHLIESSLICH aus
 * einem signaturgeprueften Cookie PLUS dem DB-Recheck. Woertlich: KEIN Bearer-Header,
 * KEIN `?token=`-Parameter, KEIN localStorage. Der Alt-Kiosk traegt genau beides — er
 * setzt `searchParams.set("token", …)` auf die App-URL
 * (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:24`) und legt
 * den Wert dann ab (`.../routes/__root.tsx:59-72`). Er wird NICHT uebergangsweise
 * mitakzeptiert — eine Doppelakzeptanz brauchte ein Ablaufdatum, das niemand setzt, und
 * waere genau der unbefristete, unwiderrufliche Zugang, den Entscheidung 8 ausschliesst.
 *
 * ⚠️ DIESE DREI WOERTER STEHEN HIER ABSICHTLICH AUSGESCHRIEBEN, und sie sind zugleich die
 * LAST des Scans in `ausleihZugang.test.ts`: er liest die Quelle ueber `ohneKommentare`
 * (Kopie aus `riegel.test.ts:163-183`). Ohne diesen Kopf traefe der Scan nichts und
 * bewiese nichts — mit ihm ist gemessen, dass er die Kommentare wirklich leert (Sonde
 * S-A7e). ⛔ Wer den Kopf entschaerft, macht den Scan still wirkungslos; wer den Scan
 * „repariert", schwaecht ihn.
 *
 * `laeuftAb` ist die einzige Angabe des Code-Wegs, die NICHT aus der Codezeile stammt: die
 * Sperrung wirkt sofort und kommt deshalb aus der Datenbank, der Ablauf steht seit der
 * Ausstellung fest und kommt deshalb aus dem Cookie (`_lib/ausleihSitzung.ts:141-152`).
 */
export type AusleihZugang =
  | { weg: "code"; codeId: string; bezeichnung: string; laeuftAb: Date }
  | { weg: "suite"; sub: string; name: string | null };

/**
 * Die zwei Gruende, mit denen eine schreibende Ausleih-Action abgewiesen wird.
 *
 * NICHT KOSMETISCH: bei "sitzung" hilft ein erneuter Scan, bei "gesperrt" NICHT —
 * derselbe Code scheitert genauso. Daran haengt, ob die Inline-Erneuerung aus §3.4.4
 * ueberhaupt angeboten wird (Spec:2568-2570, woertlich: „ein Feld, das nicht helfen kann,
 * ist schlimmer als eine klare Absage").
 *
 * ⚠️ SIE IST DIE GETEILTE HAELFTE DER ZWEI `grund`-UNIONS (Entscheidung E13 des Plans,
 * abgelesen von A14). Zwei getrennte Literal-Unions fuer dieselben zwei Woerter waeren die
 * Typinkonsistenz, die erst auffaellt, wenn jemand eine der beiden erweitert.
 */
export type SperrGrund = "sitzung" | "gesperrt";

/**
 * Der gemeinsame Rumpf aller drei Formen — EINER, nicht drei Kopien.
 *
 * `hatteCookie` bleibt INTERN: es entscheidet allein darueber, ob `requireAusleihZugang`
 * den /abmelden-Umweg nimmt. Fehlt das Cookie ganz, gibt es nichts zu raeumen
 * (Spec:2409).
 *
 * ⛔ DIE REIHENFOLGE DER SECHS SCHRITTE IST VERBINDLICH (Spec:2676-2685).
 */
type Befund =
  | { ok: true; zugang: AusleihZugang }
  | { ok: false; grund: SperrGrund; hatteCookie: boolean };

async function befund(db: DB): Promise<Befund> {
  /*
   * SCHRITT 1 — DER HOST, VOR ALLEM ANDEREN. AUFLAGE 1 (Spec:2668-2672, NS-Z1, Pflicht 16
   * in `docs/radio-portierung-analyse.md:973-977`): weil der Host-Riegel INNEN sitzt, ist
   * „jede Ausleih-Action ist host-gebunden" durch KONSTRUKTION wahr und nicht durch eine
   * Liste, die die naechste Action vergisst — Server Actions haben kein Layout ueber sich.
   *
   * ⛔ DIE UMKEHRUNG IST GLEICH STARK UND DIE HAEUFIGERE FEHLERQUELLE: wer diese Datei
   * benutzt, ruft `requireRadioHost` NICHT NOCH EINMAL (Pflicht 16, `_lib/host.ts:117-121`).
   * Ein zweiter Aufruf waere keine Haertung, sondern die Behauptung, das Praedikat sei
   * host-blind — und die naechste Person entfernt dann den falschen der beiden.
   */
  requireRadioHost(await headers());

  /*
   * SCHRITT 2 — DIE SUITE-SITZUNG ZUERST. AUFLAGE 2 (Spec:2694-2708). Ein angemeldetes
   * Mitglied mit abgelaufenem oder gesperrtem Code-Cookie ist der REGELFALL: wer heute den
   * Aufsteller gescannt hat und morgen aus der Kachel kommt, traegt beides. Pruefte
   * `befund` den Code zuerst, lieferte er `grund: "gesperrt"` und die Person landete am
   * Gate — obwohl Weg 2 sie vollstaendig berechtigt. Das ist „einer hebelt den anderen
   * aus", und es waere typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar.
   *
   * KEIN DB-ZUGRIFF: `auth()` liest das Suite-JWT. Die billigere Pruefung zuerst ist
   * zugleich die richtige (Spec:2704-2706).
   *
   * ⚠️ FOLGE, DIE DASTEHEN MUSS: ein totes Code-Cookie einer angemeldeten Person wird
   * NICHT geraeumt, weil `befund` hier aussteigt. Es laeuft ueber sein `maxAge` von selbst
   * ab und ist bis dahin ein Header ohne Wirkung (Spec:2706-2708). Das ist der Preis der
   * Reihenfolge, und er ist der kleinere.
   *
   * ⛔ AUFLAGE 5 — FUER `weg: "suite"` WIRD KEINE GRUPPE VERLANGT (Spec:2729-2736). Jede
   * Suite-Sitzung genuegt: `radio` steht mit `requiresAuth: false` und ohne
   * `requiredGroups` in der Registry, und die Ausleihe ist absichtlich anonym. Eine
   * Gruppenpruefung genau hier stuende in unloesbarem Widerspruch dazu, dass derselbe
   * Vorgang OHNE JEDE ANMELDUNG per QR-Code erlaubt ist.
   *
   * ⚠️ `viewerAusSession`, NICHT `viewerOderNull()`: letztere ruft `requireRadioHost`
   * absichtlich nicht (`_lib/zugang.ts:86-88`) und ist die SICHTBARKEITSform fuer den
   * /admin-Link, nicht die Zugangsform.
   */
  const viewer = viewerAusSession(await auth());
  if (viewer) {
    return { ok: true, zugang: { weg: "suite", sub: viewer.sub, name: viewer.name } };
  }

  // SCHRITT 3 — kein Cookie: es gibt nichts zu raeumen (Spec:2409).
  const roh = (await cookies()).get(AUSLEIH_COOKIE)?.value;
  if (!roh) return { ok: false, grund: "sitzung", hatteCookie: false };

  /*
   * SCHRITT 4 — die Signatur. `verifyAusleihSitzung` WIRFT NIE, sie gibt `null`
   * (`_lib/ausleihSitzung.ts:141-152`): der Cookiewert ist Nutzereingabe, und ein Wurf
   * waere HTTP 500 auf JEDER Ausleihseite (Spec:2508-2513).
   */
  const sitzung = await verifyAusleihSitzung(roh);
  if (!sitzung) return { ok: false, grund: "sitzung", hatteCookie: true };

  /*
   * SCHRITT 5 — DER RECHECK, UND ER IST DIE EINZIGE WIDERRUFSMECHANIK. AUFLAGE 3,
   * Pflicht 15 (`docs/radio-portierung-analyse.md:959-971`), woertlich: „ein signiertes
   * Cookie kann man nicht zurueckrufen, eine Datenbankzeile schon."
   *
   * ⛔ ER STEHT AUF JEDEM LESEPFAD, NICHT NUR VOR SCHREIBVORGAENGEN — er sitzt deshalb im
   * gemeinsamen Rumpf und nicht in `requireAusleihSchreibend`. Ohne ihn auf dem Lesepfad
   * saehe ein gesperrter Code bis zu zwoelf Stunden weiter den gesamten Geraetebestand
   * samt Entleihernamen. Der Lookup geht ueber den Primaerschluessel und liegt in
   * derselben SQLite-Verbindung, die die Seite ohnehin oeffnet (Spec:2686-2692).
   *
   * `!zeile || !zeile.aktiv` ist derselbe Doppeltest, den `loeseCodeEin` fuehrt
   * (`_lib/schreibpfade/codeEinloesung.ts:60-64`) — ein manipuliertes `codeId` in einem
   * gueltig signierten Cookie verhaelt sich damit wie ein gesperrter Code.
   */
  const zeile = db.select().from(zugangscodes).where(eq(zugangscodes.id, sitzung.codeId)).get();
  if (!zeile || !zeile.aktiv) return { ok: false, grund: "gesperrt", hatteCookie: true };

  /*
   * SCHRITT 6 — `bezeichnung` KOMMT AUS DIESER ZEILE, NICHT AUS DER COOKIE-NUTZLAST
   * (Pflicht 15, `docs/radio-portierung-analyse.md:969-971`). Genau deshalb konnte das
   * Klartext-Geheimnis aus dem Cookie verschwinden — die Nutzlast traegt nur `codeId`
   * (`_lib/ausleihSitzung.ts:47`).
   */
  return {
    ok: true,
    zugang: {
      weg: "code",
      codeId: zeile.id,
      bezeichnung: zeile.bezeichnung,
      laeuftAb: sitzung.laeuftAb,
    },
  };
}

/**
 * DAS PRAEDIKAT (Spec:2653-2654). LEITET NICHT UM UND LOESCHT NICHTS.
 *
 * AUFRUFER: `page.tsx`, die Weiche Gate-oder-Ausleihe (A11), und jede Flaeche mit einem
 * DRITTEN gueltigen Fall. Dort ist „kein Zugang" der REGELFALL, nicht der Fehlerfall — ein
 * `redirect()` an dieser Stelle machte aus der Weiche einen Werfer, und ein gesperrter
 * Code liefe in eine 303-Runde statt ins Codefeld (Spec:2407).
 *
 * Das tote Cookie raeumt der naechste /abmelden-Weg oder sein eigenes `maxAge`.
 */
export async function ausleihZugangOderNull(db: DB): Promise<AusleihZugang | null> {
  const b = await befund(db);
  return b.ok ? b.zugang : null;
}

/**
 * FUER LAYOUTS UND SEITEN unter `(ausleihe)/` (A18-A20). Leitet ans Gate um, mit benanntem
 * Grund.
 *
 * ⛔ AUFLAGE 6 — SIE LEITET UM, RAEUMT ABER NICHTS (Bauform-Zulaessigkeitstafel Zeile 7,
 * Plan `2026-08-22-radio-modul-plan3-zugang-ausleihe.md:348`). Sie wird aus einer SERVER
 * COMPONENT gerufen, und dort ist `cookies()` versiegelt: `set`, `delete` und `clear` sind
 * durch einen Proxy ersetzt, der WIRFT (belegt im Bestand:
 * `src/app/m/lagerbuch/abmelden/route.ts:12-20` mit Quellenverweis auf
 * `next/dist/server/web/spec-extension/adapters/request-cookies.js:53/171`). Ein
 * `cookies().delete(AUSLEIH_COOKIE)` an der Stelle, an der der Sperrbefund auffaellt, ist
 * also kein Stilfehler, sondern ein Laufzeitfehler. Geraeumt wird im ROUTE HANDLER
 * `/abmelden` (A10), und zwar ueber `ausleihCookieOptionen(0)` statt ueber `delete`
 * (Spec:2588-2593).
 *
 * ⚠️ DER UMWEG GILT NUR, WENN EIN COOKIE DA WAR. Fehlt es ganz, geht der Redirect
 * unmittelbar aufs Gate — auf einem Telefon ist das eine Runde statt zwei (Spec:2409).
 *
 * ⚠️ KEIN `try`/`catch` UM DIESEN RUMPF. `redirect()` arbeitet ueber einen geworfenen
 * Sentinel; ein `catch` verschluckt ihn, und die Weiterleitung findet still nicht statt.
 */
export async function requireAusleihZugang(db: DB): Promise<AusleihZugang> {
  const b = await befund(db);
  if (b.ok) return b.zugang;
  if (!b.hatteCookie) redirect("/");
  redirect(b.grund === "gesperrt" ? "/abmelden?grund=gesperrt" : "/abmelden?grund=abgelaufen");
}

/**
 * FUER SCHREIBENDE AUSLEIH-ACTIONS (A17), als ERSTE Anweisung.
 *
 * ⛔ AUFLAGE 7 — SIE WIRFT NICHT UND LEITET NICHT UM, und das ist „die gefaehrlichste
 * Eigenschaft dieses Kapitels" (Spec:2780-2784). Ein `redirect()` aus einer schreibenden
 * Action verwuerfe die eingetragenen Werte: der Mensch haette vier Geraete und einen Namen
 * eingegeben und faende ein leeres Formular vor. Der Fehlerzustand gehoert AN DAS FORMULAR
 * (`useActionState`), nie in eine Weiterleitung (Spec:2411-2415).
 *
 * ⚠️ DIE KEHRSEITE, AUSGESCHRIEBEN: `await requireAusleihSchreibend(db)` OHNE Pruefung des
 * Ergebnisses ist typkorrekt, lint-sauber und oeffnet die Action fuer JEDEN. Das einzige
 * Netz dagegen sind der Guard-Scan aus A8 und der e2e-Test aus Planteil 5 — kein
 * Unit-Test dieser Datei kann es fangen, weil er die Funktion prueft und nicht ihre
 * Aufrufer.
 *
 * ⚠️ „WIRFT NICHT" GILT FUER DIE ERWARTBAREN LAGEN, NICHT FUER DEN HOST-RIEGEL. Ein
 * Action-POST auf dem falschen Host ist kein Betriebsfall, den ein Formular anzeigen
 * muesste, sondern ein manipulierter (Spec:2364-2366) — `befund` wirft dort weiterhin.
 */
export async function requireAusleihSchreibend(
  db: DB,
): Promise<{ ok: true; zugang: AusleihZugang } | { ok: false; grund: SperrGrund }> {
  const b = await befund(db);
  return b.ok ? { ok: true, zugang: b.zugang } : { ok: false, grund: b.grund };
}
