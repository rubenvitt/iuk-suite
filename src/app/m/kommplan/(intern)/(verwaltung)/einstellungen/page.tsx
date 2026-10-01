import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { kopfFuerZeichnung, ladeBriefkopf } from "@/app/m/kommplan/_lib/briefkopf";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { pruefeKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { BriefkopfFormular } from "@/app/m/kommplan/_ui/einstellungen/Briefkopf";
import { KopfVorschau } from "@/app/m/kommplan/_ui/einstellungen/KopfVorschau";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

/** Briefkopf (Spec §4.4, §6.1): nur für Bearbeitende; Riegel auch im Layout der Gruppe (Falle 23). */
export default async function Einstellungen() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  pruefeKommplanBearbeiten(viewer);
  const db = getDb();
  const stand = ladeBriefkopf(db);
  return (
    <Huelle>
      <Seitenkopf titel="Einstellungen" zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung="Der Briefkopf gilt für alle Pläne: Organisation und Logo stehen rechts oben auf jedem gedruckten Blatt. Ohne Eintrag bleibt die Stelle leer." />
      <h2 className="kp-abschnittstitel">Vorschau des Kopfs</h2>
      <KopfVorschau kopf={kopfFuerZeichnung(db)} schrift={ARIMO.style.fontFamily} />
      <h2 className="kp-abschnittstitel">Briefkopf</h2>
      <BriefkopfFormular organisation={stand.organisation} logo={stand.logo} />
    </Huelle>
  );
}
