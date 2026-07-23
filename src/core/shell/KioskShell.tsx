import { KioskThemeProvider } from "@/core/theme/KioskThemeProvider";

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
        style={{ height: "100dvh", width: "100vw", overflow: "hidden", padding: 24 }}
      >
        {children}
      </div>
    </KioskThemeProvider>
  );
}
