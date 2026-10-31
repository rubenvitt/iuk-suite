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

export type JetztSendenErgebnis = { ok: boolean; text: string };

/**
 * „Was steht an" jetzt an das ntfy-Thema senden (IDA-297) — für den Suite-Betrieb, um nach dem
 * Einrichten nicht bis Montag warten zu müssen. Vermerkt KEINE Woche: der Montagslauf kommt trotzdem.
 * Ist nichts fällig, geht eine kurze Probe raus, damit man sieht, dass der Weg trägt.
 */
export async function sendeFaelligkeitenJetztAction(): Promise<JetztSendenErgebnis> {
  const auditViewer = await assertAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async () => {
    const { sendeZiel } = await import("@/app/m/portal/_lib/faelligkeiten/konfiguration");
    const { alleGruppen, faelligkeitenSeitenUrl } = await import("@/app/m/portal/_lib/faelligkeiten/takt");
    const { baueNachricht } = await import("@/app/m/portal/_lib/faelligkeiten/nachricht");
    const { sendeAnNtfy } = await import("@/app/m/portal/_lib/faelligkeiten/senden");
    const ziel = sendeZiel();
    if (!ziel) return { ok: false, text: "Der Versand ist nicht eingerichtet." };
    const seite = faelligkeitenSeitenUrl();
    const nachricht = baueNachricht(alleGruppen(new Date()), seite) ?? {
      title: "Was steht an", message: "Gerade steht nichts an. Diese Probe zeigt, dass der Push ankommt.",
      priority: 3 as const, tags: ["date"], ...(seite ? { click: seite } : {}),
    };
    try {
      await sendeAnNtfy(ziel, nachricht);
      return { ok: true, text: "Gesendet. Die Mitteilung sollte gleich auf den abonnierten Telefonen sein." };
    } catch (fehler) {
      console.error("Was steht an: Senden von Hand gescheitert —", fehler);
      return { ok: false, text: "Senden hat nicht geklappt. Läuft der ntfy-Container, und stimmt das Token?" };
    }
  });
}
