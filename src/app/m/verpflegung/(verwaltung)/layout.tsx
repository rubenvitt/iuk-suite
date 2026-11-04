import { Shell } from "@/core/shell/Shell";
import { verpflegungNav } from "../_lib/nav";
import { requireZugang } from "../_lib/zugang";
import s from "../_ui/verpflegung.module.css";

/**
 * Die Arbeitsseiten: Host und Sitzung oberhalb jeder `loading.tsx` (Falle 23); die Navigation hängt an den
 * Rechten. Jede Seite ruft ihren Riegel noch einmal — eine Route Group ist keine Sicherheitsgrenze.
 */
export default async function VerpflegungVerwaltungLayout({ children }: { children: React.ReactNode }) {
  const { rechte } = await requireZugang();
  return (
    <Shell variant="full" moduleKey="verpflegung" nav={verpflegungNav(rechte)}>
      <div className={s.modul}>{children}</div>
    </Shell>
  );
}
