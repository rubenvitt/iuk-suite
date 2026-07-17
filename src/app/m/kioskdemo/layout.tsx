import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";

export default function KioskdemoLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("kioskdemo");
  return <Shell variant={mod.shell} moduleKey={mod.key}>{children}</Shell>;
}
