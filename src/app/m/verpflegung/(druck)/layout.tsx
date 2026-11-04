import { MenueRahmen } from "@/core/shell/MenueRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { verpflegungNav } from "../_lib/nav";
import { requireAdmin } from "../_lib/zugang";
import s from "../_ui/verpflegung.module.css";

/**
 * Druckseiten (Ortsetiketten): dieselbe Hülle wie die Verwaltung, aber mit `druck` — beim Drucken fallen
 * das Menü der Suite weg (Vorbild `wartung/(druck)/layout.tsx`). Der Riegel steht hier und in der Seite.
 */
export default async function VerpflegungDruckLayout({ children }: { children: React.ReactNode }) {
  const { rechte } = await requireAdmin("/etiketten");
  return (
    <MenueRahmen moduleKey="verpflegung" nav={verpflegungNav(rechte)} druck>
      <Arbeitsdichte><div className={s.modul}>{children}</div></Arbeitsdichte>
    </MenueRahmen>
  );
}
