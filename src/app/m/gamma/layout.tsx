import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";

export default function GammaLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("gamma");
  return <Shell variant={mod.shell} moduleKey={mod.key}>{children}</Shell>;
}
