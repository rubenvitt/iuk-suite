import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { verpflegungNav } from "../_lib/nav";
import { requireAdmin } from "../_lib/zugang";
import s from "../_ui/verpflegung.module.css";

/**
 * Druckseiten (Ortsetiketten): dieselbe Hülle wie die Verwaltung, aber mit `druck` — beim Drucken fallen
 * Kopfzeile und Seitenleiste weg (Vorbild `wartung/(druck)/layout.tsx`). Der Riegel steht hier und in der Seite.
 */
export default async function VerpflegungDruckLayout({ children }: { children: React.ReactNode }) {
  const { rechte } = await requireAdmin("/etiketten");
  return (
    <SuiteRahmen moduleKey="verpflegung" nav={verpflegungNav(rechte)} druck>
      <Arbeitsdichte><div className={s.modul}>{children}</div></Arbeitsdichte>
    </SuiteRahmen>
  );
}
