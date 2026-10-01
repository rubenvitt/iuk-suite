import { Shell } from "@/core/shell/Shell";
import "./kommplan.css";

/** Die Suite-Hülle der internen Seiten (Liste, Archiv, Plan, Bibliothek, Einstellungen); die Druckrouten haben bewusst keine (Abweichung 6). */
export function Huelle({ children }: { children: React.ReactNode }) {
  return <Shell variant="full" moduleKey="kommplan">{children}</Shell>;
}
