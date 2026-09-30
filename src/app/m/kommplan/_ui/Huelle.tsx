import { Shell } from "@/core/shell/Shell";
import "./kommplan.css";

/** Die Suite-Hülle für Liste und Betrachter; die Druckroute hat bewusst keine (Abweichung 6). */
export function Huelle({ children }: { children: React.ReactNode }) {
  return <Shell variant="full" moduleKey="kommplan">{children}</Shell>;
}
