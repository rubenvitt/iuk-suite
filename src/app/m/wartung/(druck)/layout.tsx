import { MenueRahmen } from "@/core/shell/MenueRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { wartungNav } from "../_lib/nav";
import { requireVerwalter } from "../_lib/zugang";
import s from "../_ui/wartung.module.css";

/**
 * Druckseiten (QR-Etiketten): dieselbe Hülle wie die Verwaltung, aber mit `druck` — beim Drucken fallen
 * das Menü der Suite weg (Vorbild `lagerbuch/_ui/DruckRahmen.tsx`). Der Riegel steht hier und in der
 * Seite, denn eine Route Group ist keine Sicherheitsgrenze.
 */
export default async function WartungDruckLayout({ children }: { children: React.ReactNode }) {
  const { rechte } = await requireVerwalter();
  return (
    <MenueRahmen moduleKey="wartung" nav={wartungNav(rechte)} druck>
      <Arbeitsdichte><div className={s.modul}>{children}</div></Arbeitsdichte>
    </MenueRahmen>
  );
}
