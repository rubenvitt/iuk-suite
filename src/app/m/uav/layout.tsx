import type { Metadata } from "next";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { canAdminModule } from "@/core/auth/guards";

export const metadata: Metadata = { manifest: "/manifest.webmanifest" };

export default async function UavLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("uav");
  const darfVerwalten = await canAdminModule("uav");

  return (
    <Shell
      variant={mod.shell}
      moduleKey={mod.key}
      nav={[
        { key: "start", title: "Training", href: "/" },
        ...(darfVerwalten ? [{ key: "admin", title: "Verwaltung", href: "/admin" }] : []),
      ]}
    >
      {/* RegisterSW folgt in Task 14. */}
      {children}
    </Shell>
  );
}
