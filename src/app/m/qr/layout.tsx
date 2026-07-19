import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";

export default function QrLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("qr");
  return (
    <Shell variant={mod.shell} moduleKey={mod.key}>
      {children}
    </Shell>
  );
}
