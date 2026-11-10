import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import {
  appsAus, heuteIso, neuigkeitenFuer, seiteAus, vergleichsStand,
} from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import { ALLE_APPS } from "@/app/m/portal/_lib/neuigkeiten/neu";
import { neuigkeitenGesehenVon } from "@/app/m/portal/_lib/vorlieben";
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
 * NUR DIE ERSTE SEITE (IDA-391): ältere lädt die Insel per Server Action nach
 * (`neuigkeiten/actions.ts`). Der Vergleichsstand für „Neu" wird hier gelesen;
 * GEMERKT wird der Besuch erst aus der Insel nach dem Anzeigen — kein
 * Schreibzugriff im Render.
 *
 * Server Component: kein Compound-Zugriff auf antd (Falle 1). Die Insel darunter
 * bekommt ausschließlich serialisierbare Daten.
 */
export default async function NeuigkeitenPage() {
  const session = await auth();
  const alle = neuigkeitenFuer(session?.user?.groups ?? null);
  const personId = session?.user?.id ?? null;
  const neuSeit = personId ? vergleichsStand(neuigkeitenGesehenVon(personId), heuteIso()) : null;

  return (
    <>
      <Seitenkopf
        titel="Neuigkeiten"
        zurueck={{ titel: "Apps & Dienste", href: "/" }}
      />
      <NeuigkeitenListe
        erste={seiteAus(alle, ALLE_APPS, 0)}
        apps={appsAus(alle)}
        neuSeit={neuSeit}
        merken={personId !== null}
      />
    </>
  );
}

export const metadata = { title: "Neuigkeiten" };
