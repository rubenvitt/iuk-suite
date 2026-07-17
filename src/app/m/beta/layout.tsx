import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("beta");
  return <Shell variant={mod.shell} moduleKey={mod.key}>{children}</Shell>;
}
