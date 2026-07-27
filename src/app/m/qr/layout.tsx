import type { Metadata } from "next";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { canAdminModule } from "@/core/auth/guards";
import { RegisterSW } from "./RegisterSW";
import { HistoryOwner } from "./HistoryOwner";

// Modul-Layout-Metadata: der Manifest-Link landet nur im HTML dieses Moduls.
// Portal & Co. rendern dieses Layout nie und bleiben ohne Manifest.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default async function QrLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("qr");
  // Die Verwaltung steht nur Modul-Admins offen (`core/auth/guards`), also
  // steht sie auch nur ihnen in der Navigation. Ein Eintrag, der auf 404
  // fuehrt, ist schlimmer als kein Eintrag.
  const darfVerwalten = await canAdminModule("qr");

  return (
    <Shell
      variant={mod.shell}
      moduleKey={mod.key}
      nav={[
        { key: "start", title: "Generator", href: "/" },
        ...(darfVerwalten ? [{ key: "admin", title: "Verwaltung", href: "/admin" }] : []),
      ]}
    >
      <RegisterSW />
      {/* Liest die Sitzung selbst, clientseitig — aus PWA-Gruenden, nicht aus
          Rendering-Gruenden. Siehe HistoryOwner.tsx. */}
      <HistoryOwner />
      {children}
    </Shell>
  );
}
