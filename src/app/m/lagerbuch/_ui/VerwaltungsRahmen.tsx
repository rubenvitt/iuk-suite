import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import type { Sprungziel, SuiteNavItem } from "@/core/shell/types";
import s from "./verwaltung.module.css";
import { Verwaltungsluft } from "./Verwaltungsluft"; // IDA-234, Zahlen: `_lib/dichte.ts`
export function VerwaltungsRahmen({
  nav,
  sprungziele,
  children,
}: {
  nav: SuiteNavItem[];
  /** Artikel und Einheiten für „Springen zu" (IDA-380, `_lib/sprungziele.ts`). */
  sprungziele?: Sprungziel[];
  children: React.ReactNode;
}) {
  const mod = getModule("lagerbuch");

  return (
    <div className={s.modul}>
      <Shell variant={mod.shell} moduleKey="lagerbuch" nav={nav} sprungziele={sprungziele}>
        <Verwaltungsluft>{children}</Verwaltungsluft>
      </Shell>
    </div>
  );
}
