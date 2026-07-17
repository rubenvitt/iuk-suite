export function KioskShell({
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen overflow-hidden" data-testid="kiosk-shell">
      {children}
    </div>
  );
}
