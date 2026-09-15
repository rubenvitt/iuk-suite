import { Suspense } from "react";

import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { umfragenKonfiguration } from "@/core/umfragen/konfiguration";
import { Umfragen } from "@/core/umfragen/Umfragen";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Arbeitsflächen-Variante: volle Inhaltsbreite, Seitenleiste wenn das
 * Modul eine Navigation übergibt, und die dichtere Bediendichte darüber.
 *
 * DIE DICHTE LIEGT UM DEN INHALT, NICHT UM DEN RAHMEN. Die Kopfzeile soll in
 * jedem Modul gleich aussehen, gleich welcher Variante darunter — und ihre drei
 * Bedienelemente (Menü, Theme, Avatar) sind auf jeder Größe potenzielle
 * Fingerziele.
 *
 * DIE SEITENLEISTE BLEIBT EBENFALLS AUSZERHALB, und der Grund ist genauer als
 * „sie liest keinen Token". Ihre Einträge sind rohes `next/link`-Markup, das
 * stimmt. Der `Sider` SELBST leitet aber sehr wohl aus `controlHeightLG` ab:
 * `triggerHeight`, `zeroTriggerWidth` und `zeroTriggerHeight`
 * (antd/es/layout/style/index.js:99-103). Wirkungslos sind die nur, WEIL dieser
 * Sider weder `collapsible` noch `breakpoint` trägt — beides ist bewusst nicht
 * gesetzt (antds Sider-Breakpoints laufen über JS und zeigen beim ersten
 * Render die falsche Variante). Wer den Sider später einklappbar macht, holt
 * sich damit einen 80px-Auslöser neben 40px-Bedienelemente und muss diese
 * Grenze neu entscheiden.
 *
 * HIER HÄNGEN DIE UMFRAGEN, UND DIESE STELLE IST DIE ENTSCHEIDUNG (DRK-353).
 * Das Einbettungs-Snippet von Formbricks gehört laut Anleitung ins
 * Wurzel-Layout. Das wäre hier falsch: `src/app/layout.tsx` liegt über ALLEM —
 * auch über dem Kiosk-Dauerdisplay, jeder Druckansicht und jeder anonymen
 * Seite. Ein Umfragefenster auf einem unbeaufsichtigten Schirm fragt niemanden,
 * und ein Umfragekärtchen im gedruckten Aushang ist ein Fehldruck.
 *
 * `FullShell` ist die Achse, die die Suite ohnehin schon führt: `shell: "full"`
 * in `core/registry.ts` trennt die angemeldeten Arbeitsflächen von Kiosk und
 * den schmalen Ansichten. Die Grenze wandert damit von selbst mit, wenn ein
 * Modul seine Variante wechselt — und die anonymen Ansichten (öffentliches
 * Feedback, Datei-Freigaben, Lagerbuch-Helfer) bringen eigene Layouts GANZ OHNE
 * Suite-Shell mit, liegen also ohnehin jenseits davon.
 *
 * ⚠️ `Suspense` IST PFLICHT, KEIN SCHMUCK: die Insel liest `useSearchParams()`,
 * und Next verlangt dafür eine Grenze — ohne sie bricht `build` ab, sobald eine
 * Route doch einmal statisch gerendert wird.
 */
export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const umfragen = umfragenKonfiguration();

  return (
    <SuiteRahmen moduleKey={moduleKey} nav={nav}>
      <Arbeitsdichte>{children}</Arbeitsdichte>
      {umfragen && (
        <Suspense>
          <Umfragen appUrl={umfragen.appUrl} workspaceId={umfragen.workspaceId} />
        </Suspense>
      )}
    </SuiteRahmen>
  );
}
