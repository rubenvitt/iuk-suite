import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { rueckmeldungUrl } from "@/core/rueckmeldung/konfiguration";
import { RueckmeldungKnopf } from "@/core/rueckmeldung/RueckmeldungKnopf";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Arbeitsflächen-Variante: volle Inhaltsbreite, Seitenleiste wenn das
 * Modul eine Navigation übergibt, und die dichtere Bediendichte darüber.
 *
 * DIE DICHTE LIEGT UM DEN INHALT, NICHT UM DEN RAHMEN. Die Kopfzeile soll in
 * jedem Modul gleich aussehen, gleich welcher Variante darunter — und ihre drei
 * Bedienelemente (Menü, Theme, Avatar) sind auf jeder Größe potenzielle
 * Fingerziele.
 *
 * DIE SEITENLEISTE BLEIBT EBENFALLS AUSZERHALB, und der Grund ist genauer als
 * „sie liest keinen Token". Ihre Einträge sind rohes `next/link`-Markup, das
 * stimmt. Der `Sider` SELBST leitet aber sehr wohl aus `controlHeightLG` ab:
 * `triggerHeight`, `zeroTriggerWidth` und `zeroTriggerHeight`
 * (antd/es/layout/style/index.js:99-103). Wirkungslos sind die nur, WEIL dieser
 * Sider weder `collapsible` noch `breakpoint` trägt — beides ist bewusst nicht
 * gesetzt (antds Sider-Breakpoints laufen über JS und zeigen beim ersten
 * Render die falsche Variante). Wer den Sider später einklappbar macht, holt
 * sich damit einen 80px-Auslöser neben 40px-Bedienelemente und muss diese
 * Grenze neu entscheiden.
 *
 * HIER HÄNGT DER SCHWEBENDE RÜCKMELDEKNOPF, UND DIESE STELLE IST DIE
 * ENTSCHEIDUNG (DRK-453; bis dahin hing hier die Formbricks-Einbindung, und
 * zwar aus genau derselben Überlegung). Der bequeme Ort wäre
 * `src/app/layout.tsx` — das liegt über ALLEM, auch über dem
 * Kiosk-Dauerdisplay, jeder Druckansicht und jeder anonymen Seite. Ein
 * Feedback-Knopf auf einem unbeaufsichtigten Schirm fragt niemanden, und einer
 * im gedruckten Aushang ist ein Fehldruck.
 *
 * `FullShell` ist die Achse, die die Suite ohnehin schon führt: `shell: "full"`
 * in `core/registry.ts` trennt die angemeldeten Arbeitsflächen von Kiosk und
 * den schmalen Ansichten. Die Grenze wandert damit von selbst mit, wenn ein
 * Modul seine Variante wechselt — und die anonymen Ansichten (öffentliches
 * Feedback, Datei-Freigaben, Lagerbuch-Helfer) bringen eigene Layouts GANZ OHNE
 * Suite-Shell mit, liegen also ohnehin jenseits davon. Die Druckflächen des
 * Lagerbuchs gehen bewusst an `FullShell` vorbei und benutzen `SuiteRahmen`
 * direkt (`lagerbuch/_ui/DruckRahmen.tsx`) — genau damit sie diesen Knopf nicht
 * bekommen.
 *
 * ⚠️ DER KNOPF LIEGT INNERHALB DER `Arbeitsdichte`, UND DAS IST KEINE
 * NACHLÄSSIGKEIT. Ausserhalb bekäme er die 56/72px der schmalen Ansichten und
 * stünde damit sichtbar größer da als jedes Bedienelement der Fläche, über der
 * er schwebt — auf einer Fläche, deren ganzer Auftrag „soll nicht stören"
 * lautet, wäre das die falsche Richtung. `position: fixed` wirkt unverändert:
 * `Arbeitsdichte` ist ein `ConfigProvider` und legt keinen enthaltenden Block
 * an (kein `transform`, kein `filter`, kein `contain`).
 *
 * ⚠️ KEIN `Suspense` MEHR. Die abgelöste Umfragen-Insel las
 * `useSearchParams()`, und Next verlangt dafür eine Grenze. Der Rückmeldeknopf
 * liest keine Suchparameter — er kennt nur `localStorage` —, und eine
 * `Suspense`-Grenze ohne etwas, das aussetzen könnte, wäre eine Zusage, die
 * niemand einlöst.
 */
export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const rueckmeldung = rueckmeldungUrl();

  return (
    <SuiteRahmen moduleKey={moduleKey} nav={nav}>
      <Arbeitsdichte>
        {children}
        {rueckmeldung && <RueckmeldungKnopf url={rueckmeldung} />}
      </Arbeitsdichte>
    </SuiteRahmen>
  );
}
