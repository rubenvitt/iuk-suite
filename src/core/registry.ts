import { envHostsFor } from "@/core/hosts";
import { adminGroupsFor, envAccessGroupsFor, hasAnyGroup } from "@/core/groups";

/** Wie in `hosts.ts`: nur „String rein, String oder undefined raus" — bewusst nicht `NodeJS.ProcessEnv`. */
type EnvLike = Record<string, string | undefined>;

export type ShellVariant = "full" | "minimal" | "kiosk";
export type SwitcherGroupSource = "access" | "admin";

export interface ModuleDef {
  key: string;
  title: string;
  icon: string; // @ant-design/icons Komponentenname
  shell: ShellVariant;
  requiresAuth: boolean;
  /**
   * Zugang zum Modul überhaupt. Leer = jeder Eingeloggte darf.
   * Überschreibbar per `SUITE_ACCESS_GROUP_<KEY>`. Nicht direkt lesen, sondern
   * über `requiredGroupsFor()` — sonst greift die Env-Konfiguration an dieser
   * Stelle nicht (dieselbe Falle wie bei `prodHosts` unten).
   */
  requiredGroups: string[];
  /**
   * Wer das Modul **administrieren** darf — zusätzlich zum Suite-Admin, der
   * überall darf. Überschreibbar per `SUITE_ADMIN_GROUP_<KEY>`.
   * Nicht direkt lesen, sondern über `isModuleAdmin()` aus `core/groups`.
   */
  adminGroups: string[];
  /**
   * Fallback-Hosts, wenn `SUITE_HOST_<KEY>` nicht gesetzt ist. Nicht direkt
   * lesen — immer über `prodHostsFor()`, sonst greift die Env-Konfiguration an
   * dieser Stelle nicht (genau so entstand Post-Cutover-Befund 2, als der
   * App-Switcher an der Registry vorbei baute).
   */
  prodHosts: string[];
  showInSwitcher: boolean;
  /**
   * Welche Pocket-ID-Gruppen den Einstieg im App-Switcher sichtbar machen.
   *
   * Das ist absichtlich getrennt von `requiresAuth`: Module wie feedback,
   * files und lagerbuch haben anonyme Teilpfade und muessen fuer das Routing
   * `requiresAuth: false` behalten. Der Link im Switcher zeigt aber jeweils
   * auf ihren gruppengeschuetzten Einstieg. Die Quellen verweisen auf die
   * env-faehigen Access-/Admin-Listen statt Gruppennamen zu duplizieren.
   * `admin` meint dabei bewusst nur `adminGroupsFor`, nicht automatisch den
   * Suite-Admin: feedback, files und lagerbuch trennen Betrieb und Einsicht.
   * Leer bedeutet: kein Gruppenzwang fuer diesen App-Einstieg.
   */
  switcherGroupSources: SwitcherGroupSource[];
}

// Wegwerf-Module (alpha/beta/kioskdemo) beweisen den Keystone; portal ist das erste echte Modul.
export const MODULES: ModuleDef[] = [
  // portal: keine modul-eigene Admin-Gruppe — Admin ist hier der Suite-Admin
  // (ADMIN_GROUP). Das ist genau das bisherige Verhalten, nur nicht mehr im
  // Modul dupliziert.
  { key: "portal", title: "Portal", icon: "AppstoreOutlined", shell: "full",
    requiresAuth: true, requiredGroups: [], adminGroups: [],
    prodHosts: ["iuk-ue.de"], showInSwitcher: true, switcherGroupSources: [] },
  // Anonym, weil der Generator ohne Login funktionieren muss (Offline-PWA im
  // Einsatz). Der Admin-Bereich schützt sich selbst über core/auth/guards —
  // requiresAuth: true wäre hier falsch und würde den anonymen Zugang nehmen.
  { key: "qr", title: "QR-Codes", icon: "QrcodeOutlined", shell: "minimal",
    requiresAuth: false, requiredGroups: [], adminGroups: ["iuk-qr-admin"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: [] },
  // feedback: gemischt wie qr — anonyme Teilnahme (/f/...) braucht keinen Login,
  // requiresAuth:false. Dadurch prüft canAccess() unten requiredGroups HIER
  // NIE (früher Ausstieg bei !requiresAuth) — die generische Middleware-Gate
  // (core/routing.ts + proxy.ts) gated die Verwaltung also nicht. Durchgesetzt
  // wird requiredGroups stattdessen in `_lib/requireFeedbackAccess.ts`
  // (Backstop-Guard, den beide Verwaltungs-Layouts rufen), zusammen mit der
  // Ownership-Guard (assertGroupAccess) auf den einzelnen Seiten.
  // adminGroups bleibt der Voll-Admin (alle Gruppen, via isFeedbackAdmin).
  //
  // DIE BEIDEN WERTE HIER SIND VORGABEN, KEINE FESTSCHREIBUNG: eine Instanz mit
  // anders benannten SSO-Gruppen setzt SUITE_ACCESS_GROUP_FEEDBACK (Zugang) und
  // SUITE_ADMIN_GROUP_FEEDBACK (Voll-Admin) in der .env. Beide Wege lesen über
  // requiredGroupsFor()/adminGroupsFor(), nicht diese Felder direkt.
  { key: "feedback", title: "Feedback", icon: "CommentOutlined", shell: "full",
    requiresAuth: false, requiredGroups: ["da-feedback-gl", "da-feedback-admin"],
    adminGroups: ["da-feedback-admin"], prodHosts: [], showInSwitcher: true,
    switcherGroupSources: ["access", "admin"] },
  // files: zwei Prod-Hosts in EINER Variable, die Reihenfolge trägt die Rolle
  // (Index 0 = Verwaltung/Shares, Index 1 = Inbox) — siehe _lib/hostRolle.ts.
  // requiresAuth MUSS false bleiben: sonst schickt die Middleware jeden anonymen
  // /s/<id>- und /u/<token>-Aufruf in den Login (routing.ts:71-73), und zwar
  // sofort beim Cutover. Dadurch liest canAccess() requiredGroups hier NIE
  // (früher Ausstieg bei !requiresAuth, registry.ts:133) — durchgesetzt wird der
  // Zugang modul-intern in _lib/access.ts.
  //
  // prodHosts: [] — vor dem Cutover hat das Modul keine Prod-Domain, dieselbe
  // Lage wie bei qr und feedback. In Dev/E2E kommen die Hosts aus SUITE_HOST_FILES.
  // icon: NICHT „irgendein existierender @ant-design/icons-Name" — wirksam ist
  // allein die Map ICONS in `core/shell/icons.ts`. Ein Name, der dort FEHLT,
  // fällt STILL auf AppstoreOutlined zurück (zwei Konsumenten seit dem
  // Navigations-Umbau: `AppUmschalter.tsx` und `DiensteRaster.tsx`) —
  // „Dateien" wäre dann vom „Portal" nicht zu unterscheiden, im Umschalter-Panel
  // UND im Portal-Raster jeder Suite-Seite.
  // FolderOutlined steht in ICONS, und die Map ist exportiert, damit
  // `AppUmschalter.test.tsx` sie gegen die echte MODULES-Liste hier prüft: ein
  // Modul-Icon ohne Eintrag ist ab jetzt ein roter Test statt eines stillen
  // Duplikats.
  { key: "files", title: "Dateien", icon: "FolderOutlined", shell: "full",
    requiresAuth: false, requiredGroups: [], adminGroups: ["iuk-files-admin"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: ["access", "admin"] },
  // lagerbuch: EIN Host (lagerbuch.iuk-ue.de), aber die Domain steht ausschliesslich
  // in SUITE_HOST_LAGERBUCH — Betreiberauflage vom 03.08.2026 („zu 100 % konfigurierbar").
  // prodHosts bleibt deshalb leer, wie bei qr, feedback und files.
  //
  // requiresAuth MUSS false bleiben: /t/<code> ist der einzige Weg in die
  // Helfer-Sitzung und wird OHNE jede Sitzung aufgerufen, /g/<code> entscheidet
  // seine Rolle selbst, und das Gate auf / ist der Einstieg beider. Mit
  // requiresAuth: true schickt decideRoute (routing.ts:71-73) jeden anonymen
  // Aufruf in den Login — und zwar sofort beim Cutover, fuer jedes gedruckte
  // Etikett gleichzeitig.
  // Dadurch liest canAccess() requiredGroups hier NIE (frueher Ausstieg bei
  // !requiresAuth). Durchgesetzt wird der Verwaltungszugang
  // modul-intern in _lib/zugang.ts, der Host in _lib/host.ts.
  { key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined", shell: "full",
    requiresAuth: false, requiredGroups: [], adminGroups: ["lagerbuch_nutzer"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: ["admin"] },
  // aufgaben: Aufgabenverteilung und Zeitplanung fuer BuFDis
  // (docs/superpowers/specs/2026-08-13-modul-aufgaben-design.md).
  //
  // requiresAuth: true — und das ist hier RICHTIG, obwohl qr, feedback, files
  // und lagerbuch daneben ausdruecklich das Gegenteil festschreiben. Deren
  // Begruendung ist jeweils ein ANONYMER TEILPFAD (/f/…, /s/…, /t/…, der
  // QR-Generator). Dieses Modul hat keinen: jede Ansicht setzt eine bekannte
  // Person voraus. Ein uebernommenes `false` wuerde den generischen
  // Middleware-Riegel abschalten und die Durchsetzung komplett ins Modul
  // verlagern, ohne dass dadurch irgendetwas moeglich wuerde.
  //
  // requiredGroups ist eine VORGABE, keine Festschreibung: eine Instanz mit
  // anders benannten SSO-Gruppen setzt SUITE_ACCESS_GROUP_AUFGABEN. Die Gruppe
  // MUSS in Pocket ID existieren, bevor das Modul produktiv erreichbar ist —
  // eine nicht existierende Gruppe hier sperrt jeden aus, den Betreiber
  // eingeschlossen. Lokal unkritisch: AUTH_DEV_LOGIN nimmt Gruppen als freies
  // Feld an.
  //
  // adminGroups traegt die KOORDINATIONSROLLE — seit dem Quellenwechsel vom
  // 2026-08-15 die ganze, nicht mehr nur die Personenverwaltung
  // (`_lib/zugang.ts`s `akteurFuer` → `canAdminModule("aufgaben")`, Entwurf
  // `docs/superpowers/specs/2026-08-15-aufgaben-koordination-aus-gruppe-design.md`,
  // Nachtrag zu Spec §4).
  //
  // DIE ZEILENROLLEN `bufdi`/`auftrag` BLEIBEN IN DER MODULTABELLE `personen`,
  // und die Begruendung aus Spec §4 traegt fuer sie unveraendert: BuFDis
  // rotieren jaehrlich (ein ganzer Jahrgang, jeden Sommer, von jemandem mit
  // Pocket-ID-Zugang zu pflegen), und am JWT haengt ein Verzugsfenster von bis
  // zu einer Stunde. Fuer die KOORDINATION traegt dieselbe Begruendung nicht:
  // sie wechselt selten, der Betreiber pflegt die Gruppe in Pocket ID ohnehin,
  // und ein zweites Register in der Modultabelle lief mit dem ersten
  // auseinander — was erst auffiel, wenn jemand nicht mehr hineinkam. Ohne
  // diesen Weg gaebe es auf einer frischen Produktivdatenbank ueberhaupt
  // niemanden, der die erste Person anlegen darf.
  //
  // ⚠️ EIN TIPPFEHLER IN SUITE_ADMIN_GROUP_AUFGABEN SPERRT DAMIT JEDE
  // KOORDINATION AUS, nicht nur `/personen`. Der Rueckweg ist die
  // Suite-Admin-Gruppe (`isModuleAdmin` laesst sie mit durch) — s. `.env.example`
  // und `docs/runbooks/aufgaben-inbetriebnahme.md`.
  //
  // showInSwitcher: true seit Aufgabe 16 — das Modul ist jetzt vollstaendig begehbar (alle Seiten
  // aus Spec §8 stehen, die Modulnavigation baut ihre Eintraege aus denselben Praedikaten, die die
  // Routen gaten). `src/app/m/aufgaben/registry.test.ts` haelt beide Stufen fest.
  //
  // icon: NICHT „irgendein existierender @ant-design/icons-Name" — wirksam ist
  // allein die Map ICONS in `core/shell/icons.ts`. Ein dort FEHLENDER Name
  // faellt STILL auf AppstoreOutlined zurueck, und „Aufgaben" waere vom
  // „Portal" in Kopfzeile UND Drawer nicht zu unterscheiden.
  { key: "aufgaben", title: "Aufgaben", icon: "ScheduleOutlined", shell: "full",
    requiresAuth: true, requiredGroups: ["iuk-aufgaben-nutzer"],
    adminGroups: ["iuk-aufgaben-koordination"], prodHosts: [],
    showInSwitcher: true, switcherGroupSources: ["access"] },
  // radio: EIN Prod-Host (radio.iuk-ue.de), und er steht AUSSCHLIESSLICH in
  // SUITE_HOST_RADIO — dieselbe Auflage wie bei lagerbuch (registry.ts:106-108).
  // prodHosts bleibt deshalb leer, wie bei qr, feedback, files und lagerbuch.
  //
  // requiresAuth MUSS false bleiben: /t/<code> ist der Weg, den ein gescannter
  // QR-Code nimmt, und das Gate auf / ist der Einstieg der anonymen Ausleihe.
  // Mit requiresAuth: true schickte decideRoute (routing.ts:71-73) JEDEN anonymen
  // Aufruf in den Login — und zwar sofort beim Umschwenk des Routers, ohne
  // Parallelfenster.
  // Dadurch liest canAccess() requiredGroups hier NIE (frueher Ausstieg,
  // registry.ts:260), und /m/radio/admin/... erbt KEIN Middleware-Gating.
  // Durchgesetzt wird der Verwaltungszugang modulintern in _lib/zugang.ts, der
  // Host in _lib/host.ts.
  //
  // switcherGroupSources: [] und NICHT ["admin"] wie lagerbuch — die Kachel im
  // App-Umschalter IST der zweite Zugangsweg zur Ausleihe (Betreiberentscheidung
  // 5), auch fuer Personen ohne Verwaltungsgruppe. Ein ["admin"] hier verbaute
  // genau diesen Weg (visibleSwitcherModules, registry.ts:271-279).
  //
  // adminGroups ist eine VORGABE, keine feste Zuweisung — SUITE_ADMIN_GROUP_RADIO
  // ueberschreibt sie (adminGroupsFor, core/groups.ts:102-109). "iuk-radio-admin"
  // ist der Vorschlag aus Spec:766; der tatsaechliche Gruppenname in Pocket ID ist
  // offen (⬜ E1, .env.example:74-75) und faellig vor Cut 26.
  { key: "radio", title: "Funkgeräte", icon: "WifiOutlined", shell: "full",
    requiresAuth: false, requiredGroups: [], adminGroups: ["iuk-radio-admin"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: [] },
  // uav: Teilnehmer melden sich mit einem Dauer-Code an (kein SSO) → requiresAuth:false.
  // Die Verwaltung gated `_lib/requireUavAdmin.ts` (Layout UND jeder Handler unter api/admin/).
  // Vorgabe uav-training-admin (Betreiber, 28.08.2026); Instanzwert über SUITE_ADMIN_GROUP_UAV.
  { key: "uav", title: "Drohnentraining", icon: "RocketOutlined", shell: "minimal",
    requiresAuth: false, requiredGroups: [], adminGroups: ["uav-training-admin"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: ["admin"] },
  { key: "alpha", title: "Alpha", icon: "BorderOutlined", shell: "full",
    requiresAuth: true, requiredGroups: ["alpha-users"], adminGroups: [],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: ["access"] },
  // gamma: authentifiziertes Voll-Shell-Modul ohne Gruppenzwang — SSO-Cross-Ziel im Keystone-E2E.
  { key: "gamma", title: "Gamma", icon: "CaretUpOutlined", shell: "full",
    requiresAuth: true, requiredGroups: [], adminGroups: [],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: [] },
  { key: "beta", title: "Beta", icon: "GlobalOutlined", shell: "minimal",
    requiresAuth: false, requiredGroups: [], adminGroups: [],
    prodHosts: [], showInSwitcher: false, switcherGroupSources: [] },
  { key: "kioskdemo", title: "Kiosk Demo", icon: "DesktopOutlined", shell: "kiosk",
    requiresAuth: false, requiredGroups: [], adminGroups: [],
    prodHosts: [], showInSwitcher: false, switcherGroupSources: [] },
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDef {
  const m = BY_KEY.get(key);
  if (!m) throw new Error(`Unknown module: ${key}`);
  return m;
}

/** Wie getModule, wirft aber nicht — für Keys aus ungeprüftem Input (z. B. URL-Segmenten). */
export function findModule(key: string): ModuleDef | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * Die geltenden Prod-Hosts eines Moduls: `SUITE_HOST_<KEY>` gewinnt, sonst der
 * Fallback aus der Registry. Eine leer gesetzte Variable heißt bewusst „keine
 * Prod-Hosts" — damit lässt sich ein Cutover ohne Rebuild zurücknehmen.
 */
export function prodHostsFor(mod: ModuleDef, env: EnvLike = process.env): string[] {
  return envHostsFor(mod.key, env) ?? mod.prodHosts;
}

/**
 * Die geltenden Zugangsgruppen eines Moduls: `SUITE_ACCESS_GROUP_<KEY>` gewinnt,
 * sonst der Registry-Wert. Anders als bei `prodHostsFor` ist eine LEER gesetzte
 * Variable KEINE Aussage, sondern wirkungslos — die Begründung steht an
 * `envAccessGroupsFor` in `core/groups` (kurz: bei `requiresAuth: true` wäre die
 * leere Liste eine stille Öffnung für alle Eingeloggten).
 *
 * Jeder Weg, der über den Modulzugang entscheidet, muss durch DIESE Funktion —
 * `canAccess()` unten und die modul-eigenen Guards (`requireFeedbackAccess`).
 */
export function requiredGroupsFor(mod: ModuleDef, env: EnvLike = process.env): string[] {
  return envAccessGroupsFor(mod.key, env) ?? mod.requiredGroups;
}

export function moduleForHost(host: string, env: EnvLike = process.env): ModuleDef | null {
  const h = host.split(":")[0].toLowerCase();
  for (const m of MODULES) {
    if (h === `${m.key}.localtest.me`) return m;
    if (prodHostsFor(m, env).some((p) => p.toLowerCase() === h)) return m;
  }
  return null;
}

export function canAccess(
  mod: ModuleDef,
  groups: string[] | null,
  env: EnvLike = process.env,
): boolean {
  if (!mod.requiresAuth) return true;
  if (groups === null) return false;
  const erlaubt = requiredGroupsFor(mod, env);
  if (erlaubt.length === 0) return true;
  return erlaubt.some((g) => groups.includes(g));
}

export function visibleSwitcherModules(
  groups: string[] | null,
  env: EnvLike = process.env,
): ModuleDef[] {
  return MODULES.filter((mod) => {
    if (!mod.showInSwitcher || !canAccess(mod, groups, env)) return false;
    if (mod.switcherGroupSources.length === 0) return true;

    const required = mod.switcherGroupSources.flatMap((source) =>
      source === "access" ? requiredGroupsFor(mod, env) : adminGroupsFor(mod, env),
    );
    return hasAnyGroup(groups, required);
  });
}
