import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("portal");
  return <Shell variant={mod.shell} moduleKey={mod.key}>{children}</Shell>;
}
