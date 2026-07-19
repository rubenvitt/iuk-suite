"use server";
import { revalidatePath } from "next/cache";
import { requireModuleAdmin } from "@/core/auth/guards";
import { createService, deleteService } from "@/app/m/portal/_lib/services";

const assertAdmin = () => requireModuleAdmin("portal");

export async function createServiceAction(formData: FormData) {
  await assertAdmin();
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
  await deleteService(String(formData.get("id")));
  revalidatePath("/m/portal");
}

// updateServiceAction intentionally omitted (YAGNI): no page or e2e spec
// exercises an update flow yet — the brief marks it optional. Add it via
// updateService() (already exported by _lib/services.ts) when a real
// "edit service" UI lands.
