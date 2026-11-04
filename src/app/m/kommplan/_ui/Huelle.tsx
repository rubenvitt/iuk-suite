import { Shell } from "@/core/shell/Shell";
import { kommplanNav } from "../_lib/nav";
import { darfKommplanBearbeiten, type Viewer } from "../_lib/zugang";
import "./kommplan.css";

/**
 * Die Suite-Hülle der internen Seiten (Liste, Archiv, Plan, Bibliothek, Einstellungen); die Druckrouten haben bewusst
 * keine (Abweichung 6). `viewer` reicht jede Seite aus ihrem eigenen `requireKommplanZugang` durch — die Verwaltungseinträge
 * des Menüs hängen am selben Prädikat wie die Riegel dieser Seiten (`_lib/nav.ts`).
 */
export function Huelle({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  return <Shell variant="full" moduleKey="kommplan" nav={kommplanNav(darfKommplanBearbeiten(viewer.groups))}>{children}</Shell>;
}
