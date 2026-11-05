"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb, type GemeinschaftDb } from "../_db/client";
import { leseVorlage } from "../_lib/dokumentPdf";
import { fassungMitMieter } from "../_lib/dokumentErzeugen";
import {
  Abgelehnt, dokumentGrundlage, entferneVertrag, entferneVorlage, erstelleDokument, gebeDokumentFrei, ladeVorlage, legeSperrzeitAn, legeUnterschriebenAb, lehneAb,
  loescheSperrzeit, NichtGefunden, nimmFreigabeZurueck, nimmZusageZurueck, pruefeUnterschreibbar, sageZu, setzeVertrag, setzeVorlageFelder, setzeVorlageZeichnen,
  speichereWerte, unterschreibeAlsLeitung, verwirfDokument, zeichnenErlaubt,
} from "../_lib/vermietung";
import { begruendungSchema, idSchema, pruefeSperrzeit, vertragSchema, type Ergebnis } from "../_lib/vermietungEingabe";
import { istDokumentart, type Dokumentart } from "../_lib/vermietungTypen";
import { pruefeFelder, pruefeWerte } from "../_lib/vertragFeld";
import { unterschriftAusDataUrl } from "../_lib/vertragUnterschrift";
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

export async function vertragEntfernenAction(id: string, art: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success || !istDokumentart(art)) { return { ok: false, fehler: UNGUELTIG }; }
  return ohneWert(await alsLeitung(viewer, (db) => entferneVertrag(db, id, art)));
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

/* ---------------- Vorlagen (IDA-343, IDA-354) ---------------- */

/** Speichert die Feldliste einer Vorlage; geprüft gegen die echten Seitenmaße und Formularfelder der PDF. */
export async function vorlageFelderAction(art: unknown, felder: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!istDokumentart(art)) return { ok: false, fehler: UNGUELTIG };
  const v = ladeVorlage(getDb(), art);
  if (!v) return { ok: false, fehler: "Es liegt keine Vorlage. Bitte die Seite neu laden." };
  const lesbar = await leseVorlage(v.inhalt);
  const wert = lesbar.ok ? pruefeFelder(felder, lesbar.seiten, lesbar.formular) : null;
  if (!wert) return { ok: false, fehler: "Ein Feld ist zu klein, liegt nicht ganz auf der Seite oder hat keinen Namen." };
  return ohneWert(await alsLeitung(viewer, (db) => setzeVorlageFelder(db, art, wert)));
}

/** Digitale Unterschrift auf der Statusseite an oder aus; aus bleibt nur der Upload des unterschriebenen Ausdrucks. */
export async function vorlageZeichnenAction(art: unknown, an: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!istDokumentart(art) || typeof an !== "boolean") return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await alsLeitung(viewer, (db) => setzeVorlageZeichnen(db, art, an)));
}

export async function vorlageEntfernenAction(art: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!istDokumentart(art)) return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await alsLeitung(viewer, (db) => entferneVorlage(db, art)));
}

/* ---------------- Dokumente einer Zusage (IDA-354) ---------------- */

const versionOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const NAME_MAX = 120;
const nameAus = (roh: unknown) => (typeof roh === "string" ? roh.trim() : "");
const zieleOk = (id: unknown, art: unknown): art is Dokumentart => idSchema.safeParse(id).success && istDokumentart(art);

export async function dokumentErstellenAction(id: unknown, art: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!zieleOk(id, art)) return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await alsLeitung(viewer, (db, jetzt) => erstelleDokument(db, id as string, art, jetzt)));
}

export async function dokumentVerwerfenAction(id: unknown, art: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!zieleOk(id, art)) return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await alsLeitung(viewer, (db) => verwirfDokument(db, id as string, art)));
}

/** Speichert die Werte der Leitung; gibt die neue Version zurück. */
export async function dokumentWerteAction(id: unknown, art: unknown, werte: unknown, version: unknown): Promise<Ergebnis<number>> {
  const viewer = await requireLeitungAktion();
  if (!zieleOk(id, art) || !versionOk(version)) return { ok: false, fehler: UNGUELTIG };
  const g = dokumentGrundlage(getDb(), id as string, art);
  if (!g) return { ok: false, fehler: "Dieses Dokument gibt es nicht mehr. Bitte die Seite neu laden." };
  const w = pruefeWerte(werte, g.felder);
  if (!w) return { ok: false, fehler: UNGUELTIG };
  return alsLeitung(viewer, (db) => speichereWerte(db, id as string, art, w, version));
}

/** Die Leitung unterschreibt ihre Felder; gibt die neue Version zurück. */
export async function dokumentLeitungUnterschriftAction(id: unknown, art: unknown, version: unknown, eingabe: { name?: unknown; bild?: unknown }): Promise<Ergebnis<number>> {
  const viewer = await requireLeitungAktion();
  if (!zieleOk(id, art) || !versionOk(version)) return { ok: false, fehler: UNGUELTIG };
  const name = nameAus(eingabe?.name);
  if (name.length < 2 || name.length > NAME_MAX) return { ok: false, fehler: "Bitte deinen Namen eingeben.", feldFehler: { name: "Bitte deinen Namen eingeben." } };
  const bild = unterschriftAusDataUrl(eingabe?.bild);
  if (!bild) return { ok: false, fehler: "Bitte unterschreib im Feld." };
  return alsLeitung(viewer, (db, jetzt) => unterschreibeAlsLeitung(db, id as string, art, version, { name, bild, am: jetzt }));
}

export async function dokumentFreigebenAction(id: unknown, art: unknown, version: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!zieleOk(id, art) || !versionOk(version)) return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await alsLeitung(viewer, (db, jetzt) => gebeDokumentFrei(db, id as string, art, version, jetzt)));
}

export async function dokumentFreigabeZurueckAction(id: unknown, art: unknown, version: unknown): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!zieleOk(id, art) || !versionOk(version)) return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await alsLeitung(viewer, (db) => nimmFreigabeZurueck(db, id as string, art, version)));
}

/**
 * Die mietende Person unterschreibt vor Ort auf dem Gerät der Leitung (Tablet bei der Übergabe). Wie auf der
 * Statusseite, nur über die Kennung statt den Code; im Audit steht die Leitung, deren Gerät es ist.
 */
export async function dokumentVorOrtAction(id: unknown, art: unknown, version: unknown, eingabe: { name?: unknown; bild?: unknown }): Promise<Ergebnis> {
  const viewer = await requireLeitungAktion();
  if (!zieleOk(id, art) || !versionOk(version)) return { ok: false, fehler: UNGUELTIG };
  const name = nameAus(eingabe?.name);
  if (name.length < 2 || name.length > NAME_MAX) return { ok: false, fehler: "Bitte den Namen eingeben.", feldFehler: { name: "Bitte den Namen eingeben." } };
  const bild = unterschriftAusDataUrl(eingabe?.bild);
  if (!bild) return { ok: false, fehler: "Bitte im Feld unterschreiben." };
  const db = getDb();
  let g: NonNullable<ReturnType<typeof dokumentGrundlage>>;
  try {
    const a = pruefeUnterschreibbar(db, { id: id as string }, art);
    if (a.version !== version) return { ok: false, fehler: "Das Dokument wurde gerade geändert. Bitte die Seite neu laden." };
    if (!zeichnenErlaubt(db, art)) return { ok: false, fehler: "Digital unterschreiben ist für dieses Dokument ausgeschaltet." };
    const geladen = dokumentGrundlage(db, id as string, art);
    if (!geladen) return { ok: false, fehler: "Dieses Dokument gibt es nicht mehr. Bitte die Seite neu laden." };
    g = geladen;
  } catch (e) {
    if (e instanceof NichtGefunden || e instanceof Abgelehnt) return { ok: false, fehler: e.message };
    throw e;
  }
  const am = Date.now();
  let fassung: Awaited<ReturnType<typeof fassungMitMieter>>;
  try {
    fassung = await fassungMitMieter(g, art, { name, bild, am });
  } catch {
    return { ok: false, fehler: "Die Unterschrift ließ sich nicht übernehmen. Bitte noch einmal zeichnen." };
  }
  return ohneWert(await alsLeitung(viewer, (db2, jetzt) => legeUnterschriebenAb(db2, { id: id as string }, art, {
    inhalt: fassung.inhalt, herkunft: "gezeichnet", unterschrift: { name, bild, am, feldIds: fassung.feldIds }, version,
  }, jetzt)));
}
