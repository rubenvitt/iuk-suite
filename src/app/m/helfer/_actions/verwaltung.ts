"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { planeAbgleich, wendeAbgleichAn, type Abgleichergebnis, type Abgleichplan } from "../_lib/abgleich";
import { zodFehler, type ActionAusgang, type ActionErgebnis } from "../_lib/actionErgebnis";
import { loescheAlles, setzeFreigabe, wechsleQuelle } from "../_lib/daten";
import { leseEinstellungen, schreibeEinstellung } from "../_lib/einstellungen";
import { filterSchema } from "../_lib/filter";
import { trenneVerbindung } from "../_lib/hiorg/verbindung";
import { helfer } from "../_db/schema";
import { heuteInZone, liesQuelle } from "../_lib/quelle";
import { anzeigeName, requireHelferVerwaltenAktion } from "../_lib/zugang";

/** Nach jedem Schreiben: alle Seiten des Moduls mit neuem Bestand. */
function neuLaden(): void {
  revalidatePath("/m/helfer", "layout");
}

/** Liest die Quelle und plant gegen den Bestand. Schreibt nichts. */
async function plane(filterEingabe: unknown): Promise<ActionErgebnis<Abgleichplan>> {
  const f = filterSchema.safeParse(filterEingabe);
  if (!f.success) return { ok: false, fehler: "Bitte den Filter prüfen.", feldFehler: zodFehler(f.error) ?? undefined };
  const db = getDb();
  const e = leseEinstellungen(db);
  const gelesen = await liesQuelle(db, { ...e, filter: f.data });
  if (!gelesen.ok) return { ok: false, fehler: gelesen.fehler };
  return { ok: true, wert: planeAbgleich(gelesen, db.select().from(helfer).all(), f.data, heuteInZone(), e.quelle) };
}

/** Vorschau des Abgleichs mit dem (noch nicht gespeicherten) Filter aus dem Formular. */
export async function vorschauAction(filterEingabe: unknown): Promise<ActionErgebnis<Abgleichplan>> {
  await requireHelferVerwaltenAktion();
  return plane(filterEingabe);
}

/**
 * Speichert den Filter, liest die Quelle NEU (sie kann sich seit der Vorschau geändert haben) und
 * gleicht ab. Der Filter wird nur gespeichert, wenn der Abgleich gelingt.
 */
export async function uebernehmenAction(filterEingabe: unknown): Promise<ActionErgebnis<Abgleichergebnis>> {
  const viewer = await requireHelferVerwaltenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const plan = await plane(filterEingabe);
    if (!plan.ok) return plan;
    const db = getDb();
    const e = leseEinstellungen(db);
    schreibeEinstellung(db, "filter", filterSchema.parse(filterEingabe));
    const ergebnis = wendeAbgleichAn(db, plan.wert, { neueFreigeben: e.neueFreigeben, von: { name: anzeigeName(viewer), sub: viewer.id } });
    neuLaden();
    return { ok: true, wert: ergebnis };
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

/** Wechselt zwischen Demo und HiOrg; die Helfer der bisherigen Quelle werden gelöscht. */
export async function quelleAction(quelle: unknown): Promise<ActionErgebnis<number>> {
  const viewer = await requireHelferVerwaltenAktion();
  if (quelle !== "demo" && quelle !== "hiorg") return { ok: false, fehler: "Unbekannte Quelle." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const n = wechsleQuelle(getDb(), quelle);
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
