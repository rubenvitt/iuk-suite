import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import s from "./_ui/aufgaben.module.css";

/**
 * `.modul` liegt AUSSERHALB der Shell, wie `VerwaltungsRahmen` im Lagerbuch: so
 * tragen auch die Teile der Shell, die Modulinhalt umschliessen, die
 * --auf-*-Variablen. Innerhalb waere der Traeger ein Nachfahre der Kopfzeile,
 * und dort fehlten sie.
 *
 * Die rollenabhaengige Modulnavigation kommt in Aufgabe 13 dazu; bis dahin
 * traegt die Shell keine.
 */
export default function AufgabenLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("aufgaben");
  return (
    <div className={s.modul}>
      <Shell variant={mod.shell} moduleKey={mod.key}>
        {children}
      </Shell>
    </div>
  );
}
