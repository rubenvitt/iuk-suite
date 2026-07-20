import type { Metadata } from "next";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { RegisterSW } from "./RegisterSW";

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
      {children}
    </Shell>
  );
}
