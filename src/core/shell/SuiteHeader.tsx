import Link from "next/link";
// `Header` NICHT als `Layout.Header` referenzieren, auch nicht per Destrukturierung
// auf Modulebene: antds Layout-Komposition haengt die Unterkomponenten erst zur
// Laufzeit per Property-Zuweisung an (`Layout.Header = Header`). In einer Server
// Component loest Next/Turbopack diesen Laufzeit-Property-Zugriff auf einem
// "use client"-Export nicht auf — Ergebnis: `undefined`, 500er ("Element type is
// invalid"). Empirisch verifiziert (curl gegen `next dev`, siehe FullShell.tsx-
// Historie); `pnpm build`/`pnpm typecheck` decken das NICHT ab. Der direkte
// Named-Import aus dem tiefen Pfad umgeht das.
import { Header } from "antd/es/layout/layout";

import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { switcherEntries } from "@/core/shell/switcherEntries";
import { SuiteNav } from "@/core/shell/SuiteNav";
import type { SuiteNavItem } from "@/core/shell/types";
import s from "./shell.module.css";

/**
 * Die eine Kopfzeile der Suite. `FullShell` und `MinimalShell` rufen beide sie —
 * damit ist der Maszstab aus docs/design/README.md erfuellt (zwei belegbare
 * Nutznieszer, heute).
 *
 * Server-Komponente, und das ist geprueft unbedenklich: der Kommentar in
 * `app/m/qr/layout.tsx`, ein `await auth()` mache die Routen dynamisch, ist
 * veraltet — `pnpm build` weist jede Route der Suite als `f (Dynamic)` aus,
 * weil das Root-Layout `cookies()` fuer den Theme-Modus liest.
 *
 * Die Eintraege werden HIER gebaut, nicht im Client: `switcherEntries()` liest
 * ueber `moduleUrl()` `process.env`, das im Client-Bundle nicht existiert.
 * `SuiteNav` bekommt nur fertige hrefs.
 */
export async function SuiteHeader({
  moduleKey,
  nav = [],
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
}) {
  const session = await auth();
  const mod = getModule(moduleKey);
  const angemeldet = !!session?.user;
  const entries = switcherEntries(session?.user?.groups ?? null);

  return (
    <Header data-testid="suite-header" className={s.kopf}>
      {/*
       * Der Modultitel fuehrt auf die Startseite SEINES Moduls (Entwurf
       * feedback-admin §4.1). Ohne diesen Link ist jede Unterseite eine
       * Sackgasse — der Defekt hing an der Shell und galt fuer jedes Modul.
       *
       * `data-testid` bleibt auf dem `<strong>` und wandert NICHT an den Link:
       * der Keystone-E2E fragt es dort ab. `moduleUrl` kennt Dev- und
       * Prod-Hosts; ohne Host bleibt "/" — nie ein toter Link.
       */}
      <Link href={moduleUrl(moduleKey) ?? "/"} className={s.titel}>
        <strong data-testid="module-title">{mod.title}</strong>
      </Link>
      <SuiteNav
        entries={entries}
        nav={nav}
        userName={session?.user?.name ?? null}
        angemeldet={angemeldet}
      />
    </Header>
  );
}
