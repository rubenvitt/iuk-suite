import { Shell } from "@/core/shell/Shell";
import { wartungNav } from "../_lib/nav";
import { requireZugang } from "../_lib/zugang";
import s from "../_ui/wartung.module.css";

/**
 * Die Arbeitsseiten: Host und Sitzung oberhalb jeder `loading.tsx` (Falle 23); die Navigation hängt an den
 * Rechten. Jede Seite ruft ihren Riegel noch einmal — eine Route Group ist keine Sicherheitsgrenze.
 */
export default async function WartungVerwaltungLayout({ children }: { children: React.ReactNode }) {
  const { rechte } = await requireZugang();
  return (
    <Shell variant="full" moduleKey="wartung" nav={wartungNav(rechte)}>
      <div className={s.modul}>{children}</div>
    </Shell>
  );
}
