import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import type { SuiteNavItem } from "@/core/shell/types";
import s from "./verwaltung.module.css";

export function VerwaltungsRahmen({
  nav,
  children,
}: {
  nav: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const mod = getModule("lagerbuch");

  return (
    <div className={s.modul}>
      <Shell variant={mod.shell} moduleKey="lagerbuch" nav={nav}>
        {children}
      </Shell>
    </div>
  );
}
