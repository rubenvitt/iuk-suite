"use client";

import { useState, useSyncExternalStore } from "react";
import { LoginOutlined, LogoutOutlined, MenuOutlined } from "@ant-design/icons";
import { Avatar, Button, Drawer, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/core/theme/ThemeToggle";
import { gruppiereNav } from "@/core/shell/navAbschnitte";
import { SCHRIFT } from "@/core/theme/schrift";
// `NavIkone` bleibt: die Modulnavigation traegt seit dem Phosphor-Umbau je
// Eintrag ein Zeichen. Die ICONS-Map dagegen faellt hier weg — sie bediente die
// Modulknopfreihe, und die gibt es nicht mehr; aufgeloest wird sie jetzt
// ausschliesslich im `AppUmschalter`.
import { NavIkone } from "@/core/shell/navIkonen";
import type { SuiteNavItem } from "@/core/shell/types";
import s from "./shell.module.css";

/*
 * Die `subscribe`-Funktion MUSS stabil sein (ausserhalb der Komponente
 * definiert): eine bei jedem Render neu erzeugte liesze React endlos
 * ab- und wieder anmelden.
 *
 * Hier aendert sich ohnehin nie etwas — die Frage "bin ich auf dem Client?"
 * wird genau einmal anders beantwortet, naemlich beim Uebergang vom Server-
 * zum Client-Render. Deshalb eine leere Abmeldefunktion.
 */
const NIE_AENDERND = () => () => {};

function initialen(name: string | null): string {
  return (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Der hervorgehobene Navigationseintrag — und, davon getrennt, ob er die
 * aufgerufene Seite WIRKLICH ist.
 *
 * `genau` ist keine Feinheit, sondern der Unterschied zwischen einer wahren und
 * einer falschen Aussage gegenueber einem Screenreader. Der Wurzel-Fallback
 * unten greift auf JEDER Seite, auf die kein Eintrag passt (`/wifi`, `/tel`,
 * `/contact`, `/groups/17`, `/trend`, `/auswertung` — gemessen sechs Routen).
 * Truege der Wurzel-Eintrag dort `aria-current="page"`, behauptete er „das hier
 * ist die aktuelle Seite" ueber eine Seite, die es nicht ist. Deshalb liefert
 * diese Funktion beides, und der Aufrufer waehlt daraus `"page"` (genau) oder
 * `"true"` (Abschnitt).
 */
export interface AktiverEintrag {
  /** Schluessel des Eintrags, der optisch hervorgehoben wird. */
  schluessel: string;
  /**
   * `true` — dieser Eintrag IST die aufgerufene Seite (`aria-current="page"`).
   * `false` — nur der Abschnitt stimmt (Wurzel-Fallback, `aria-current="true"`).
   */
  genau: boolean;
}

/**
 * Welcher Navigationseintrag ist der aktive? Exportiert, weil das die einzige
 * Stelle mit echter Logik in dieser Datei ist und sie sich ohne DOM pruefen
 * laeszt.
 *
 * Drei Faellen wird hier ausgewichen:
 *
 * 1. **Der Proxy schreibt um.** `/vergleich` wird zu `/m/feedback/vergleich`,
 *    und was `usePathname()` unter einem Rewrite liefert — den aeuszeren oder
 *    den inneren Pfad — haengt an der Next-Version. Ein Vergleich auf
 *    Gleichheit waere still falsch: nichts wuerde je markiert, und der
 *    Unit-Test faellt nicht darauf herein, weil er `usePathname` mockt. Deshalb
 *    Suffix-Vergleich, und deshalb prueft der E2E `aria-current` am laufenden
 *    Server.
 *
 * 2. **`/` ist Suffix von nichts.** `"/m/feedback".endsWith("/")` ist `false` —
 *    die Uebersicht waere auf ihrer eigenen Seite nie markiert. Und ein
 *    naiver Suffix-Test in die andere Richtung markierte sie auf JEDER
 *    Unterseite mit. Deshalb: der spezifischste Nicht-Wurzel-Treffer gewinnt,
 *    und nur wenn keiner passt, ist die Wurzel dran.
 *
 * 3. **Der Fallback ist kein Treffer.** Genau deshalb `genau: pfad === "/"` und
 *    nicht `genau: true` fuer die Wurzel. Dass die Modulwurzel unter dem
 *    Rewrite tatsaechlich als `"/"` ankommt (und nicht als `/m/qr`), ist
 *    NACHGEMESSEN und nicht angenommen: ein `data-pfad`-Attribut am
 *    `modulnav`, `curl` gegen `qr.localtest.me` unter Next 16.2.6 — `/` -> `/`,
 *    `/wifi` -> `/wifi`. `usePathname()` liefert den AEUSZEREN Pfad. Sollte
 *    eine kuenftige Next-Version den inneren liefern, faellt die Wurzel von
 *    `"page"` auf `"true"` zurueck — eine schwaechere, aber immer noch wahre
 *    Aussage, und der E2E „markiert die Uebersicht auf der Modulwurzel" zeigt
 *    es sofort an. Ein Praefix-Abschneiden von `/m/<key>` waere die Alternative
 *    gewesen und ist bewusst NICHT gewaehlt: diese Funktion soll die
 *    Rewrite-Konvention gerade nicht kennen.
 */
export function aktiverEintrag(pfad: string, nav: SuiteNavItem[]): AktiverEintrag | null {
  const treffer = nav
    .filter((e) => e.href !== "/" && (pfad === e.href || pfad.endsWith(e.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (treffer) return { schluessel: treffer.key, genau: true };
  const wurzel = nav.find((e) => e.href === "/");
  if (!wurzel) return null;
  return { schluessel: wurzel.key, genau: pfad === wurzel.href };
}

/**
 * Die Links der Modulnavigation — geteilt zwischen der Seitenleiste
 * (`Modulleiste`) und dem Drawer (mobil). Eine Funktion statt
 * zweier Abschriften, weil die Aktivmarkierung an beiden Stellen dieselbe
 * Aussage treffen muss.
 *
 * `next/link` und NICHT `Button href` wie bei den Modulen: der Unterschied ist
 * fachlich. Module liegen auf FREMDEN Hosts, dorthin ist ein voller
 * Seitenwechsel richtig. Die Modulnavigation bleibt im selben Modul — ein `<a>`
 * warf dort die ganze Anwendung weg und lud sie neu. Der Modultitel in
 * `SuiteHeader` nutzt aus demselben Grund `Link`.
 *
 * `"page"` NUR beim echten Treffer, sonst `"true"`. Beides ist gueltiges ARIA,
 * aber nur eines davon ist hier wahr: `"page"` heiszt „das ist die aufgerufene
 * Seite", `"true"` heiszt „das ist der aktuelle Eintrag dieser Gruppe". Auf
 * `/wifi` ist „Generator" das zweite und nicht das erste. Gegen die Alternative
 * — `aria-current` ganz weglassen und nur eine CSS-Klasse setzen — sprach, dass
 * sie die Orientierung ersatzlos streicht: wer nicht sieht, dass der Rahmen
 * unter „Generator" steht, erfuehre dann gar nicht mehr, in welchem Abschnitt er
 * sich befindet. `"true"` sagt weniger als `"page"`, aber es sagt etwas, und es
 * stimmt.
 *
 * Die optische Hervorhebung haengt deshalb an `[aria-current]` ohne Wert
 * (shell.module.css) und nicht an `[aria-current="page"]`.
 */
function navLinks(sichtbar: SuiteNavItem[], pfad: string, ganze: SuiteNavItem[] = sichtbar) {
  const aktiv = aktiverEintrag(pfad, ganze);
  return sichtbar.map((eintrag) => (
    <Link
      key={eintrag.key}
      href={eintrag.href}
      data-testid="nav-link"
      className={s.navLink}
      aria-current={
        aktiv?.schluessel === eintrag.key ? (aktiv.genau ? "page" : "true") : undefined
      }
    >
      <NavIkone name={eintrag.ikon} />
      {eintrag.title}
    </Link>
  ));
}

/**
 * Dieselben Links, nur mit Überschriften dazwischen — geteilt zwischen der
 * Seitenleiste und dem Drawer. Eine Funktion statt zweier Abschriften, weil
 * die Aktivmarkierung an beiden Stellen dieselbe Aussage treffen muss.
 *
 * `aktiverEintrag` bekommt die FLACHE Liste und bleibt damit unverändert: die
 * Gruppierung ist Darstellung, nicht Bedeutung.
 *
 * EINE EINZIGE TITELLOSE GRUPPE — die flache Navigation — bekommt KEINEN
 * `.navGruppe`-Wrapper, sondern ihre Links direkt. Das ist kein Sonderfall
 * fürs Aussehen, sondern eine Kaskadenfrage: der Drawer (`SuiteNav`) hängt
 * diese Rückgabe in `.drawerGruppe` (`gap: 4px`, wirkt zwischen DIREKTEN
 * Kindern). Ein Wrapper dazwischen ließe dieses `gap` nur noch EINMAL feuern
 * (zwischen Überschrift und dem einen Wrapper) statt je zweimal zwischen den
 * Links — der sichtbare Abstand fiele still auf `.navGruppe`s eigene 2px,
 * obwohl beide CSS-Regeln für sich genommen unverändert korrekt blieben. Ohne
 * Wrapper bleibt die Kaskade für ein Modul ohne Abschnitte exakt die von vor
 * diesem Task, in JEDEM Konsumenten (Drawer wie Seitenleiste) — nicht nur in
 * dem einen, an dem der Fehler zuerst auffiel.
 */
export function navGruppen(nav: SuiteNavItem[], pfad: string) {
  const gruppen = gruppiereNav(nav);
  if (gruppen.length === 1 && gruppen[0].titel === null) {
    return navLinks(nav, pfad);
  }
  return gruppen.map((gruppe) => (
    <div key={gruppe.titel ?? "__ohne"} className={s.navGruppe}>
      {gruppe.titel ? (
        <div data-testid="nav-abschnitt" className={s.navAbschnitt} style={SCHRIFT.kicker}>
          {gruppe.titel}
        </div>
      ) : null}
      {navLinks(gruppe.items, pfad, nav)}
    </div>
  ));
}

/**
 * Die Navigation der Suite: mobil ein Drawer hinter dem Menue-Knopf, ab 768px
 * bleibt der Menü-Knopf weg und der Theme-Umschalter steht direkt im Kopf.
 * BEIDE Ausprägungen werden immer gerendert; welche man sieht, entscheidet
 * `shell.module.css`. Ein JS-Breakpoint zeigte beim ersten Render die falsche
 * Variante, und `Grid.useBreakpoint` ist ohnehin verboten.
 *
 * DER APP-WECHSEL HÄNGT NICHT MEHR HIER — er ist an den Modultitel gewandert
 * (`AppUmschalter`, Auslöser in `SuiteHeader`). Diese Komponente kennt keine
 * Module mehr, nur noch die modul-interne Navigation (Drawer), den
 * Menü-Knopf, den Theme-Umschalter und das Avatar-/Anmelden-Menü.
 *
 * DER NUTZERBLOCK HAENGT AM AVATAR, AUF BEIDEN GROESZEN, UND NICHT MEHR IM
 * DRAWER. Der Drawer ist nur mobil erreichbar (`.nurMobil` am Oeffner); solange
 * Abmelden dort lag, gab es ab 768px gar keinen Weg hinaus — und die Suite
 * hatte diesen Weg vorher schon nicht. Ihn NEBEN dem Drawer-Eintrag anzulegen
 * waere die naheliegende Variante gewesen und ist bewusst verworfen: zwei
 * Knoten mit `data-testid="abmelden"` sind fuer Playwright eine
 * Strict-Mode-Verletzung („resolved to 2 elements"), unabhaengig davon, dass
 * einer per CSS unsichtbar ist. Genau dieselbe Ueberlegung steht schon beim
 * Theme-Umschalter, der deshalb im Drawer eine eigene testId traegt. Der Drawer
 * behält damit Modulnavigation und Theme; Name und Abmelden gehören dem
 * Avatar-Menü.
 */
export function SuiteNav({
  nav,
  userName,
  angemeldet,
}: {
  nav: SuiteNavItem[];
  userName: string | null;
  angemeldet: boolean;
}) {
  const [offen, setOffen] = useState(false);
  /*
   * Der Zustand des Avatar-Menues wird SELBST gehalten, obwohl `Dropdown` das
   * auch allein koennte: nur so laeszt sich `aria-expanded` am Ausloeser
   * setzen. Ein Knopf, der ein Menue oeffnet, ohne das anzusagen, ist fuer
   * Tastatur- und Screenreader-Bedienung stumm.
   */
  const [nutzerMenueOffen, setNutzerMenueOffen] = useState(false);
  /*
   * `montiert` ist auf dem Server `false`, auf dem Client `true`. Damit
   * entsteht der Drawer serverseitig gar nicht — siehe die ausfuehrliche
   * Begruendung unten am Drawer selbst.
   *
   * `useSyncExternalStore` statt `useState` + `useEffect`: das Effekt-Muster
   * ist dasselbe Ergebnis, verstoesst aber gegen `react-hooks/set-state-in-
   * effect` (setState im Effektkoerper erzeugt einen zweiten Renderdurchlauf).
   * Dieser Hook ist Reacts eigene Antwort auf die Frage "Server oder Client?"
   * und braucht dafuer weder Effekt noch Zustand.
   */
  const montiert = useSyncExternalStore(
    NIE_AENDERND,
    () => true, // Client
    () => false, // Server
  );
  const pfad = usePathname();

  // Nur noch für den Drawer: die sichtbare Navigation liegt in der
  // Seitenleiste (`SuiteRahmen`). Gruppiert wie dort (`navGruppen`) — für eine
  // flache Navigation liefert `gruppiereNav` genau eine titellose Gruppe, also
  // ändert sich hier nichts.
  const drawerNavGruppen = navGruppen(nav, pfad);

  /*
   * Der Name steht als Gruppentitel im Menue — sichtbar, aber fuer einen
   * Screenreader nicht: rc-menu gibt dem Titel `role="presentation"`. Deshalb
   * traegt der Ausloeser den Namen zusaetzlich in seinem `aria-label`. Die
   * Initialen im Avatar sind fuer sich genommen bedeutungslos.
   */
  const abmeldenEintrag = {
    key: "abmelden",
    icon: <LogoutOutlined />,
    label: "Abmelden",
    "data-testid": "abmelden",
    // Derselbe Weg, den SessionGuard bei RefreshTokenError automatisch geht —
    // ohne ihn endet der Logout auf einer 404 (siehe oidc-signout/route.ts).
    // `void`, nicht das Promise schweben lassen: scheitert `signOut` (Netz weg,
    // Endpunkt tot), ist die Ablehnung sonst unbehandelt und landet je nach
    // Laufzeit als `unhandledrejection` in der Konsole — an einer Stelle, an
    // der niemand nach einem Abmeldefehler sucht.
    onClick: () => void signOut({ callbackUrl: "/api/auth/oidc-signout" }),
  };
  const nutzerEintraege: MenuProps["items"] = userName
    ? [
        {
          key: "nutzer",
          type: "group",
          label: <span data-testid="nutzername">{userName}</span>,
          children: [abmeldenEintrag],
        },
      ]
    : [abmeldenEintrag];

  return (
    <>
      <div className={s.rechts}>
        <Button
          className={s.nurMobil}
          type="text"
          shape="circle"
          data-testid="menue-knopf"
          aria-label="Menü öffnen"
          aria-expanded={offen}
          icon={<MenuOutlined />}
          onClick={() => setOffen(true)}
        />
        {/* Der zweite Umschalter steht im Drawer (unten) und traegt dort eine
            eigene testId — zwei Knoten mit `data-testid="theme-toggle"` waeren
            fuer jeden kuenftigen Playwright-Zugriff eine Strict-Mode-Verletzung
            ("resolved to 2 elements"). Genau deshalb liegt der Nutzerblock
            NICHT doppelt: fuer ihn gaebe es keine zweite testId, die noch
            ehrlich waere. */}
        <span className={s.nurDesktop}>
          <ThemeToggle />
        </span>
        {angemeldet ? (
          /*
           * KEIN `forceRender` an diesem Dropdown, und das ist die eine Zeile,
           * die hier wirklich zaehlt. antd rendert das Menue wie den Drawer
           * durch ein Portal nach `document.body`; ein erzwungener Aufbau haette
           * serverseitig kein `document` ("Portal only work in client side"),
           * und der folgende Hydration-Mismatch hat auf diesem Zweig schon
           * einmal die anonymen QR-Formulare unbenutzbar gemacht. Geschlossen
           * legt `@rc-component/portal` gar nichts an — nachgeprueft mit `curl`
           * gegen `next dev`, siehe Bericht. Deshalb braucht dieses Menue AUCH
           * kein `montiert`-Gatter wie der Drawer weiter unten: es ist
           * serverseitig ohnehin nur der Knopf.
           */
          <Dropdown
            menu={{ items: nutzerEintraege }}
            // `click`, nicht antds Vorgabe `hover`: auf einem Touchgeraet gibt
            // es kein Hover, und dieses Menue traegt den einzigen Abmeldeweg.
            trigger={["click"]}
            placement="bottomRight"
            open={nutzerMenueOffen}
            onOpenChange={setNutzerMenueOffen}
          >
            <Button
              type="text"
              shape="circle"
              data-testid="nutzermenue"
              aria-label={userName ? `Nutzermenü — ${userName}` : "Nutzermenü"}
              aria-haspopup="menu"
              aria-expanded={nutzerMenueOffen}
              /*
               * Der Avatar sitzt IM Knopf, statt selbst der Ausloeser zu sein:
               * `Avatar` ist ein `<span>` ohne Rolle und ohne Tastaturfokus.
               * Der Knopf bringt beides mit und ist mit `controlHeight: 56`
               * zugleich das Tap-Masz der Suite.
               */
              icon={<Avatar size="small">{initialen(userName)}</Avatar>}
            />
          </Dropdown>
        ) : (
          /*
           * Anonym steht hier ein Anmelden-Knopf — auf BEIDEN Groeszen, wie das
           * Avatar-Menue. Vorher lag er allein im Drawer und war ab 768px
           * unerreichbar, weil dessen Oeffner dort verschwindet.
           *
           * Und anonym gibt es KEINE Modulliste, sondern nur diesen Knopf.
           *
           * Der Grund ist nicht, dass die anderen Module kaputt waeren — wer
           * abgemeldet auf `feedback` klickt, landet auf `/login`
           * (requireFeedbackAccess.ts:35), also genau dort, wohin dieser Knopf
           * direkt fuehrt. Ein Modulwechsler, dessen Eintraege allesamt zum
           * Login umleiten, verspricht "hier kannst du hin" und liefert "hier
           * musst du dich erst anmelden". Der eine Knopf sagt dasselbe
           * ehrlicher und in einem Schritt.
           *
           * Praktisch bleibt ohnehin fast nichts uebrig: anonym liefert
           * `canAccess()` nur die Module mit `requiresAuth: false` — heute `qr`
           * (auf dem man dann schon ist) und `feedback` (Login). Eine Liste mit
           * einem Eintrag, der zum Login fuehrt.
           */
          <Button type="text" data-testid="anmelden" href="/login" icon={<LoginOutlined />}>
            Anmelden
          </Button>
        )}
      </div>

      {/*
        Der Drawer wird ERST NACH DER HYDRATION gerendert, und das ist kein
        Feinschliff: `forceRender` laesst antd den Inhalt sofort bauen,
        serverseitig gibt es aber kein `document` fuer das Portal ("Portal
        only work in client side"). Der daraus folgende Hydration-Mismatch
        liesz React den Teilbaum verwerfen — mitsamt dem Client-State, an dem
        der Absende-Knopf der anonymen QR-Formulare haengt. Sie waren dadurch
        UNBENUTZBAR (e2e/qr.spec.ts: 3 Tests im 90s-Timeout, isoliert bewiesen
        ueber zwei Worktrees).

        Verloren geht dabei nichts: ohne JavaScript laeszt sich der Drawer
        ohnehin nicht oeffnen. `forceRender` bleibt fuer den Client noetig,
        damit die jsdom-Tests den Inhalt vor dem Oeffnen finden.
      */}
      {montiert ? (
        <Drawer
          open={offen}
          onClose={() => setOffen(false)}
          placement="left"
          title="IuK-Suite"
          forceRender
        >
          <div data-testid="suite-drawer">
            {nav.length > 0 ? (
              <div className={s.drawerGruppe}>
                <div className={s.drawerTitel}>In diesem Modul</div>
                {drawerNavGruppen}
              </div>
            ) : null}

            {/* Kein Modul-Abschnitt mehr: die Apps hängen am Umschalter der
                Kopfzeile, auf JEDER Größe. Der Drawer trägt damit genau
                eine Sache — die Modulnavigation — und der Umschalter genau
                eine andere.

                Kein Nutzerblock mehr: Name und Abmelden hängen am Avatar-Menü
                der Kopfzeile, Anmelden an dessen anonymem Gegenstueck. Beide
                sind auf JEDER Groesze erreichbar, der Drawer nur unterhalb von
                768px — und ein zweiter `data-testid="abmelden"` waere fuer
                Playwright eine Strict-Mode-Verletzung. Der Drawer traegt damit
                genau Modulnavigation und Theme. */}
            <div className={s.drawerGruppe}>
              <ThemeToggle testId="theme-toggle-drawer" />
            </div>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
