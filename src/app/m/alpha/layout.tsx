import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";

export default function AlphaLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("alpha");
  return <Shell variant={mod.shell} moduleKey={mod.key}>{children}</Shell>;
}
