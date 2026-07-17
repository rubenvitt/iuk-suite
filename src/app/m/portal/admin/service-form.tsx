import { createServiceAction } from "@/app/m/portal/actions";

export function ServiceForm() {
  return (
    <form action={createServiceAction} className="mt-4 flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Slug
        <input name="slug" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        URL
        <input name="url" type="url" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="isPublic" type="checkbox" defaultChecked />
        Öffentlich sichtbar
      </label>
      <button
        type="submit"
        className="rounded-md bg-[var(--color-tinte)] px-4 py-2 text-white"
      >
        Anlegen
      </button>
    </form>
  );
}
