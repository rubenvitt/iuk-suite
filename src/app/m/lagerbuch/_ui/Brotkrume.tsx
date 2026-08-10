import Link from "next/link";
import type { ReactNode } from "react";
import { Ikone } from "./ikonen";
import s from "./verwaltung.module.css";

/**
 * DER RUECKWEG DER NEUN DETAILSEITEN — und er ist keine Zierde.
 *
 * `aktiverEintrag` markiert neun der 24 Seiten NICHT: `/verwaltung/bz/17`
 * endet weder auf `/verwaltung/bz` noch auf `/verwaltung`. Der Verlust wird
 * angenommen statt repariert (die zwei Alternativen — ein `/`-Eintrag oder
 * eine dritte Regel in `aktiverEintrag` — sind beide schlechter, §6.3.3), und
 * DAFUER bekommt jede dieser neun Seiten diese Brotkrume. Sie ist ohnehin
 * Pflicht (docs/design/README.md:244) und der Bestand hat sie schon
 * (`.backlink` mit `ArrowLeft`) — sie wandert eins zu eins mit und wird zur
 * benannten Zusicherung statt zur Zierde.
 *
 * EIGENES MARKUP, KEINE antd-Navigationskomponente. Die Liste der in Server Components
 * sicheren antd-Komponenten ist kurz und abgeschlossen (`Card`, `Statistic`,
 * `Result`, `Progress`, `Table`, `Tag`); die Navigationskomponente steht NICHT
 * darauf, und ihre Unterkomponente steht ausdruecklich auf der Verbotsliste. Die
 * `items`-Schreibweise umgeht zwar den Compound-Zugriff, aber ob die
 * Komponente selbst in der RSC-Ebene laedt, ist NICHT GEMESSEN — und eine
 * ungemessene Annahme kostet hier HTTP 500 auf neun Seiten.
 *
 * `href` traegt die AEUSZERE Pfadform (Falle 63, §2.1 g): unter dem
 * Host-Rewrite fuehrt `/verwaltung/bz` an die richtige Stelle,
 * `/m/lagerbuch/verwaltung/bz` in einen doppelt praefixierten Pfad.
 *
 * `min-height: 44px` (in `.backlink`) statt der 56px der Suite: die Brotkrume
 * ist ein Textlink am Seitenanfang, kein Bedienelement im Handschuh-Betrieb —
 * und 56px druecken den Seitentitel spuerbar nach unten.
 */
export function Brotkrume({ href, children }: { href: string; children: ReactNode }) {
  return (
    <nav aria-label="Brotkrume" style={{ marginBlockEnd: 8 }}>
      <Link className={s.backlink} href={href}>
        <Ikone name="pfeil-links" groesse={15} />
        {children}
      </Link>
    </nav>
  );
}
