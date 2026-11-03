import { Shell } from "@/core/shell/Shell";
import { requireAngemeldet } from "../_lib/zugang";
import s from "../_ui/wartung.module.css";

/** Das Telefon am Gerät (QR-Code): jeder Angemeldete, schmale Hülle mit großen Bedienelementen. */
export default async function WartungGeraetLayout({ children }: { children: React.ReactNode }) {
  await requireAngemeldet();
  return (
    <Shell variant="minimal" moduleKey="wartung">
      <div className={s.modul}>{children}</div>
    </Shell>
  );
}
