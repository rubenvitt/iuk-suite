import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { neuigkeitenFuer } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import { NeuigkeitenListe } from "@/app/m/portal/_ui/NeuigkeitenListe";

/**
 * DIE EINE STELLE, AN DER RELEASE NOTES ZU SEHEN SIND.
 *
 * Sie liegt im Portal und nicht bei den Modulen, und das ist die Anforderung
 * selbst, nicht ihre Umsetzung: wer wissen will, was sich geändert hat, soll
 * EINE Seite kennen müssen und nicht fünf. Getragen wird das nicht durch eine
 * Absprache, sondern durch die Ablage — die Notizen liegen unter
 * `portal/_lib/neuigkeiten/`, und Modul-Interna sind kein API (`docs/design/
 * README.md`). `register.test.ts` hält zusätzlich fest, dass außerhalb des
 * Portals niemand darauf zugreift.
 *
 * `requiresAuth: true` steht für `portal` in der Registry, die Middleware
 * gatet diese Adresse also bereits. Die Sitzung wird hier trotzdem gelesen, aber
 * für eine andere Frage: WELCHE Notizen jemand sieht, hängt an seinen Gruppen
 * (`neuigkeitenFuer`).
 *
 * Server Component: kein `@ant-design/icons` (Falle 7), kein Compound-Zugriff
 * auf antd (Falle 1). Beides steckt in der Insel darunter, die ausschließlich
 * serialisierbare Daten bekommt.
 */
export default async function NeuigkeitenPage() {
  const session = await auth();
  const neuigkeiten = neuigkeitenFuer(session?.user?.groups ?? null);

  return (
    <>
      <Seitenkopf
        titel="Neuigkeiten"
        beschreibung="Was sich in den Apps geändert hat, in der Reihenfolge, in der es passiert ist. Du siehst hier die Apps, die für dich freigeschaltet sind."
        zurueck={{ titel: "Apps & Dienste", href: "/" }}
      />
      <NeuigkeitenListe neuigkeiten={neuigkeiten} />
    </>
  );
}
