import { auth } from "@/core/auth";
import { ensurePortalReady } from "@/app/m/portal/_lib/instrument";
import { getVisibleServicesForUser } from "@/app/m/portal/_lib/services";

export default async function PortalPage() {
  await ensurePortalReady();
  const session = await auth();
  const services = await getVisibleServicesForUser(session?.user?.groups ?? []);
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" data-testid="portal-grid">
      {services.map((s) => (
        <a
          key={s.id}
          href={s.url}
          target={s.openInNewTab ? "_blank" : undefined}
          rel={s.openInNewTab ? "noopener noreferrer" : undefined}
          className="rounded-xl border p-4 hover:bg-[var(--color-papier)]"
          data-testid="service-tile"
        >
          <div className="font-semibold">{s.name}</div>
          {s.description && (
            <div className="text-sm text-[var(--color-stahl)]">{s.description}</div>
          )}
        </a>
      ))}
    </div>
  );
}
