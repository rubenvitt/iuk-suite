import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
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
  return (
    <SuiteRahmen moduleKey={moduleKey} nav={nav}>
      <Arbeitsdichte>{children}</Arbeitsdichte>
    </SuiteRahmen>
  );
}
