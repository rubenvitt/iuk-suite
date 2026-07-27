import { FullShell } from "@/core/shell/FullShell";
import { KioskShell } from "@/core/shell/KioskShell";
import { MinimalShell } from "@/core/shell/MinimalShell";
import type { ShellVariant } from "@/core/registry";
import type { SuiteNavItem } from "@/core/shell/types";

export function Shell({
  variant,
  moduleKey,
  nav,
  children,
}: {
  variant: ShellVariant;
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  if (variant === "full")
    return (
      <FullShell moduleKey={moduleKey} nav={nav}>
        {children}
      </FullShell>
    );
  if (variant === "minimal")
    return (
      <MinimalShell moduleKey={moduleKey} nav={nav}>
        {children}
      </MinimalShell>
    );
  // Kiosk bleibt bewusst ohne Kopfzeile und ohne `nav`: Vollbild ohne
  // Bedienelemente ist der Zweck dieser Variante.
  return <KioskShell moduleKey={moduleKey}>{children}</KioskShell>;
}
