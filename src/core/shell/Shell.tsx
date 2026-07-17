import type { ShellVariant } from "@/core/registry";
import { FullShell } from "@/core/shell/FullShell";
import { MinimalShell } from "@/core/shell/MinimalShell";
import { KioskShell } from "@/core/shell/KioskShell";

export function Shell({
  variant,
  moduleKey,
  children,
}: {
  variant: ShellVariant;
  moduleKey: string;
  children: React.ReactNode;
}) {
  if (variant === "full") return <FullShell moduleKey={moduleKey}>{children}</FullShell>;
  if (variant === "minimal") return <MinimalShell moduleKey={moduleKey}>{children}</MinimalShell>;
  return <KioskShell moduleKey={moduleKey}>{children}</KioskShell>;
}
