import { KioskThemeProvider } from "@/core/theme/KioskThemeProvider";

import { SPACE } from "@/core/theme/tokens";
export function KioskShell({
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  return (
    <KioskThemeProvider>
      <div
        data-testid="kiosk-shell"
        style={{ height: "100dvh", width: "100vw", overflow: "hidden", padding: SPACE.xl }}
      >
        {children}
      </div>
    </KioskThemeProvider>
  );
}
