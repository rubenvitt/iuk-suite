import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { getAllServices } from "@/app/m/portal/_lib/services";
import { leseAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";
import { deleteServiceAction, setzeAnsprechpartnerAction } from "@/app/m/portal/actions";
import { ServiceForm } from "@/app/m/portal/admin/service-form";
import { ServiceTable } from "@/app/m/portal/admin/service-table";
import { AnsprechpartnerForm } from "@/app/m/portal/admin/ansprechpartner-form";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

import { SPACE } from "@/core/theme/tokens";
export default async function PortalAdminPage() {
  await moduleAdminPageOrNotFound("portal");

  const services = await getAllServices();
  const ansprechpartner = await leseAnsprechpartner();

  // Der Seitenkopf (`@/core/shell/Seitenkopf`, Durchgang Aufgabe 13) trägt den
  // Seitentitel jetzt statt eines eigenen `<h1>`. Die beiden Zwischentitel
  // bleiben schlichtes HTML statt `Typography.Title`: diese Datei ist eine
  // Server-Komponente, und Property-Zugriffe auf antd-Compounds ergeben dort
  // `undefined` (siehe Global Constraints). Für zwei Zwischentitel lohnt weder
  // ein Untermodul-Import noch eine eigene Client-Komponente.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl }} data-testid="portal-admin">
      <Seitenkopf titel="Dienste verwalten" />

      <section>
        <ServiceTable services={services} deleteAction={deleteServiceAction} />
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBlock: `0 ${SPACE.lg}px` }}>
          Neuen Dienst anlegen
        </h2>
        <ServiceForm />
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBlock: `0 ${SPACE.lg}px` }}>
          Ansprechpartner für Zugänge
        </h2>
        {/* `--iuk-gedaempft` statt `opacity`: Deckkraft dimmt den Kontrast
            unprüfbar mit und hat keinen Dunkelzweig (Falle/Randbedingung
            „Kein opacity zum Dämpfen von Text", übernommen aus `DiensteRaster`). */}
        <p style={{ marginBlock: `0 ${SPACE.md}px`, color: "var(--iuk-gedaempft)" }}>
          Steht im Portal, wenn jemand für nichts freigeschaltet ist. Bleibt das Feld leer,
          erscheint dort nur die Erklärung ohne Kontaktweg.
        </p>
        <AnsprechpartnerForm wert={ansprechpartner} action={setzeAnsprechpartnerAction} />
      </section>
    </div>
  );
}
