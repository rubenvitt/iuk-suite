import { MenueRahmen } from "@/core/shell/MenueRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { rueckmeldeweg } from "@/core/rueckmeldung/konfiguration";
import { RueckmeldungKnopf } from "@/core/rueckmeldung/RueckmeldungKnopf";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Arbeitsflächen-Variante: volle Inhaltsbreite, das Menü der Suite links
 * bzw. hinter dem Ort-Knopf, und die dichtere Bediendichte darüber.
 *
 * DAS MENÜ STATT KOPFZEILE (IDA-347, Etappe 2): `MenueRahmen` trägt ein Menü mit zwei
 * Ebenen — am Desktop dauerhaft links, am Telefon als Blatt hinter einem Ort-Knopf. Die
 * Arbeitsdichte (44px) legt es selbst um sich; hier liegt sie um den INHALT.
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
 * Lagerbuchs gehen bewusst an `FullShell` vorbei und benutzen `MenueRahmen`
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
  const rueckmeldung = rueckmeldeweg();

  return (
    <MenueRahmen moduleKey={moduleKey} nav={nav}>
      <Arbeitsdichte>
        {children}
        {rueckmeldung && <RueckmeldungKnopf weg={rueckmeldung} />}
      </Arbeitsdichte>
    </MenueRahmen>
  );
}
