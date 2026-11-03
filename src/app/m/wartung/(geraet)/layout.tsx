import { Shell } from "@/core/shell/Shell";
import { besucher } from "../_lib/zugang";
import s from "../_ui/wartung.module.css";

/** Das Telefon am Gerät (QR-Code): schmale Hülle mit großen Bedienelementen. Riegel je Seite (`g/[id]/laden.ts`). */
export default async function WartungGeraetLayout({ children }: { children: React.ReactNode }) {
  await besucher();
  return (
    <Shell variant="minimal" moduleKey="wartung">
      <div className={s.modul}>{children}</div>
    </Shell>
  );
}
