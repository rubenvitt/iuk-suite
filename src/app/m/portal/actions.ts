"use server";
import { withAuditContext, auditActor, auditDenied } from "@/core/audit/server";
import { revalidatePath } from "next/cache";
import { requireModuleAdmin } from "@/core/auth/guards";
import { createService, deleteService, updateService } from "@/app/m/portal/_lib/services";
import { sichtbarkeitAusFormular } from "@/app/m/portal/_lib/gruppen";
import { setzeAnsprechpartner, setzeZeitzone } from "@/app/m/portal/_lib/einstellungen";
import { auth } from "@/core/auth";
import { aboVon, beendeAbo, richteAboEin, setzeAuswahl, wechsleThema } from "@/app/m/portal/_lib/faelligkeiten/abos";
import { bereinigeAuswahl } from "@/app/m/portal/_lib/faelligkeiten/auswahl";
import { sendeZielFuer, versand } from "@/app/m/portal/_lib/faelligkeiten/konfiguration";
import { QUELLEN } from "@/app/m/portal/_lib/faelligkeiten/quellen";
import { sammle, sichtbareQuellen } from "@/app/m/portal/_lib/faelligkeiten/sammeln";
import { sendeAnNtfy } from "@/app/m/portal/_lib/faelligkeiten/senden";
import { faelligkeitenSeitenUrl, nachrichtFuerPerson } from "@/app/m/portal/_lib/faelligkeiten/takt";

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

export type ProbeErgebnis = { ok: boolean; text: string };

const FAELLIG_PFAD = "/m/portal/faelligkeiten";

/**
 * Wer darf sein Abo für „Was steht an" pflegen (IDA-297)? Angemeldet, mindestens ein Modul, das die Seite
 * zeigt, und ein eingerichteter Versand — dieselbe Frage wie die Seite. Die Person ist IMMER die aus der
 * Sitzung, nie eine aus dem Formular (IDOR).
 */
async function faelligkeitenPerson() {
  const session = await auth();
  const personId = session?.user?.id;
  const gruppen = session?.user?.groups ?? [];
  const v = versand();
  if (!personId || !v || sichtbareQuellen(gruppen).length === 0) {
    auditDenied("portal", auditActor(session?.user));
    throw new Error("Nicht erlaubt.");
  }
  return { actor: auditActor(session?.user), personId, gruppen, versand: v };
}

export async function richteFaelligkeitenAboEinAction(): Promise<void> {
  const p = await faelligkeitenPerson();
  return withAuditContext({ actor: p.actor }, async () => {
    richteAboEin(p.personId, p.versand.praefix, p.gruppen);
    revalidatePath(FAELLIG_PFAD);
  });
}

/** Push an/aus und die abgewählten Arten. Unbekannte Schlüssel fallen still heraus (`bereinigeAuswahl`). */
export async function speichereFaelligkeitenAuswahlAction(eingabe: { push: boolean; abgewaehlt: string[] }): Promise<void> {
  const p = await faelligkeitenPerson();
  return withAuditContext({ actor: p.actor }, async () => {
    setzeAuswahl(p.personId, { push: eingabe?.push === true, abgewaehlt: bereinigeAuswahl(eingabe?.abgewaehlt, QUELLEN) });
    revalidatePath(FAELLIG_PFAD);
  });
}

export async function wechsleFaelligkeitenThemaAction(): Promise<void> {
  const p = await faelligkeitenPerson();
  return withAuditContext({ actor: p.actor }, async () => {
    wechsleThema(p.personId, p.versand.praefix);
    revalidatePath(FAELLIG_PFAD);
  });
}

export async function beendeFaelligkeitenAboAction(): Promise<void> {
  const p = await faelligkeitenPerson();
  return withAuditContext({ actor: p.actor }, async () => {
    beendeAbo(p.personId);
    revalidatePath(FAELLIG_PFAD);
  });
}

/**
 * Eine Probe an das EIGENE Thema — nach dem Abonnieren nicht bis Montag warten. Vermerkt KEINE Woche:
 * der Montagslauf kommt trotzdem. Inhalt wie montags (eigene Module, eigene Auswahl); ist nichts
 * fällig, kommt ein kurzer Satz, damit man sieht, dass der Weg trägt.
 */
export async function sendeFaelligkeitenProbeAction(): Promise<ProbeErgebnis> {
  const p = await faelligkeitenPerson();
  return withAuditContext({ actor: p.actor }, async () => {
    try {
      const abo = aboVon(p.personId);
      if (!abo) return { ok: false, text: "Richte die Mitteilungen zuerst ein." };
      const seite = faelligkeitenSeitenUrl();
      const alle = sammle(sichtbareQuellen(p.gruppen), new Date());
      const nachricht = nachrichtFuerPerson(abo, p.gruppen, alle, QUELLEN, seite) ?? {
        title: "Was steht an", message: "Gerade steht nichts an, das du ausgewählt hast. Diese Probe zeigt, dass die Mitteilung ankommt.",
        priority: 3 as const, tags: ["date"], ...(seite ? { click: seite } : {}),
      };
      await sendeAnNtfy(sendeZielFuer(p.versand, abo.thema), nachricht);
      return { ok: true, text: "Gesendet. Die Mitteilung sollte gleich auf deinem Telefon sein." };
    } catch (fehler) {
      console.error("Was steht an: Probe gescheitert —", fehler);
      return { ok: false, text: "Senden hat nicht geklappt. Versuch es später noch einmal." };
    }
  });
}
