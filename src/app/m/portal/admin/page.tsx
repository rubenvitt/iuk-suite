import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { isAdmin } from "@/app/m/portal/_lib/rbac";
import { ensurePortalReady } from "@/app/m/portal/_lib/instrument";
import { getAllServices } from "@/app/m/portal/_lib/services";
import { deleteServiceAction } from "@/app/m/portal/actions";
import { ServiceForm } from "@/app/m/portal/admin/service-form";

export default async function PortalAdminPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.groups)) notFound();

  await ensurePortalReady();
  const services = await getAllServices();

  return (
    <div className="flex flex-col gap-8" data-testid="portal-admin">
      <section>
        <h1 className="text-xl font-bold">Dienste verwalten</h1>
        <table className="mt-4 w-full text-left text-sm" data-testid="service-table">
          <thead>
            <tr className="border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Slug</th>
              <th className="py-2">URL</th>
              <th className="py-2">Öffentlich</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className="border-b" data-testid="service-row">
                <td className="py-2">{s.name}</td>
                <td className="py-2">{s.slug}</td>
                <td className="py-2">{s.url}</td>
                <td className="py-2">{s.isPublic ? "ja" : "nein"}</td>
                <td className="py-2 text-right">
                  <form action={deleteServiceAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-[var(--color-rot)] px-2 py-1 text-[var(--color-rot)]"
                    >
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Neuen Dienst anlegen</h2>
        <ServiceForm />
      </section>
    </div>
  );
}
