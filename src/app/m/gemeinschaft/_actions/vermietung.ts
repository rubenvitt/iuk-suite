"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb, type GemeinschaftDb } from "../_db/client";
import {
  Abgelehnt, entferneVertrag, entferneVorlage, ladeVorlage, legeSperrzeitAn, setzeVorlageFeld, setzeVorlageZeichnen, lehneAb, loescheSperrzeit, NichtGefunden, nimmZusageZurueck, sageZu, setzeVertrag,
} from "../_lib/vermietung";
import { begruendungSchema, idSchema, pruefeSperrzeit, vertragSchema, type Ergebnis } from "../_lib/vermietungEingabe";
import { pruefeFeld, type Feld } from "../_lib/vertragFeld";
import { leseVorlage } from "../_lib/vertragUnterschrift";
import { requireLeitungAktion, type Viewer } from "../_lib/zugang";

/*
 * Die Actions der Leitung für die Vermietung der Bar (IDA-315). Jede prüft Host, Sitzung und Recht selbst
 * (`requireLeitungAktion`), parst ihre Eingaben neu und schreibt im Audit-Kontext der handelnden Person.
 */

const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";

/** Führt `schreiben` als Leitung aus; erwartbare Ablehnungen werden zum Satz, alles andere wirft weiter. */
function alsLeitung<T>(viewer: Viewer, schreiben: (db: GemeinschaftDb, jetzt: number) => T): Promise<Ergebnis<T>> {
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    try {
      const wert = schreiben(getDb(), Date.now());
      revalidatePath("/m/gemeinschaft", "layout");
      return { ok: true, wert } as Ergebnis<T>;
    } catch (e) {
      if (e instanceof NichtGefunden || e instanceof Abgelehnt) return { ok: false, fehler: e.message };
      throw e;
    }
  });
}

const ohneWert = (r: Ergebnis<unknown>): Ergebnis => (r.ok ? { ok: true } : r);

/** Zusagen; blockiert bei harter Überschneidung. Gibt zurück, wie viele offene Anfragen im selben Zeitraum warten. */
export async function anfrageZusagenAction(id: string): Promise<Ergebnis<{ weitereOffene: number }>> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) { return { ok: false, fehler: UNGUELTIG }; }
  return alsLeitung(viewer, (db, jetzt) => sageZu(db, id, jetzt));
}

export async function anfrageAblehnenAction(id: string, begruendung: string): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) { return { ok: false, fehler: UNGUELTIG }; }
  const b = begruendungSchema.safeParse(begruendung);
  if (!b.success) { return { ok: false, fehler: b.error.issues[0].message, feldFehler: { begruendung: b.error.issues[0].message } }; }
  return ohneWert(await alsLeitung(viewer, (db, jetzt) => lehneAb(db, id, b.data, jetzt)));
}

export async function zusageZuruecknehmenAction(id: string, begruendung: string): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) { return { ok: false, fehler: UNGUELTIG }; }
  const b = begruendungSchema.safeParse(begruendung);
  if (!b.success) { return { ok: false, fehler: b.error.issues[0].message, feldFehler: { begruendung: b.error.issues[0].message } }; }
  return ohneWert(await alsLeitung(viewer, (db, jetzt) => nimmZusageZurueck(db, id, b.data, jetzt)));
}

export async function vertragStandAction(id: string, stand: string): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  const s = vertragSchema.safeParse(stand);
  if (!idSchema.safeParse(id).success || !s.success) { return { ok: false, fehler: UNGUELTIG }; }
  return ohneWert(await alsLeitung(viewer, (db) => setzeVertrag(db, id, s.data)));
}

export async function vertragEntfernenAction(id: string): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) { return { ok: false, fehler: UNGUELTIG }; }
  return ohneWert(await alsLeitung(viewer, (db) => entferneVertrag(db, id)));
}

export async function sperrzeitAnlegenAction(eingabe: unknown): Promise<Ergebnis<string>> {
  const viewer = await requireLeitungAktion();
  const p = pruefeSperrzeit(eingabe);
  if (!p.ok) { return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: p.feldFehler }; }
  return alsLeitung(viewer, (db, jetzt) => legeSperrzeitAn(db, p.wert, jetzt));
}

export async function sperrzeitLoeschenAction(id: string): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) { return { ok: false, fehler: UNGUELTIG }; }
  return ohneWert(await alsLeitung(viewer, (db) => loescheSperrzeit(db, id)));
}

/* ---------------- Vertragsvorlage (IDA-343) ---------------- */

/** Setzt das Unterschriftenfeld der Vorlage (`null` entfernt es); geprüft gegen die echten Seitenmaße der PDF. */
export async function vorlageFeldAction(feld: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  const v = ladeVorlage(getDb());
  if (!v) return { ok: false, fehler: "Es liegt keine Vorlage. Bitte die Seite neu laden." };
  let wert: Feld | null = null;
  if (feld !== null) {
    const lesbar = await leseVorlage(v.inhalt);
    wert = lesbar.ok ? pruefeFeld(feld, lesbar.seiten) : null;
    if (!wert) return { ok: false, fehler: "Das Feld ist zu klein oder liegt nicht ganz auf der Seite." };
  }
  return ohneWert(await alsLeitung(viewer, (db) => setzeVorlageFeld(db, wert)));
}

/** Digitale Unterschrift auf der Statusseite an oder aus; aus bleibt nur der Upload des unterschriebenen Ausdrucks. */
export async function vorlageZeichnenAction(an: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (typeof an !== "boolean") return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await alsLeitung(viewer, (db) => setzeVorlageZeichnen(db, an)));
}

export async function vorlageEntfernenAction(): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  return ohneWert(await alsLeitung(viewer, (db) => entferneVorlage(db)));
}
