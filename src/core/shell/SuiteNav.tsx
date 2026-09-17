"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LoginOutlined, LogoutOutlined, MenuOutlined } from "@ant-design/icons";
import { Avatar, Button, Drawer, Dropdown, Input } from "antd";
import type { MenuProps } from "antd";
// Dieselbe Zeichenfamilie wie die Navigationseintraege selbst (`navIkonen.tsx`)
// und NICHT `@ant-design/icons`: der Pfeil sitzt neben einem Phosphor-Zeichen,
// und zwei Strichstaerken nebeneinander sieht man.
import { PiCaretDown, PiMagnifyingGlass } from "react-icons/pi";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/core/theme/ThemeToggle";
import { gruppiereNav } from "@/core/shell/navAbschnitte";
import { filtereNav, istLangeNav } from "@/core/shell/navFilter";
import {
  KEINE_ZUGEKLAPPT,
  abonniereZugeklappt,
  entpacke,
  liesZugeklappt,
  schreibeZugeklappt,
} from "@/core/shell/navZustand";
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
 *
 * `aufKlick` IST OPTIONAL UND HAT GENAU EINEN AUFRUFER: den Drawer. Er muss sich
 * nach der Wahl eines Ziels selbst schlieszen — `next/link` navigiert clientseitig,
 * die Seite wird also nicht neu geladen, und ohne dieses Zutun bleibt der Drawer
 * ueber der frisch geoeffneten Seite stehen. Die Seitenleiste (`Modulleiste`)
 * uebergibt nichts: dort gibt es nichts zu schlieszen.
 */
function navLinks(
  sichtbar: SuiteNavItem[],
  pfad: string,
  ganze: SuiteNavItem[] = sichtbar,
  aufKlick?: () => void,
) {
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
      onClick={aufKlick}
    >
      <NavIkone name={eintrag.ikon} />
      {eintrag.title}
    </Link>
  ));
}

/**
 * DER AUFKLAPPZUSTAND, wie ihn `navGruppen` braucht — und nur so viel davon.
 *
 * Die Funktion bleibt damit REIN: sie bekommt die Menge der zugeklappten Titel
 * und einen Rueckruf, sie fragt weder `localStorage` noch einen Hook. Wer
 * nichts uebergibt, bekommt das Bild von vor dieser Aenderung — starre
 * Ueberschriften ohne Schalter. Genau daran haengt die Zusage, dass die kurzen
 * Navigationen der uebrigen Module unveraendert bleiben (`navFilter.ts`,
 * `NAV_LANG_AB_EINTRAEGEN`).
 */
export interface NavAufklapp {
  /** Titel der zugeklappten Abschnitte. */
  zugeklappt: ReadonlySet<string>;
  umschalten: (titel: string) => void;
  /**
   * Praefix fuer `id`/`aria-controls`. ZWEI Instanzen dieser Navigation stehen
   * gleichzeitig im Baum (Seitenleiste und Drawer, welche man sieht entscheidet
   * CSS) — mit demselben Praefix traegen vier Knoten dieselbe `id`, und
   * `aria-controls` zeigt dann auf irgendeinen davon.
   */
  idPraefix: string;
}

/**
 * Abschnittstitel → Teil einer `id`. Umlaute und Leerzeichen raus, damit aus
 * „Einheiten & Geräte" kein `id`-Bruchstueck mit `&` und Leerzeichen wird.
 * Bleibt nichts uebrig (ein Titel ganz aus Sonderzeichen), traegt der Index die
 * Eindeutigkeit — deshalb faellt `abschnittsId` nie auf eine leere Zeichenkette.
 */
function abschnittsId(titel: string): string {
  const gesaeubert = titel
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return gesaeubert || encodeURIComponent(titel);
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
export function navGruppen(
  nav: SuiteNavItem[],
  pfad: string,
  aufKlick?: () => void,
  aufklapp?: NavAufklapp,
) {
  const gruppen = gruppiereNav(nav);
  if (gruppen.length === 1 && gruppen[0].titel === null) {
    return navLinks(nav, pfad, nav, aufKlick);
  }
  return gruppen.map((gruppe) => {
    const titel = gruppe.titel;
    if (!titel || !aufklapp) {
      return (
        <div key={titel ?? "__ohne"} className={s.navGruppe}>
          {titel ? (
            <div data-testid="nav-abschnitt" className={s.navAbschnitt} style={SCHRIFT.kicker}>
              {titel}
            </div>
          ) : null}
          {navLinks(gruppe.items, pfad, nav, aufKlick)}
        </div>
      );
    }
    const zu = aufklapp.zugeklappt.has(titel);
    const listenId = `${aufklapp.idPraefix}-${abschnittsId(titel)}`;
    return (
      <div key={titel} className={s.navGruppe}>
        {/*
          EIN ECHTER `<button>` UND KEIN `<div onClick>`. Der Unterschied ist
          nicht das Aussehen, sondern dass es ihn fuer Tastatur und
          Vorleseanwendung ueberhaupt gibt: ein `div` hat keinen Tabstopp, keine
          Rolle und reagiert auf keine Taste. `aria-expanded` sagt den Zustand
          an, `aria-controls` nennt die Liste, um die es geht.

          `type="button"` ist Pflicht und keine Foermlichkeit — die Vorgabe ist
          `submit`, und in einem Formular schickte ein Klick auf eine
          Abschnittsueberschrift das Formular ab.
        */}
        <button
          type="button"
          data-testid="nav-abschnitt"
          className={`${s.navAbschnitt} ${s.navAbschnittKnopf}`}
          style={SCHRIFT.kicker}
          aria-expanded={!zu}
          aria-controls={listenId}
          onClick={() => aufklapp.umschalten(titel)}
        >
          <PiCaretDown
            size={12}
            aria-hidden
            focusable="false"
            className={s.navPfeil}
            style={{ flex: "none", transform: zu ? "rotate(-90deg)" : undefined }}
          />
          {titel}
        </button>
        {/*
          `hidden` UND NICHT `display: none` PER KLASSE, und auch kein
          Weglassen der Kinder. `hidden` nimmt die Links aus dem Tabstopp UND
          aus dem Vorlesebaum — eine reine CSS-Loesung liesze sie fuer die
          Tastatur erreichbar, obwohl niemand sieht, wo der Fokus steht. Sie
          trotzdem zu RENDERN (statt sie wegzulassen) haelt `aria-controls`
          auf ein Element zeigend, das es gibt; ein `aria-controls` ins Leere
          ist eine Falschaussage.
        */}
        <div id={listenId} hidden={zu} className={s.navGruppeLinks}>
          {navLinks(gruppe.items, pfad, nav, aufKlick)}
        </div>
      </div>
    );
  });
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
  modulKey,
  userName,
  angemeldet,
  profilHref,
}: {
  nav: SuiteNavItem[];
  /** Namensraum des gemerkten Aufklappzustands — siehe `NavListe`. */
  modulKey: string;
  userName: string | null;
  angemeldet: boolean;
  /** Basis-URL des Portals, oder `null`, wenn es keine gibt. Siehe `profilEintrag`. */
  profilHref: string | null;
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
  /*
   * Nur noch für den Drawer: die sichtbare Navigation liegt in der
   * Seitenleiste (`SuiteRahmen`). Dieselbe Komponente wie dort (`NavListe`) —
   * sie kennt Gruppierung, Filter und Aufklappzustand, und dass beide
   * Ausprägungen dieselbe benutzen, ist der Grund, warum sie nicht
   * auseinanderlaufen können. `usePathname()` steht deshalb jetzt DORT und
   * nicht mehr hier.
   *
   * DER DRAWER SCHLIESZT SICH BEIM KLICK AUF EINEN EINTRAG SELBST, und das ist
   * kein Feinschliff: `next/link` navigiert clientseitig (bewusst so, siehe
   * `navLinks`), die Seite wird also NICHT neu geladen — ohne dieses
   * `setOffen(false)` bleibt der Drawer samt Maske ueber der gerade
   * aufgerufenen Seite stehen und muss von Hand geschlossen werden. Ein voller
   * Seitenwechsel (`<a>`) waere die Alternative und ist aus demselben Grund
   * verworfen wie in `navLinks` ausgeschrieben: er wirft die ganze Anwendung
   * weg. `Drawer.onClose` allein reicht nicht — es feuert nur bei Maske,
   * Schlieszkreuz und Escape, nicht bei einem Klick INNERHALB des Inhalts.
   */
  const drawerNav = (
    <NavListe nav={nav} modulKey={modulKey} aufKlick={() => setOffen(false)} testIdZusatz="-drawer" />
  );

  /*
   * Der Name steht als Gruppentitel im Menue — sichtbar, aber fuer einen
   * Screenreader nicht: rc-menu gibt dem Titel `role="presentation"`. Deshalb
   * traegt der Ausloeser den Namen zusaetzlich in seinem `aria-label`. Die
   * Initialen im Avatar sind fuer sich genommen bedeutungslos.
   */
  /*
   * DER WEG AUFS PROFIL — und warum er auf einen ANDEREN Host zeigen darf.
   *
   * Die Profilseite existiert genau einmal, im Portal. Das Sitzungs-Cookie gilt
   * ueber alle Modul-Hosts (`core/auth/cookies.ts`), eine Kopie je Modul waere
   * fuenf Kopien derselben Seite. Der Preis ist ein Hostwechsel; deshalb ein
   * echtes `<a>` und kein `next/link` — ueber eine Domaingrenze hinweg gibt es
   * nichts clientseitig zu navigieren.
   *
   * KEIN ZIEL, KEIN EINTRAG: `moduleUrl` liefert in Prod `null`, solange keine
   * Domain aufs Portal zeigt. Ein toter Link ist schlimmer als kein Link —
   * dieselbe Regel wie beim Modultitel in `SuiteHeader`.
   *
   * Bewusst OHNE Zeichen: der `LogoutOutlined` daneben steht fuer die eine
   * folgenschwere Handlung, und ein zweites Zeichen naehme ihm die Betonung.
   */
  const profilEintrag = profilHref
    ? [
        {
          key: "profil",
          label: (
            <a data-testid="profil-link" href={`${profilHref}/profil`}>
              Profil
            </a>
          ),
        },
      ]
    : [];

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
          children: [...profilEintrag, abmeldenEintrag],
        },
      ]
    : [...profilEintrag, abmeldenEintrag];

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
          title="IDA"
          forceRender
          /*
            ⚠️ DIESE ZEILE HAENGT AN `forceRender` DARUEBER, UND OHNE SIE KOSTET
            ES EIN BLATT PAPIER — gemessen in CI (Lauf 35201078030), danach
            lokal im echten Chromium nachgestellt: die Ortskarten kamen als
            ZWEI Seiten heraus, A4 und daneben eine leere im Vorgabeformat des
            Druckers (216 x 279 mm).

            `forceRender` haelt den GESCHLOSSENEN Drawer im Baum, und antd
            haengt ihn per PORTAL an `document.body` — also NEBEN die Huelle,
            nicht hinein. Die Druckregeln der Huelle sind `.druckRahmen …`
            geschachtelt und koennen ihn damit grundsaetzlich nicht treffen;
            im Druck wird aus seinem `position: fixed` ein Kasten in
            Fenstergroesse (gemessen: 1280 x 720), und der liegt AUSSERHALB von
            `.lb-ortbogen` und damit auf der unbenannten `@page` ohne `size`.

            ⚠️ DER FEHLER WAR VOR DRK-406 NICHT DA, obwohl der Drawer es war:
            bis dahin trug der Druckast gar keine Huelle. Wer die Huelle wieder
            wegnaehme, naehme auch diesen Grund weg — die Regel bleibt trotzdem
            richtig, ein geschlossener Navigationsschub gehoert auf kein Blatt.

            ⚠️ `rootClassName` UND NICHT `className`: `className` landet am
            Inhaltskasten INNERHALB des Portalwurzelknotens, und der Kasten in
            Fenstergroesse ist die Wurzel. Geprueft in `SuiteNav.test.tsx`.
          */
          rootClassName={s.navSchub}
        >
          <div data-testid="suite-drawer">
            {nav.length > 0 ? (
              <div className={s.drawerGruppe}>
                <div className={s.drawerTitel}>In diesem Modul</div>
                {drawerNav}
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

/**
 * WELCHE ABSCHNITTE SIND ZUGEKLAPPT — der Hook ueber `navZustand.ts`.
 *
 * `useSyncExternalStore` und nicht `useState`: der Speicher liegt auszerhalb
 * von React, weil die Navigation ZWEIMAL im Baum steht (Seitenleiste und
 * Drawer). Mit zwei Komponentenzustaenden liefe die eine der anderen davon —
 * wer im Drawer zuklappt und das Fenster breiter zieht, saehe den Abschnitt
 * offen. Der Server-Schnappschuss ist „nichts zugeklappt", damit das
 * Server-HTML und der erste Client-Render uebereinstimmen; der gespeicherte
 * Stand greift erst nach der Hydration. Ein `useEffect`-Muster ergaebe
 * dasselbe Bild und verstieszе gegen `react-hooks/set-state-in-effect`.
 */
function useZugeklappt(modulKey: string) {
  const roh = useSyncExternalStore(
    abonniereZugeklappt,
    () => liesZugeklappt(modulKey),
    () => KEINE_ZUGEKLAPPT,
  );
  const zugeklappt = useMemo(() => new Set(entpacke(roh)), [roh]);

  /*
   * GELESEN WIRD HIER NOCH EINMAL AUS DEM SPEICHER, nicht aus `zugeklappt` von
   * oben. Der Unterschied zaehlt, weil es zwei Instanzen gibt: klappt jemand im
   * Drawer etwas zu, waehrend die Seitenleiste denselben Rueckruf noch mit
   * ihrem aelteren Stand in der Hand haelt, ueberschriebe der zweite Klick den
   * ersten. Der Speicher ist die Wahrheit, die gerenderte Menge nur ihr Abbild.
   */
  const umschalten = useCallback(
    (titel: string) => {
      const naechste = new Set(entpacke(liesZugeklappt(modulKey)));
      if (!naechste.delete(titel)) naechste.add(titel);
      schreibeZugeklappt(modulKey, [...naechste]);
    },
    [modulKey],
  );

  const oeffne = useCallback(
    (titel: string) => {
      const naechste = new Set(entpacke(liesZugeklappt(modulKey)));
      if (naechste.delete(titel)) schreibeZugeklappt(modulKey, [...naechste]);
    },
    [modulKey],
  );

  return { zugeklappt, umschalten, oeffne };
}

/**
 * DIE MODULNAVIGATION ALS BEDIENBARE LISTE — geteilt zwischen Seitenleiste
 * (`Modulleiste`) und Drawer (`SuiteNav`). Eine Komponente statt zweier
 * Abschriften, aus demselben Grund wie bei `navGruppen`: die Aktivmarkierung,
 * der Filter und der Aufklappzustand muessen an beiden Stellen dasselbe sagen.
 *
 * SIE GIBT EIN FRAGMENT ZURUECK, KEIN ELEMENT. Der Drawer haengt sie direkt in
 * `.drawerGruppe`, und dessen `gap: 4px` wirkt zwischen DIREKTEN Kindern — ein
 * Wrapper hier liesze es nur noch einmal feuern und der Abstand fiele still auf
 * `.navGruppe`s 2px (dieselbe Kaskadenfrage, die an `navGruppen` ausgeschrieben
 * steht und die `SuiteNav.test.tsx` am erzeugten Knoten festhaelt).
 *
 * ⚠️ FILTER UND SCHALTER GIBT ES ERST AB `NAV_LANG_AB_EINTRAEGEN`. Unterhalb
 * rendert diese Komponente exakt das Markup von vorher — kein Eingabefeld,
 * keine Knoepfe. Eine Bedienung, die eine Liste von drei Zielen verwaltet, ist
 * teurer als die Liste.
 */
export function NavListe({
  nav,
  modulKey,
  aufKlick,
  testIdZusatz = "",
}: {
  nav: SuiteNavItem[];
  /** Namensraum des gemerkten Aufklappzustands und der `aria-controls`-Ids. */
  modulKey: string;
  /** Nur der Drawer uebergibt etwas — siehe `navLinks`. */
  aufKlick?: () => void;
  /**
   * Suffix fuer die testIds dieser Instanz (`""` Seitenleiste, `"-drawer"` der
   * Drawer). ZWEI Knoten mit derselben testId waeren fuer Playwright eine
   * Strict-Mode-Verletzung — dieselbe Ueberlegung wie beim Theme-Umschalter,
   * der im Drawer `theme-toggle-drawer` heiszt.
   */
  testIdZusatz?: string;
}) {
  const pfad = usePathname();
  const lang = istLangeNav(nav);
  const [suche, setSuche] = useState("");
  const { zugeklappt, umschalten, oeffne } = useZugeklappt(modulKey);

  const gesucht = suche.trim();
  const sichtbar = useMemo(() => (lang ? filtereNav(nav, gesucht) : nav), [lang, nav, gesucht]);

  /*
   * DER ABSCHNITT DER AUFGERUFENEN SEITE IST OFFEN — und das ist die eine
   * Regel, die das Zuklappen ueberhaupt gefahrlos macht.
   *
   * Ohne sie landet, wer ein Lesezeichen oder einen Link aus dem Inhalt in
   * einen zugeklappten Abschnitt hinein oeffnet, auf einer Seite, deren Platz
   * in der Navigation nicht zu sehen ist — die Orientierung, die die Leiste
   * eigentlich gibt, faellt genau dann aus, wenn man sie braucht.
   *
   * ⚠️ NUR BEIM PFADWECHSEL, nicht bei jedem Render. Sonst waere der Schalter
   * des aktiven Abschnitts tot: ein Klick klappte zu, der Effekt klappte sofort
   * wieder auf. So bleibt ein bewusstes Zuklappen stehen, solange man auf der
   * Seite ist, und der naechste Seitenaufruf sortiert die Leiste wieder.
   */
  const letzterPfad = useRef<string | null>(null);
  const aktiv = aktiverEintrag(pfad, nav);
  const aktiverAbschnitt = aktiv
    ? (nav.find((e) => e.key === aktiv.schluessel)?.abschnitt ?? null)
    : null;
  useEffect(() => {
    if (letzterPfad.current === pfad) return;
    letzterPfad.current = pfad;
    if (aktiverAbschnitt) oeffne(aktiverAbschnitt);
  }, [pfad, aktiverAbschnitt, oeffne]);

  /*
   * WAEHREND GEFILTERT WIRD, GIBT ES NICHTS AUFZUKLAPPEN: `aufklapp` bleibt
   * `undefined`, die Ueberschriften sind wieder starr, und alle Treffer stehen
   * offen da. Die Alternative — die Schalter stehen lassen und den Zustand
   * ignorieren — waere eine tote Bedienung: ein Knopf, der `aria-expanded`
   * meldet und nichts bewirkt.
   */
  const aufklapp: NavAufklapp | undefined =
    lang && !gesucht ? { zugeklappt, umschalten, idPraefix: `nav${testIdZusatz}` } : undefined;

  return (
    <>
      {lang ? (
        <div className={s.navFilter}>
          <Input
            data-testid={`nav-filter${testIdZusatz}`}
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            /*
             * `Escape` LEERT DAS FELD. antds `allowClear` gibt das Kreuz fuer
             * die Maus; die Tastatur braucht ihren eigenen Weg zurueck, sonst
             * ist der einzige Ausweg aus einem Filter das Loeschen Zeichen fuer
             * Zeichen.
             *
             * ⚠️ `stopPropagation` IST DER GANZE FIX, UND HIER STAND DAS
             * GEGENTEIL. Der Kommentar behauptete, der `Escape` des Drawers
             * „feuert erst, wenn hier nichts mehr zu leeren ist" — das ist
             * falsch, und es war eine Annahme, keine Messung (Codex-Befund P2
             * zu PR #207, danach gegen die Quelle nachgelesen).
             *
             * `@rc-component/portal` (`useEscKeyDown`) haengt EINEN GLOBALEN
             * `keydown`-Hoerer an `window` und ruft daraus `onEsc` des obersten
             * Portals; `@rc-component/drawer` macht daraus `onClose`. Der
             * Hoerer sitzt damit NICHT am Drawer, sondern ueber allem — ohne
             * diese Zeile leerte ein `Escape` im Schub das Feld UND schloesse
             * den Schub, in einem Tastendruck. Genau die Geste, mit der man
             * einen Filter zuruecknimmt, um weiterzublaettern, raeumte die
             * Navigation weg.
             *
             * React ruft im synthetischen `stopPropagation` auch das native
             * (SyntheticEvent), und React 19 haengt seine Hoerer an den
             * Portalknoten — also UNTER `window`. Der globale Hoerer sieht das
             * Ereignis danach nicht mehr. `preventDefault` waere das falsche
             * Werkzeug: es sagt etwas ueber die Standardaktion, nicht ueber den
             * Weg nach oben.
             *
             * ⚠️ NUR BEI GEFUELLTEM FELD. Auf einem leeren Feld ist nichts
             * zurueckzunehmen, und dann gehoert `Escape` dem Schub — sonst
             * naehme das Filterfeld ihm die Schlieszgeste ab, sobald der Fokus
             * darin steht. `SuiteNav.test.tsx` misst beide Richtungen; in jsdom
             * geht das, weil der Hoerer ein echter `window`-Hoerer ist.
             */
            onKeyDown={(e) => {
              if (e.key !== "Escape" || !suche) return;
              setSuche("");
              e.stopPropagation();
            }}
            allowClear
            placeholder="Menü filtern"
            aria-label="Menü filtern"
            /* KEIN `size` (Falle 4): `large` waere 72px, und die Vorgabe ist
               bereits die Bediendichte der jeweiligen Huelle. */
            prefix={<PiMagnifyingGlass size={14} aria-hidden focusable="false" />}
          />
          {/*
            DIE TREFFERZAHL IST SICHTBAR UND NICHT NUR FUER VORLESEANWENDUNGEN.
            Ein `role="status"` in einer optisch versteckten Zeile saehe niemand,
            und genau diese Auskunft fehlt beim Filtern am meisten: ob ueberhaupt
            noch etwas da ist. `role="status"` liest sie zusaetzlich vor, ohne den
            Fokus aus dem Feld zu nehmen.
          */}
          {gesucht ? (
            <div role="status" data-testid={`nav-filter-stand${testIdZusatz}`} className={s.navFilterStand}>
              {sichtbar.length === 0
                ? "Kein Eintrag passt"
                : `${sichtbar.length} von ${nav.length} Einträgen`}
            </div>
          ) : null}
        </div>
      ) : null}
      {navGruppen(sichtbar, pfad, aufKlick, aufklapp)}
    </>
  );
}
