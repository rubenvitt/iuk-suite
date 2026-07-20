import type { Metadata } from "next";
import { auth } from "@/core/auth";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { RegisterSW } from "./RegisterSW";
import { HistoryOwner } from "./HistoryOwner";

// Modul-Layout-Metadata: der Manifest-Link landet nur im HTML dieses Moduls.
// Portal & Co. rendern dieses Layout nie und bleiben ohne Manifest.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default async function QrLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("qr");
  // Anonym ist `session` schlicht null — das Modul ist `requiresAuth: false`.
  // Der Verlauf braucht die ID trotzdem, um Eintraege der vorigen Sitzung auf
  // einem geteilten Geraet zu verbergen.
  const session = await auth();
  return (
    <Shell variant={mod.shell} moduleKey={mod.key}>
      <RegisterSW />
      <HistoryOwner userId={session?.user?.id ?? null} />
      {children}
    </Shell>
  );
}
