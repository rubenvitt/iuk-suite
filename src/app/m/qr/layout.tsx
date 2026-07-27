import type { Metadata } from "next";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { RegisterSW } from "./RegisterSW";
import { HistoryOwner } from "./HistoryOwner";

// Modul-Layout-Metadata: der Manifest-Link landet nur im HTML dieses Moduls.
// Portal & Co. rendern dieses Layout nie und bleiben ohne Manifest.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default function QrLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("qr");
  return (
    <Shell variant={mod.shell} moduleKey={mod.key}>
      <RegisterSW />
      {/* Liest die Sitzung selbst, clientseitig — aus PWA-Gruenden, nicht aus
          Rendering-Gruenden. Der frueher hier stehende Hinweis, ein `await
          auth()` im Layout mache die Routen dynamisch, war veraltet: `pnpm
          build` weist jede Route der Suite als `f (Dynamic)` aus, weil das
          Root-Layout `cookies()` fuer den Theme-Modus liest. Siehe
          HistoryOwner.tsx fuer den tatsaechlichen Grund. */}
      <HistoryOwner />
      {children}
    </Shell>
  );
}
