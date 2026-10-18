"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";
import { revalidatePath } from "next/cache";
import { requireModuleAdmin } from "@/core/auth/guards";
import { createService, deleteService, updateService } from "@/app/m/portal/_lib/services";
import { sichtbarkeitAusFormular } from "@/app/m/portal/_lib/gruppen";
import { setzeAnsprechpartner, setzeZeitzone } from "@/app/m/portal/_lib/einstellungen";

const assertAdmin = () => requireModuleAdmin("portal");

export async function createServiceAction(formData: FormData) {
  const auditViewer = await assertAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async () => {
    await createService({
      slug: String(formData.get("slug")),
      name: String(formData.get("name")),
      url: String(formData.get("url")),
      ...sichtbarkeitAusFormular(formData),
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

/**
 * Ändert nur, wer die Kachel sieht (IDA-227) — kein allgemeines Bearbeiten.
 * Die Prüfung „nicht öffentlich braucht eine Gruppe" steht in
 * `sichtbarkeitAusFormular`, also VOR dem Schreiben.
 */
export async function setzeSichtbarkeitAction(formData: FormData) {
  const auditViewer = await assertAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async () => {
    await updateService(String(formData.get("id")), sichtbarkeitAusFormular(formData));
    revalidatePath("/m/portal");
  });
}

export async function setzeAnsprechpartnerAction(formData: FormData) {
  const auditViewer = await assertAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async () => {
    await setzeAnsprechpartner(String(formData.get("ansprechpartner") ?? "").trim());
    revalidatePath("/m/portal");
  });
}

/**
 * Die Anzeigezone der Suite (DRK-469). `revalidatePath("/", "layout")` statt nur
 * `/m/portal`: die Zone steht im Root-Layout (`<html data-zeitzone>`), und jede
 * Seite der Suite zeigt Zeiten.
 */
export async function setzeZeitzoneAction(formData: FormData) {
  const auditViewer = await assertAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async () => {
    await setzeZeitzone(String(formData.get("zeitzone") ?? "").trim());
    revalidatePath("/", "layout");
  });
}
