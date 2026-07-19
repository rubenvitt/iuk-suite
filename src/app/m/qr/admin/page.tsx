import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetForm } from "@/app/m/qr/admin/preset-form";
import { deletePresetAction } from "@/app/m/qr/actions";

export default async function QrAdminPage() {
  // 404 statt 403: ein 403 verriete, dass es diese Route gibt.
  await moduleAdminPageOrNotFound("qr");
  const presets = await listPresets();

  return (
    <div className="flex flex-col gap-8" data-testid="qr-admin">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Presets verwalten</h1>
        <ul className="flex flex-col gap-2">
          {presets.map((p) => (
            <li
              key={p.id}
              data-testid="preset-row"
              className="flex items-center justify-between gap-3 rounded border border-[var(--color-linie)] p-2"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true">{p.icon}</span>
                {p.label} <code className="text-[var(--color-stahl)]">{p.id}</code>
              </span>
              <form action={deletePresetAction}>
                <input type="hidden" name="id" value={p.id} />
                <button
                  type="submit"
                  className="min-h-[var(--tap)] rounded border border-[var(--color-rot)] px-3 text-[var(--color-rot)]"
                >
                  Löschen
                </button>
              </form>
            </li>
          ))}
        </ul>
        {presets.length === 0 && (
          <p className="text-[var(--color-stahl)]">Noch keine Presets angelegt.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Neues Preset anlegen</h2>
        <PresetForm />
      </section>
    </div>
  );
}
