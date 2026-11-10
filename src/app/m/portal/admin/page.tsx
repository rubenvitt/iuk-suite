import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { getAllServices } from "@/app/m/portal/_lib/services";
import { leseAnsprechpartner, leseZeitzone } from "@/app/m/portal/_lib/einstellungen";
import { ladeWaehlbareGruppen } from "@/app/m/portal/_lib/gruppen";
import { DienstAnlegen } from "@/app/m/portal/admin/dienst-anlegen";
import { vergebeneKategorien } from "@/app/m/portal/admin/kategorien";
import { ServiceTable } from "@/app/m/portal/admin/service-table";
import { AnsprechpartnerForm } from "@/app/m/portal/admin/ansprechpartner-form";
import { ZeitzoneForm } from "@/app/m/portal/admin/zeitzone-form";
import { waehlbareZeitzonen } from "@/core/zeit";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

import { SPACE } from "@/core/theme/tokens";
export default async function PortalAdminPage() {
  await moduleAdminPageOrNotFound("portal");

  const services = await getAllServices();
  const gruppen = await ladeWaehlbareGruppen(services);
  const ansprechpartner = await leseAnsprechpartner();
  const zeitzone = leseZeitzone();
  const kategorien = vergebeneKategorien(services);
  const gruppenNichtAbrufbar = gruppen.quelle === "error";

  // Der Seitenkopf (`@/core/shell/Seitenkopf`, Durchgang Aufgabe 13) trägt den
  // Seitentitel jetzt statt eines eigenen `<h1>`. Die beiden Zwischentitel
  // bleiben schlichtes HTML statt `Typography.Title`: diese Datei ist eine
  // Server-Komponente, und Property-Zugriffe auf antd-Compounds ergeben dort
  // `undefined` (siehe Global Constraints). Für zwei Zwischentitel lohnt weder
  // ein Untermodul-Import noch eine eigene Client-Komponente.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl }} data-testid="portal-admin">
      {/* „Dienst anlegen" im Kopf, die Schublade dahinter (IDA-391). Audit-Log und Rechte stehen
          seitdem nur noch in der Navigation (`layout.tsx`, `navFuerPortal`). */}
      <Seitenkopf
        titel="Dienste verwalten"
        aktionen={
          <DienstAnlegen gruppen={gruppen.optionen} kategorien={kategorien} gruppenNichtAbrufbar={gruppenNichtAbrufbar} />
        }
      />

      <section>
        <ServiceTable
          services={services}
          gruppen={gruppen.optionen}
          kategorien={kategorien}
          gruppenNichtAbrufbar={gruppenNichtAbrufbar}
        />
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBlock: `0 ${SPACE.lg}px` }}>
          Ansprechpartner für Zugänge
        </h2>
        <AnsprechpartnerForm wert={ansprechpartner} />
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBlock: `0 ${SPACE.lg}px` }}>
          Zeitzone
        </h2>
        <ZeitzoneForm wert={zeitzone} zonen={waehlbareZeitzonen()} />
      </section>
    </div>
  );
}

export const metadata = { title: "Dienste verwalten" };
