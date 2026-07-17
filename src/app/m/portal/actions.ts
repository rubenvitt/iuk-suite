"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import { isAdmin } from "@/app/m/portal/_lib/rbac";
import { createService, deleteService } from "@/app/m/portal/_lib/services";
import { ensurePortalReady } from "@/app/m/portal/_lib/instrument";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.groups)) throw new Error("Forbidden");
}

export async function createServiceAction(formData: FormData) {
  await assertAdmin();
  await ensurePortalReady();
  await createService({
    slug: String(formData.get("slug")),
    name: String(formData.get("name")),
    url: String(formData.get("url")),
    isPublic: formData.get("isPublic") === "on",
  });
  revalidatePath("/m/portal");
}

export async function deleteServiceAction(formData: FormData) {
  await assertAdmin();
  await ensurePortalReady();
  await deleteService(String(formData.get("id")));
  revalidatePath("/m/portal");
}

// updateServiceAction intentionally omitted (YAGNI): no page or e2e spec
// exercises an update flow yet — the brief marks it optional. Add it via
// updateService() (already exported by _lib/services.ts) when a real
// "edit service" UI lands.
