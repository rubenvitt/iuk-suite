import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { adminGroupsFor } from "@/core/groups";
import { getModule, prodHostsFor } from "@/core/registry";
import { getDb } from "../_db/client";
import { requireLagerbuchHost } from "./host";
import { merkeNutzer } from "./konto";
import { sanitizeReturnTo } from "./returnTo";

/**
 * DER ZUGANG ZUR VERWALTUNG — EINE Stufe, ohne Suite-Admin und ohne zweite
 * Gruppenquelle. KEIN "use client" (Falle 6).
 *
 * ZWEI FORMEN, EINE REGEL (§3.2.1): der werfende Riegel `requireLagerbuchAdmin`
 * gehoert in Layouts und Verwaltungs-Actions; das nicht-werfende Paar
 * `viewerOderNull` + `istLagerbuchAdmin` gehoert in die beiden Rollen-Weichen
 * (`a/[artikelId]/page.tsx`, `g/[code]/page.tsx`) und aufs Gate — dort ist
 * „keine Sitzung" ein DRITTER gueltiger Fall, kein Fehlerfall.
 *
 * ⚠️ DIE GRENZE GEHOERT ZUR REGEL: „Praedikat in Weichen" gilt NICHT fuer
 * `_actions/`. Eine Action hat keine Weiche — sie hat einen Aufrufer, der schon
 * entschieden hat. Der Guard-Scan (`_actions/guards.test.ts`) haelt das fest.
 */

export type Viewer = { sub: string; groups: string[]; name: string | null; email: string | null };

/**
 * Sitzung → Viewer, OHNE Wurf.
 *
 * BEWUSST NICHT aus `m/files/_lib/access.ts:107-113` kopiert: dort hat `Viewer`
 * ZWEI Felder (`sub`, `groups`), hier VIER. `merkeNutzer(db, viewer)` (§4.13)
 * schreibt `name` und `email` in `users`; eine zweifeldrige Kopie truege still
 * `null` in beide Spalten und erzeugte damit den benannten Defektzustand aus
 * §4.13 — eine ROHE `sub`-Kennung im Journal statt eines Namens. Die Werte liegen
 * an: `core/auth/config.ts:163-176` laesst `session.user.name/email` unangetastet
 * und setzt nur `groups`, `isAdmin` und `id`.
 *
 * Ohne `user.id` gibt es keinen Viewer; ein fehlender `groups`-Claim ist die
 * leere Menge und laeuft damit in den 404 des Riegels, nicht in einen 500 —
 * sonst haenge die Fehlerform an der Token-Version.
 */
export function viewerAusSession(
  session: {
    user?: { id?: string; groups?: string[]; name?: string | null; email?: string | null };
  } | null,
): Viewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return {
    sub: id,
    groups: session.user?.groups ?? [],
    name: session.user?.name ?? null,
    email: session.user?.email ?? null,
  };
}

/**
 * DIE NICHT-WERFENDE FORM — fuer die beiden Rollen-Weichen und fuer das Gate
 * (§2.1 c, §3.2.1, §7.2.4).
 *
 * Diese drei Dateien haben je DREI gueltige Faelle, und der dritte ist immer
 * „keine Sitzung". `requireLagerbuchAdmin()` an ihrer Weiche schickte jeden
 * anonymen Scan eines Regaletiketts nach `/login` statt aufs Gate mit `returnTo`
 * — genau der Ausfall, den `requiresAuth: false` (§2.3) verhindern soll, und er
 * waere typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar.
 *
 * ⚠️ SIE RUFT `requireLagerbuchHost` ABSICHTLICH NICHT. `requireLagerbuchAdmin`
 * tut es, und wer es hier aus Analogie nachtraegt, verwandelt das Praedikat
 * zurueck in einen Wurf. Der Host-Riegel steht in allen drei aufrufenden Dateien
 * ohnehin als ERSTE Anweisung, vor dieser Funktion (§2.6).
 */
export async function viewerOderNull(): Promise<Viewer | null> {
  return viewerAusSession(await auth());
}

/**
 * BEWUSST NICHT `isModuleAdmin` aus `core/groups` — dieselbe Entscheidung wie in
 * `feedback` (`_lib/access.ts:9-30`), hier aus einem eigenen Anlass: hinter
 * `/verwaltung` liegen das Journal mit KLARNAMEN und der Etikettenbogen mit den
 * Token-Codes IM KLARTEXT — dem Secret selbst. Betrieb und Einsicht sind zwei
 * Rollen; wer den Server betreibt, hat damit noch keinen Anlass, die Bewegungen
 * einer Bereitschaft zu lesen oder Zugangscodes zu drucken. Wer lagerbuch
 * verwalten soll, gehoert in das, was SUITE_ADMIN_GROUP_LAGERBUCH benennt —
 * auch der Betreiber selbst (Betreiber-Entscheidung 3).
 *
 * ES GIBT NUR DIESE EINE STUFE. Kein zweites Praedikat, keine
 * Zugehoerigkeitspruefung zwischen Verwaltenden; `tokens.created_by` und
 * `journal.quelle_id` sind Nachweis und Anzeige, nie Berechtigung. Wer hier einen
 * `assertGroupAccess`-Zwilling wie in `feedback` sucht: es gibt ihn nicht, und
 * das ist Absicht.
 *
 * `adminGroupsFor(mod)`, NIE `mod.adminGroups` — der direkte Feldzugriff macht
 * SUITE_ADMIN_GROUP_LAGERBUCH an genau dieser Stelle wirkungslos
 * (`registry.ts:28-34` schreibt dieselbe Falle fuer prodHosts aus).
 *
 * `some()`, NICHT die `canAccess`-Verknuepfung: eine LEERE Liste gewaehrt NICHTS.
 * `canAccess` (`registry.ts:157-159`) steigt bei leerer Liste mit `true` aus —
 * `core/groups.ts:53-54` nennt das woertlich „eine OEFFNUNG". Wer das abschreibt,
 * oeffnet die Verwaltung fuer JEDEN Eingeloggten, und der Fehler ist still.
 *
 * UND BEWUSST NICHT DIE `files`-VERKNUEPFUNG: `requiredGroupsFor` wird NICHT
 * mitgelesen (§2.5, Punkt 3) — das waere eine stille zweite Tuer.
 *
 * `session.user.isAdmin` kommt in diesem Modul NIRGENDS vor. Ein 1:1-Port von
 * `lagerbuch/src/lib/auth/cordon.ts:14-20` waere typkorrekt, liefe durch
 * `pnpm build` und oeffnete die gesamte Verwaltung fuer jeden Suite-Betreiber
 * (Falle 13). `_lib/bauform.test.ts` haelt das mit einer Quelltext-Zusicherung
 * fest.
 */
export function istLagerbuchAdmin(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  const erlaubt = adminGroupsFor(getModule("lagerbuch"));
  return viewer.groups.some((g) => erlaubt.includes(g));
}

/**
 * EINMAL JE PERSON JE PROZESS, nicht je Anfrage. Der Riegel liegt auf einem
 * 404-Pfad, den ein Bot beliebig oft treffen kann; unbegrenztes Loggen waere ein
 * Flutungsvektor und machte `docker logs` fuer genau den Zweck unbrauchbar, fuer
 * den die Zeile da ist. Der Satz ersetzt `lagerbuch/src/auth.config.ts:94-99` —
 * den einzigen Ort, an dem heute sichtbar wird, WELCHE Gruppen im Token standen;
 * ein grep auf `console\.` ueber `src/core/auth/` liefert null Treffer, die Suite
 * antwortet stumm.
 *
 * KEINE Kennung, keine E-Mail, kein Name in der Zeile — dieselbe Form wie heute
 * (`auth.config.ts:95-99` protokolliert Gruppen und Claim-Schluessel, keine
 * Person). Der `sub` dient hier AUSSCHLIESSLICH als Dedup-Schluessel im Speicher.
 *
 * ⚠️ ANNAHME: der prozess-lokale Set waechst mit der Zahl abgewiesener Personen,
 * nicht mit der Zahl der Anfragen; bei einer Organisation dieser Groesse ist das
 * eine dreistellige Obergrenze und braucht keine Verdraengung.
 */
const bereitsGemeldet = new Set<string>();

function meldeFehlendeGruppe(sub: string, gruppen: string[]): void {
  if (bereitsGemeldet.has(sub)) return;
  bereitsGemeldet.add(sub);
  console.warn(
    `[lagerbuch] Zugriff auf /verwaltung abgelehnt: keine der Gruppen ` +
      `${JSON.stringify(adminGroupsFor(getModule("lagerbuch")))} in den Token-Gruppen ` +
      `${JSON.stringify(gruppen)}. Pruefe SUITE_ADMIN_GROUP_LAGERBUCH und ob Pocket ID ` +
      `einen "groups"-Claim mit dieser Gruppe ausliefert.`,
  );
}

/** Nur fuer Tests: den prozess-lokalen Dedup-Speicher leeren. */
export function _resetGemeldeteGruppen(): void {
  bereitsGemeldet.clear();
}

/**
 * Wohin der Login zurueckkehrt.
 *
 * DAS ZIEL MUSS ABSOLUT UND AUF EINEN DER SUITE BEKANNTEN HOST ZEIGEN. Ein
 * relatives `/m/lagerbuch/verwaltung` (feedbacks Weg,
 * `requireFeedbackAccess.ts:35`) ist bei EINEM Host richtig — hier setzte es die
 * verwaltende Person auf dem PORTAL-Host ab, weil `AUTH_URL` suiteweit derselbe
 * Wert ist (`core/auth/redirect.ts:8-18`), und entwertete den ganzen
 * returnTo-Apparat. `suiteRedirect` prueft das Ziel gegen die Allowlist aus
 * `moduleForHost` (`redirect.ts:52-54`), ein fremder Host landet also nicht.
 *
 * VOR DEM CUTOVER ist der relative Pfad der einzige sichere Wert: ohne
 * SUITE_HOST_LAGERBUCH gibt es keinen absoluten Host, und ein erratener waere
 * schlimmer als keiner — `m/files/_lib/access.ts:115-138` geht denselben Weg und
 * begruendet ihn: ein unbekannter oder protokollfremder Host landet bei
 * `suiteRedirect` STUMM auf dem Portal, ein relativer Pfad geht unveraendert
 * durch (`core/auth/redirect.ts:41`).
 *
 * EXPORTIERT (Festlegung G5), obwohl ausser dem Test niemand sie ruft: nur so
 * ist der Zweig „absolut vs. relativ" pruefbar, ohne einen `redirect()`-Wurf zu
 * zerlegen — und §3.8.1 verlangt genau diese Aussage.
 */
export function verwaltungsZiel(): string {
  const host = prodHostsFor(getModule("lagerbuch"))[0];
  return host ? `https://${host}/verwaltung` : "/m/lagerbuch/verwaltung";
}

/**
 * DER AUTH-BACKSTOP DES MODULS — eine Stelle, zwei Aufrufergruppen: die beiden
 * Verwaltungs-Layouts und JEDE Verwaltungs-Action.
 *
 * ⚠️ DIE HOST-ZEILE STEHT HIER ZUSAETZLICH, NICHT ERSATZWEISE. Die Layouts rufen
 * `requireLagerbuchHost` ohnehin (§2.6), aber diese Funktion wird auch aus SERVER
 * ACTIONS gerufen, und die haben kein Layout ueber sich. Der doppelte Aufruf
 * kostet einen Header-Lookup und schliesst dieselbe Luecke, die §2.6 fuer die
 * Helfer-Actions ueber `requireHelferSitzung` schliesst. FUER DIE VERWALTUNG IST
 * DAS KEIN AUTORISIERUNGSGEWINN (der Zugriffsriegel ist host-blind und
 * vollstaendig), sondern die Vermeidung einer zweiten funktionierenden Herkunft.
 *
 * `notFound()` STATT 403 (§3.3): was nicht freigegeben ist, sieht in dieser Suite
 * genauso aus wie etwas, das es nicht gibt (`not-found.tsx:41-46`). Der bewusst
 * hingenommene Verlust ist die Benennbarkeit; der Gegenwert ist, dass die
 * EXISTENZ von /verwaltung nicht verraten wird — bei einem Journal mit Klarnamen
 * und einem Druckbogen mit Token-Codes im Klartext ist das mehr wert.
 * `/verwaltung/kein-zugriff` gibt es nicht mehr (§11.4).
 *
 * ⚠️ FRISCHE: BIS ZU EINE STUNDE VERZUG. Gruppen im JWT sind nur so frisch wie
 * der letzte erfolgreiche Token-Refresh; der Takt ist die
 * Access-Token-Lebensdauer von Pocket ID, nicht die Sitzungsdauer von 30 Tagen.
 * Der Verzug wird HINGENOMMEN: die Alternative braeuchte eine
 * Objekt-Zugehoerigkeit, an der man sie aufloesen koennte, und lagerbuch hat
 * keine — es gibt EINE Rolle und keine Zuordnung von Verwaltenden zu Fahrzeugen.
 * Eine modul-eigene Sperrliste waere eine zweite Rechtequelle, die niemand
 * pflegt. Der Zustand ist ueberdies deutlich BESSER als heute: der Bestand setzt
 * `token.isAdmin` nur beim Erst-Login und definiert keine `session.maxAge` — ein
 * Gruppenentzug wirkt dort bis zu 30 Tage lang GAR NICHT.
 *
 * DER SOFORT-WIDERRUF EXISTIERT DORT, WO ER GEBRAUCHT WIRD: fuer Helfer-Zugaenge
 * ueber `tokens.aktiv`, lesend wie schreibend (§3.4.4). Das ist der Pfad mit den
 * laminierten, verlierbaren Kaertchen.
 */
export async function requireLagerbuchAdmin(): Promise<Viewer> {
  requireLagerbuchHost(await headers());          // §2.6 — erst der Host, dann die Person
  const viewer = viewerAusSession(await auth());
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel())}`);
  if (!istLagerbuchAdmin(viewer)) {
    meldeFehlendeGruppe(viewer.sub, viewer.groups);
    notFound();
  }
  merkeNutzer(getDb(), viewer);                   // §4.13 — NACH dem Riegel
  return viewer;
}

/**
 * Landeziel eines bereits angemeldeten Admins, der auf dem Gate steht. Das Gate
 * ist fuer Helfer:innen ohne Konto da; ein Admin gehoert in die Verwaltung.
 *
 * 1:1 aus `lagerbuch/src/lib/auth/cordon.ts:38-48` — MINUS EINEM ZWEIG:
 * `ziel.startsWith("/verwaltung/kein-zugriff")` faellt mit der Seite weg
 * (§3.3, §11.4).
 *
 * Auf `returnTo` allein ist kein Verlass: Auth.js merkt sich die callbackUrl in
 * einem reinen Session-Cookie (`authjs.callback-url`, ohne maxAge). Ueberlebt das
 * den Umweg ueber Pocket ID nicht — auf Mobilgeraeten/PWA der Regelfall, weil der
 * IdP-Schritt in einem eigenen Browser-Kontext laeuft —, faellt Auth.js auf
 * `url.origin` zurueck und der frisch angemeldete Admin steht wieder am Gate.
 * Diese Weiche faengt das COOKIE-UNABHAENGIG ab.
 *
 * Das Ziel wird gegen eine Allowlist geprueft: /helfer ist fuer Admins ohne
 * Helfer-Sitzung gesperrt und wuerde direkt zurueck aufs Gate werfen — eine
 * Endlosschleife. ⚠️ Der Bestandskommentar verweist dafuer auf
 * `helferGateDecision`; die Funktion ENTFAELLT (§3.1). Der Verweis lautet ab
 * jetzt `requireHelferSitzung` (`_lib/helferZugang.ts`, §3.4.4) — die Sache
 * bleibt unveraendert wahr: `helfer/layout.tsx` ruft sie, und sie schickt eine
 * verwaltende Person ohne Helfer-Sitzung sofort wieder aufs Gate.
 *
 * GENAU EIN AUFRUFER: die Gate-Seite `page.tsx` (§7.2.4, Teil 4). Das ist keine
 * Nebensache, sondern die Bedingung, unter der die Zusage ueberhaupt eintritt —
 * im Bestand steht der Aufruf in `src/app/(gate)/page.tsx:16-17`, und ohne ihn
 * wanderte eine Funktion mit, die niemand ruft.
 *
 * ⚠️ DIE WEICHE DORT TRAEGT EIN PRAEDIKAT, KEINEN RIEGEL: im Bestand fragt sie
 * `session?.user?.isAdmin`, in der Suite lautet sie
 * `istLagerbuchAdmin(await viewerOderNull())` — NICHT `requireLagerbuchAdmin()`.
 * Das Gate ist die Seite, auf der „keine Sitzung" der REGELFALL ist; ein
 * werfender Riegel schickte jede Helferin nach /login, bevor sie das Zahlenfeld
 * je saehe.
 */
export function adminLandingPfad(returnTo: string | null | undefined): string {
  const ziel = sanitizeReturnTo(returnTo);
  if (!ziel) return "/verwaltung";
  const istVerwaltung =
    ziel === "/verwaltung" || ziel.startsWith("/verwaltung/") || ziel.startsWith("/verwaltung?");
  // /a/{id} leitet angemeldete Admins selbst in die Verwaltung weiter, ist also
  // schleifenfrei — so bleibt ein gescanntes Regaletikett als Ziel erhalten.
  const istArtikelDeepLink = ziel === "/a" || ziel.startsWith("/a/");
  return istVerwaltung || istArtikelDeepLink ? ziel : "/verwaltung";
}
