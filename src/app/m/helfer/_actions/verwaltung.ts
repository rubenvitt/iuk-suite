"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { Abgleichergebnis, Abgleichplan } from "../_lib/abgleich";
import type { ActionAusgang, ActionErgebnis } from "../_lib/actionErgebnis";
import { loescheAlles, setzeFreigabe, wechsleQuelle } from "../_lib/daten";
import { schreibeEinstellung } from "../_lib/einstellungen";
import { QUELLEN, type Quelle } from "../_lib/quellen";
import { trenneVerbindung } from "../_lib/hiorg/verbindung";
import { planeLauf, uebernehmeLauf } from "../_lib/lauf";
import { requireHelferVerwaltenAktion } from "../_lib/zugang";

/** Nach jedem Schreiben: alle Seiten des Moduls mit neuem Bestand. */
function neuLaden(): void {
  revalidatePath("/m/helfer", "layout");
}

/** Vorschau des Abgleichs mit dem (noch nicht gespeicherten) Filter aus dem Formular. */
export async function vorschauAction(filterEingabe: unknown): Promise<ActionErgebnis<Abgleichplan>> {
  await requireHelferVerwaltenAktion();
  return planeLauf(filterEingabe);
}

/**
 * Speichert den Filter, liest die Quelle NEU und gleicht ab (`_lib/lauf.ts`). Die Excel-Datei geht
 * nicht hier durch, sondern durch `datei/abgleich/route.ts` — eine Server Action nimmt höchstens 1 MB.
 */
export async function uebernehmenAction(filterEingabe: unknown): Promise<ActionErgebnis<Abgleichergebnis>> {
  const viewer = await requireHelferVerwaltenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const ergebnis = await uebernehmeLauf(viewer, filterEingabe);
    if (ergebnis.ok) neuLaden();
    return ergebnis;
  });
}

const freigabeSchema = z.object({ ids: z.array(z.string().min(1).max(64)).max(5_000), wert: z.boolean() });

/** Freigabe fürs Einsatzbuch, für eine oder viele Personen (die angezeigten nach Filter). */
export async function freigabeAction(eingabe: unknown): Promise<ActionErgebnis<number>> {
  const viewer = await requireHelferVerwaltenAktion();
  const p = freigabeSchema.safeParse(eingabe);
  if (!p.success) return { ok: false, fehler: "Unbekannte Auswahl." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const n = setzeFreigabe(getDb(), p.data.ids, p.data.wert);
    neuLaden();
    return { ok: true, wert: n };
  });
}

export async function neueFreigebenAction(wert: unknown): Promise<ActionAusgang> {
  const viewer = await requireHelferVerwaltenAktion();
  if (typeof wert !== "boolean") return { ok: false, fehler: "Unbekannter Wert." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    schreibeEinstellung(getDb(), "neueFreigeben", wert);
    neuLaden();
    return { ok: true };
  });
}

/** Wechselt die Quelle (Demo, HiOrg, Excel-Datei); die Helfer der bisherigen werden gelöscht. */
export async function quelleAction(quelle: unknown): Promise<ActionErgebnis<number>> {
  const viewer = await requireHelferVerwaltenAktion();
  if (!(QUELLEN as readonly unknown[]).includes(quelle)) return { ok: false, fehler: "Unbekannte Quelle." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const n = wechsleQuelle(getDb(), quelle as Quelle);
    neuLaden();
    return { ok: true, wert: n };
  });
}

/** Trennt die Verbindung zu HiOrg: das gespeicherte Token ist danach gelöscht. Die Helfer bleiben. */
export async function trennenAction(): Promise<ActionAusgang> {
  const viewer = await requireHelferVerwaltenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    trenneVerbindung(getDb());
    neuLaden();
    return { ok: true };
  });
}

/** Löscht alle Helfer und das Abgleichprotokoll. */
export async function alleLoeschenAction(): Promise<ActionErgebnis<number>> {
  const viewer = await requireHelferVerwaltenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const n = loescheAlles(getDb());
    neuLaden();
    return { ok: true, wert: n };
  });
}
