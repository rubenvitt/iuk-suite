"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";
import { revalidatePath } from "next/cache";
import { requireModuleAdmin } from "@/core/auth/guards";
import { createService, deleteService } from "@/app/m/portal/_lib/services";
import { setzeAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";

const assertAdmin = () => requireModuleAdmin("portal");

export async function createServiceAction(formData: FormData) {
  const auditViewer = await assertAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async () => {
    await createService({
      slug: String(formData.get("slug")),
      name: String(formData.get("name")),
      url: String(formData.get("url")),
      isPublic: formData.get("isPublic") === "on",
    });
    revalidatePath("/m/portal");
  });
}

export async function deleteServiceAction(formData: FormData) {
  const auditViewer = await assertAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async () => {
    await deleteService(String(formData.get("id")));
    revalidatePath("/m/portal");
  });
}

// updateServiceAction intentionally omitted (YAGNI): no page or e2e spec
// exercises an update flow yet — the brief marks it optional. Add it via
// updateService() (already exported by _lib/services.ts) when a real
// "edit service" UI lands.

export async function setzeAnsprechpartnerAction(formData: FormData) {
  const auditViewer = await assertAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async () => {
    await setzeAnsprechpartner(String(formData.get("ansprechpartner") ?? "").trim());
    revalidatePath("/m/portal");
  });
}
