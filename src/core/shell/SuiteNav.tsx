"use client";

import { useEffect, useState } from "react";
import {
  AppstoreOutlined,
  BorderOutlined,
  CaretUpOutlined,
  CommentOutlined,
  DesktopOutlined,
  GlobalOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Drawer } from "antd";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { ThemeToggle } from "@/core/theme/ThemeToggle";
import type { AppSwitcherEntry, SuiteNavItem } from "@/core/shell/types";
import s from "./shell.module.css";

// Icon-Name (aus ModuleDef.icon, Registry) -> @ant-design/icons Komponente.
// Unbekannte Namen fallen auf AppstoreOutlined zurueck, statt den Render zu
// crashen — eine neue Registry-Zeile soll die Kopfzeile nicht zerlegen.
const ICONS: Record<string, ComponentType> = {
  AppstoreOutlined,
  QrcodeOutlined,
  BorderOutlined,
  CaretUpOutlined,
  GlobalOutlined,
  DesktopOutlined,
  CommentOutlined,
};

function initialen(name: string | null): string {
  return (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Welcher Navigationseintrag ist der aktive? Exportiert, weil das die einzige
 * Stelle mit echter Logik in dieser Datei ist und sie sich ohne DOM pruefen
 * laeszt.
 *
 * Zwei Faellen wird hier ausgewichen:
 *
 * 1. **Der Proxy schreibt um.** `/vergleich` wird zu `/m/feedback/vergleich`,
 *    und was `usePathname()` unter einem Rewrite liefert — den aeuszeren oder
 *    den inneren Pfad — haengt an der Next-Version. Ein Vergleich auf
 *    Gleichheit waere still falsch: nichts wuerde je markiert, und der
 *    Unit-Test faellt nicht darauf herein, weil er `usePathname` mockt. Deshalb
 *    Suffix-Vergleich, und deshalb prueft der E2E in Task 8 `aria-current` am
 *    laufenden Server.
 *
 * 2. **`/` ist Suffix von nichts.** `"/m/feedback".endsWith("/")` ist `false` —
 *    die Uebersicht waere auf ihrer eigenen Seite nie markiert. Und ein
 *    naiver Suffix-Test in die andere Richtung markierte sie auf JEDER
 *    Unterseite mit. Deshalb: der spezifischste Nicht-Wurzel-Treffer gewinnt,
 *    und nur wenn keiner passt, ist die Wurzel dran.
 */
export function aktiverSchluessel(pfad: string, nav: SuiteNavItem[]): string | null {
  const treffer = nav
    .filter((e) => e.href !== "/" && (pfad === e.href || pfad.endsWith(e.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (treffer) return treffer.key;
  return nav.find((e) => e.href === "/")?.key ?? null;
}

/**
 * Die Navigation der Suite: mobil ein Drawer hinter dem Menue-Knopf, ab 768px
 * eine Knopfreihe in der Kopfzeile. BEIDES wird immer gerendert; welche man
 * sieht, entscheidet `shell.module.css`. Ein JS-Breakpoint zeigte beim ersten
 * Render die falsche Variante, und `Grid.useBreakpoint` ist ohnehin verboten.
 *
 * Die Modul-Knoepfe sind `Button href=…` (rendert ein `<a>`, Rolle "link") und
 * bewusst NICHT in einem Dropdown: `keystone.spec.ts:35` prueft
 * `getByRole("link", {name: /Alpha/})` OHNE vorheriges Oeffnen. Playwright
 * laeuft ohne Viewport-Angabe, also auf 1280x720 — dort greift `.nurDesktop`.
 */
export function SuiteNav({
  entries,
  nav,
  userName,
  angemeldet,
}: {
  entries: AppSwitcherEntry[];
  nav: SuiteNavItem[];
  userName: string | null;
  angemeldet: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [montiert, setMontiert] = useState(false);
  useEffect(() => setMontiert(true), []);
  const pfad = usePathname();

  const modulLinks = entries.map((eintrag) => {
    const Icon = ICONS[eintrag.icon] ?? AppstoreOutlined;
    return (
      <Button key={eintrag.key} type="text" href={eintrag.href} icon={<Icon />}>
        {eintrag.title}
      </Button>
    );
  });

  const aktiv = aktiverSchluessel(pfad, nav);

  /*
   * `next/link` und NICHT `Button href` wie bei den Modulen darueber. Der
   * Unterschied ist fachlich: Module liegen auf FREMDEN Hosts, dorthin ist ein
   * voller Seitenwechsel richtig. Die Modulnavigation bleibt im selben Modul —
   * ein `<a>` warf dort die ganze Anwendung weg und lud sie neu. Der Modultitel
   * in `SuiteHeader` nutzt aus demselben Grund `Link`.
   */
  const navLinks = nav.map((eintrag) => (
    <Link
      key={eintrag.key}
      href={eintrag.href}
      className={s.navLink}
      aria-current={aktiv === eintrag.key ? "page" : undefined}
    >
      {eintrag.title}
    </Link>
  ));

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
        {angemeldet ? (
          <nav
            aria-label="Module"
            data-testid="modulzeile"
            className={`${s.nurDesktop} ${s.modulzeile}`}
          >
            {modulLinks}
          </nav>
        ) : null}
        <span className={s.nurDesktop}>
          <ThemeToggle />
        </span>
        {/* Der zweite Umschalter steht im Drawer (unten) und traegt dort eine
            eigene testId — zwei Knoten mit `data-testid="theme-toggle"` waeren
            fuer jeden kuenftigen Playwright-Zugriff eine Strict-Mode-Verletzung
            ("resolved to 2 elements"). */}
        {userName ? <Avatar size="small">{initialen(userName)}</Avatar> : null}
      </div>

      {nav.length > 0 ? (
        <nav aria-label="Modulnavigation" data-testid="modulnav" className={s.modulnav}>
          {navLinks}
        </nav>
      ) : null}

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
                {navLinks}
              </div>
            ) : null}

            {angemeldet ? (
              <div className={s.drawerGruppe}>
                <div className={s.drawerTitel}>Module</div>
                {modulLinks}
              </div>
            ) : null}

            <div className={s.drawerGruppe}>
              <ThemeToggle testId="theme-toggle-drawer" />
              {angemeldet ? (
                <>
                  {userName ? <div>{userName}</div> : null}
                  <Button
                    type="text"
                    data-testid="abmelden"
                    icon={<LogoutOutlined />}
                    onClick={() => signOut({ callbackUrl: "/api/auth/oidc-signout" })}
                  >
                    Abmelden
                  </Button>
                </>
              ) : (
                /*
                 * Anonym gibt es KEINE Modulliste, sondern diesen Knopf.
                 *
                 * Der Grund ist nicht, dass die anderen Module kaputt waeren —
                 * wer abgemeldet auf `feedback` klickt, landet auf `/login`
                 * (requireFeedbackAccess.ts:35), also genau dort, wohin dieser
                 * Knopf direkt fuehrt. Ein Modulwechsler, dessen Eintraege
                 * allesamt zum Login umleiten, verspricht "hier kannst du hin"
                 * und liefert "hier musst du dich erst anmelden". Der eine
                 * Knopf sagt dasselbe ehrlicher und in einem Schritt.
                 *
                 * Praktisch bleibt ohnehin fast nichts uebrig: anonym liefert
                 * `canAccess()` nur die Module mit `requiresAuth: false` —
                 * heute `qr` (auf dem man dann schon ist) und `feedback`
                 * (Login). Eine Liste mit einem Eintrag, der zum Login fuehrt.
                 */
                <Button type="text" data-testid="anmelden" href="/login" icon={<LoginOutlined />}>
                  Anmelden
                </Button>
              )}
            </div>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
