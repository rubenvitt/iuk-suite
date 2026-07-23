import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { getAllServices } from "@/app/m/portal/_lib/services";
import { deleteServiceAction } from "@/app/m/portal/actions";
import { ServiceForm } from "@/app/m/portal/admin/service-form";
import { ServiceTable } from "@/app/m/portal/admin/service-table";

import { SPACE } from "@/core/theme/tokens";
export default async function PortalAdminPage() {
  await moduleAdminPageOrNotFound("portal");

  const services = await getAllServices();

  // Überschriften als schlichtes HTML statt `Typography.Title`: diese Datei ist
  // eine Server-Komponente, und Property-Zugriffe auf antd-Compounds ergeben
  // dort `undefined` (siehe Global Constraints). Für zwei Überschriften lohnt
  // weder ein Untermodul-Import noch eine eigene Client-Komponente.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl }} data-testid="portal-admin">
      <section>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBlock: "0 16px" }}>Dienste verwalten</h1>
        <ServiceTable services={services} deleteAction={deleteServiceAction} />
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBlock: "0 16px" }}>
          Neuen Dienst anlegen
        </h2>
        <ServiceForm />
      </section>
    </div>
  );
}
