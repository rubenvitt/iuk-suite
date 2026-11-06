/**
 * DIE SCHREIBVORGÄNGE DER GERÄTEWARTUNG MIT IHREN RECHTEPRÜFUNGEN — einmal, für zwei Eingänge: die Server Actions
 * der App (`_actions/`) und den MCP-Server der Suite (`_mcp/werkzeuge.ts`). Wer hier eine Prüfung ändert, ändert
 * sie für beide; so kann der MCP-Server nie mehr als die App.
 *
 * Jeder Vorgang bekommt die schon geprüfte Person samt Rechten (`requireAktion` bzw. `aktionFuer`) und prüft die
 * Gruppe des Geräts aus der Datenbank, nie aus der Eingabe (IDOR). Eine erwartbare Ablehnung wirft `Abgelehnt`;
 * `ausfuehren` macht daraus den Satz am Bildschirm und schreibt im Audit-Kontext der Person.
 *
 * Ohne `"use server"`: die Werte hier liest auch ein Route Handler (Falle 6).
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import type { DirectoryResult } from "@/core/directory";
import { bereitgestellteFahrzeuge } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { getDb } from "../_db/client";
import { geraet } from "../_db/schema";
import { ladeMangel } from "./daten";
import {
  anlassEingabe, artEingabe, erledigtEingabe, feldFehlerAus, geraetEingabe, gruppeEingabe, idSchema, inhaltEingabe, mangelEingabe,
  pruefartEingabe, pruefplanEingabe, pruefungEingabe, stundenEingabe, verwalterEingabe,
} from "./eingabe";
import { verwalterEntfernen, verwalterHinzufuegen } from "./personen";
import { heute } from "./heute";
import {
  Abgelehnt, anlassVermerken, artLoeschen, artSpeichern, erledigtEintragen, geraetAendern, geraetAktiv, geraetAnlegen, gruppeLoeschen,
  gruppeSpeichern, inhaltSpeichern, mangelBeheben, mangelMelden, neueId, pruefartLoeschen, pruefartSpeichern, pruefartVerschieben,
  pruefplanSpeichern, pruefungAbschliessen, schonGesendet, stundenEintragen,
} from "./schreiben";
import { mitFahrzeugbezug } from "./fahrzeugbezug";
import type { Ergebnis } from "./typen";
import { anzeigename, verwaltetGruppe, type Rechte, type Viewer } from "./zugang";

export interface Akteur { viewer: Viewer; rechte: Rechte }

export const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";
const NICHT_DEINE = "Dieses Gerät gehört zu einer Gruppe, die du nicht verwaltest.";

/** Schreibt im Audit-Kontext der Person; `Abgelehnt` wird zum Ergebnis, alles andere fliegt weiter. */
export async function ausfuehren(z: Akteur, arbeit: (z: Akteur) => Ergebnis | void | Promise<Ergebnis | void>): Promise<Ergebnis> {
  return withAuditContext({ actor: auditActor(z.viewer) }, async (): Promise<Ergebnis> => {
    let r: Ergebnis | void;
    try {
      r = await arbeit(z);
    } catch (e) {
      if (e instanceof UngueltigeEingabe) return { ok: false, fehler: e.message, feldFehler: e.felder };
      if (e instanceof Abgelehnt) return { ok: false, fehler: e.message, feldFehler: e.feld ? { [e.feld]: e.message } : undefined };
      throw e;
    }
    if (r?.ok !== false) revalidatePath("/m/wartung", "layout");
    return r ?? { ok: true };
  });
}

/** Prüft die Eingabe; ungültig wird `Abgelehnt` mit den Meldungen je Feld (über `ausfuehren` zum Ergebnis). */
function geprueft<T>(schema: z.ZodType<T>, eingabe: unknown): T {
  const r = schema.safeParse(eingabe);
  if (r.success) return r.data;
  throw new UngueltigeEingabe(feldFehlerAus(r.error));
}

/** Wie `Abgelehnt`, aber mit allen Feldmeldungen — `ausfuehren` reicht sie unverändert durch. */
class UngueltigeEingabe extends Abgelehnt {
  constructor(readonly felder: Record<string, string>) { super("Bitte die markierten Felder prüfen."); }
}

function pruefeId(id: unknown): asserts id is string {
  if (!idSchema.safeParse(id).success) throw new Abgelehnt(UNGUELTIG);
}

function gruppeDesGeraets(id: string): string | null {
  return getDb().select({ g: geraet.gruppeId }).from(geraet).where(eq(geraet.id, id)).get()?.g ?? null;
}

function eigenesGeraet(rechte: Rechte, id: string): void {
  const g = gruppeDesGeraets(id);
  if (!g) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
  if (!verwaltetGruppe(rechte, g)) throw new Abgelehnt(NICHT_DEINE);
}

function kontext(viewer: Viewer) {
  return { jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer) };
}

// ---------------------------------------------------------------- Stufe „zugang“

export const stundenEintragenVorgang = (z: Akteur, geraetId: unknown, eingabe: unknown) => ausfuehren(z, ({ viewer }) => {
  const e = stundenEingabe.safeParse(eingabe);
  if (!idSchema.safeParse(geraetId).success || !e.success) {
    return { ok: false, fehler: "Bitte ganze Stunden eingeben.", feldFehler: { stunden: "Bitte ganze Stunden eingeben." } };
  }
  stundenEintragen(getDb(), geraetId as string, e.data.stunden, kontext(viewer), e.data.sendung);
});

/** „Wird eingesetzt“ bzw. „Zurück“ (IDA-369): macht die Prüfart mit diesem Anlass fällig. */
export const anlassVermerkenVorgang = (z: Akteur, geraetId: unknown, anlass: unknown) => ausfuehren(z, ({ viewer }) => {
  pruefeId(geraetId);
  const a = anlassEingabe.safeParse(anlass);
  if (!a.success) throw new Abgelehnt(UNGUELTIG);
  anlassVermerken(getDb(), geraetId, a.data, kontext(viewer));
});

/**
 * Die Prüfung am Gerät ohne Fotos — für den MCP-Server; das Telefon geht über `g/[id]/pruefung/senden`, weil Fotos
 * mitkommen. Dieselben Prüfungen: Stufe „zugang“, Sendungs-ID gegen doppeltes Ankommen, die Checkliste und das
 * Ergebnis prüft `pruefungAbschliessen`.
 */
export const pruefungOhneFotosVorgang = (z: Akteur, geraetId: unknown, eingabe: unknown) => ausfuehren(z, ({ viewer }) => {
  pruefeId(geraetId);
  const p = geprueft(pruefungEingabe, eingabe);
  const db = getDb();
  const schon = schonGesendet(db, "pruefung", p.sendung, geraetId);
  if (schon === "fremd") throw new Abgelehnt(UNGUELTIG);
  if (schon) return { ok: true, id: p.sendung };
  pruefungAbschliessen(db, geraetId, p, new Map(), kontext(viewer));
  return { ok: true, id: p.sendung };
});

/**
 * Einen Mangel melden, angemeldet und ohne Foto — für den MCP-Server; das Telefon geht über
 * `g/[id]/mangel/senden` (Foto, Meldung ohne Anmeldung hinter der Bremse). Wer meldet, steht aus der Anmeldung da.
 */
export const mangelMeldenVorgang = (z: Akteur, geraetId: unknown, eingabe: unknown, sendung?: unknown) =>
  ausfuehren(z, ({ viewer }) => {
    pruefeId(geraetId);
    const m = geprueft(mangelEingabe, eingabe);
    const id = sendung === undefined ? neueId() : sendung;
    pruefeId(id);
    const schon = schonGesendet(getDb(), "mangel", id, geraetId);
    if (schon === "fremd") throw new Abgelehnt(UNGUELTIG);
    if (schon) return { ok: true, id };
    mangelMelden(getDb(), geraetId, { id, text: m.text, foto: false, einsatzbereit: m.einsatzbereit }, kontext(viewer));
    return { ok: true, id };
  });

// ---------------------------------------------------------------- Stufe „verwalter“: Geräte

export const geraetAnlegenVorgang = (z: Akteur, eingabe: unknown) => ausfuehren(z, ({ rechte }) => {
  const e = geprueft(geraetEingabe, eingabe);
  if (!verwaltetGruppe(rechte, e.gruppeId)) throw new Abgelehnt("Diese Gruppe verwaltest du nicht.", "gruppeId");
  return { ok: true, id: geraetAnlegen(getDb(), mitFahrzeugbezug(e, bereitgestellteFahrzeuge().fahrzeuge), Date.now()) };
});

export const geraetAendernVorgang = (z: Akteur, id: unknown, eingabe: unknown) => ausfuehren(z, ({ rechte }) => {
  pruefeId(id);
  const e = geprueft(geraetEingabe, eingabe);
  const alt = getDb().select({ gruppeId: geraet.gruppeId, fahrzeugId: geraet.fahrzeugId }).from(geraet).where(eq(geraet.id, id)).get();
  if (!alt) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
  if (!verwaltetGruppe(rechte, alt.gruppeId)) throw new Abgelehnt(NICHT_DEINE);
  if (!verwaltetGruppe(rechte, e.gruppeId)) throw new Abgelehnt("Diese Gruppe verwaltest du nicht.", "gruppeId");
  geraetAendern(getDb(), id, mitFahrzeugbezug(e, bereitgestellteFahrzeuge().fahrzeuge, alt.fahrzeugId), Date.now());
});

/** Ausmustern (aktiv = false) und zurückholen. */
export const geraetAktivVorgang = (z: Akteur, id: unknown, aktiv: unknown) => ausfuehren(z, ({ rechte }) => {
  pruefeId(id);
  if (typeof aktiv !== "boolean") throw new Abgelehnt(UNGUELTIG);
  eigenesGeraet(rechte, id);
  geraetAktiv(getDb(), id, aktiv, Date.now());
});

export const erledigtEintragenVorgang = (z: Akteur, geraetId: unknown, eingabe: unknown) => ausfuehren(z, ({ viewer, rechte }) => {
  pruefeId(geraetId);
  const e = geprueft(erledigtEingabe, eingabe);
  eigenesGeraet(rechte, geraetId);
  erledigtEintragen(getDb(), geraetId, e, kontext(viewer));
});

/** Der Prüfplan eines Geräts (IDA-368): Prüfarten der Art abwählen, weitere zuschalten, eigenes Intervall. */
export const pruefplanSpeichernVorgang = (z: Akteur, geraetId: unknown, eingabe: unknown) => ausfuehren(z, ({ rechte }) => {
  pruefeId(geraetId);
  const e = geprueft(pruefplanEingabe, eingabe);
  eigenesGeraet(rechte, geraetId);
  pruefplanSpeichern(getDb(), geraetId, e);
});

/** Die Inhaltsliste einer Materialkiste (IDA-335) — Verwalter ihrer Gruppe, auch am Telefon in der Halle. */
export const inhaltSpeichernVorgang = (z: Akteur, geraetId: unknown, eingabe: unknown, stand: unknown) => ausfuehren(z, ({ rechte }) => {
  pruefeId(geraetId);
  if (typeof stand !== "string") throw new Abgelehnt(UNGUELTIG);
  const e = geprueft(inhaltEingabe, eingabe);
  eigenesGeraet(rechte, geraetId);
  inhaltSpeichern(getDb(), geraetId, e, stand);
});

export const mangelBehebenVorgang = (z: Akteur, id: unknown) => ausfuehren(z, ({ viewer, rechte }) => {
  pruefeId(id);
  const m = ladeMangel(getDb(), id);
  if (!m) throw new Abgelehnt("Diesen Mangel gibt es nicht mehr.");
  if (!verwaltetGruppe(rechte, m.gruppeId)) throw new Abgelehnt(NICHT_DEINE);
  mangelBeheben(getDb(), id, kontext(viewer));
});

// ---------------------------------------------------------------- Stufe „verwalter“: Gerätearten (gemeinsam)

export const artSpeichernVorgang = (z: Akteur, id: unknown, eingabe: unknown) => ausfuehren(z, () => {
  if (id !== null) pruefeId(id);
  const e = geprueft(artEingabe, eingabe);
  return { ok: true, id: artSpeichern(getDb(), id as string | null, e, Date.now()) };
});

export const artLoeschenVorgang = (z: Akteur, id: unknown) => ausfuehren(z, () => {
  pruefeId(id);
  artLoeschen(getDb(), id);
});

// ---------------------------------------------------------------- Stufe „verwalter“: Prüfarten (gemeinsam, IDA-368)

export const pruefartSpeichernVorgang = (z: Akteur, id: unknown, eingabe: unknown) => ausfuehren(z, () => {
  if (id !== null) pruefeId(id);
  const e = geprueft(pruefartEingabe, eingabe);
  return { ok: true, id: pruefartSpeichern(getDb(), id as string | null, e) };
});

export const pruefartLoeschenVorgang = (z: Akteur, id: unknown) => ausfuehren(z, () => {
  pruefeId(id);
  pruefartLoeschen(getDb(), id);
});

export const pruefartVerschiebenVorgang = (z: Akteur, id: unknown, richtung: unknown) => ausfuehren(z, () => {
  pruefeId(id);
  if (richtung !== -1 && richtung !== 1) throw new Abgelehnt(UNGUELTIG);
  pruefartVerschieben(getDb(), id, richtung);
});

// ---------------------------------------------------------------- Stufe „admin“: Gruppen und ihre Verwalter (IDA-337)

export const gruppeSpeichernVorgang = (z: Akteur, id: unknown, eingabe: unknown) => ausfuehren(z, () => {
  if (id !== null) pruefeId(id);
  const e = geprueft(gruppeEingabe, eingabe);
  return { ok: true, id: gruppeSpeichern(getDb(), id as string | null, e, Date.now()) };
});

export const gruppeLoeschenVorgang = (z: Akteur, id: unknown) => ausfuehren(z, () => {
  pruefeId(id);
  gruppeLoeschen(getDb(), id);
});

/** `verzeichnis` holt der Aufrufer erst nach der Rechteprüfung: die Antwort ist ein Ausschnitt der Organisation. */
export const verwalterHinzufuegenVorgang = (z: Akteur, eingabe: unknown, verzeichnis: () => Promise<DirectoryResult>) =>
  ausfuehren(z, async () => {
    const e = verwalterEingabe.safeParse(eingabe);
    if (!e.success) throw new Abgelehnt(UNGUELTIG);
    verwalterHinzufuegen(getDb(), e.data.gruppeId, e.data.nutzer, Date.now(), await verzeichnis());
  });

export const verwalterEntfernenVorgang = (z: Akteur, eingabe: unknown) => ausfuehren(z, () => {
  const e = verwalterEingabe.safeParse(eingabe);
  if (!e.success) throw new Abgelehnt(UNGUELTIG);
  verwalterEntfernen(getDb(), e.data.gruppeId, e.data.nutzer);
});
