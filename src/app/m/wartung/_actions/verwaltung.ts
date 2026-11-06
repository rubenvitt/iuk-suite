"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDirectory, type DirectoryResult } from "@/core/directory";
import { getDb } from "../_db/client";
import { ladeUnterlage } from "../_lib/daten";
import { idSchema } from "../_lib/eingabe";
import { SUCHE_MAX_TREFFER, SUCHE_MIN_ZEICHEN, vorschlaege } from "../_lib/personen";
import { Abgelehnt, unterlageLoeschen, unterlageVerschieben } from "../_lib/schreiben";
import { entferneUnterlage } from "../_lib/unterlagen";
import type { Ergebnis, PersonVorschlag } from "../_lib/typen";
import {
  artLoeschenVorgang, artSpeichernVorgang, ausfuehren, erledigtEintragenVorgang, geraetAendernVorgang, geraetAktivVorgang,
  geraetAnlegenVorgang, gruppeLoeschenVorgang, gruppeSpeichernVorgang, inhaltSpeichernVorgang, mangelBehebenVorgang,
  pruefartLoeschenVorgang, pruefartSpeichernVorgang, pruefartVerschiebenVorgang, pruefplanSpeichernVorgang, UNGUELTIG,
  verwalterEntfernenVorgang, verwalterHinzufuegenVorgang,
} from "../_lib/vorgaenge";
import { requireAktion, verwaltetGruppe, type Rechte, type Stufe } from "../_lib/zugang";

/*
 * Die Schreibwege der Verwaltung. Jede Action prüft Host, Sitzung und Stufe selbst (`requireAktion`); die
 * Prüfungen danach und das Schreiben stehen in `_lib/vorgaenge.ts`, die auch der MCP-Server der Suite nimmt.
 */

const NICHT_DEINE = "Dieses Gerät gehört zu einer Gruppe, die du nicht verwaltest.";

type Akteur = Awaited<ReturnType<typeof requireAktion>>;

/** Riegel, dann der Vorgang im Audit-Kontext der Person (`ausfuehren` setzt ihn dort noch einmal, für den MCP-Weg). */
async function schreibe(stufe: Stufe, vorgang: (z: Akteur) => Promise<Ergebnis>): Promise<Ergebnis> {
  const z = await requireAktion(stufe);
  return withAuditContext({ actor: auditActor(z.viewer) }, () => vorgang(z));
}

// ---------------------------------------------------------------- Geräte

export async function geraetAnlegenAction(eingabe: unknown): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => geraetAnlegenVorgang(z, eingabe));
}

export async function geraetAendernAction(id: string, eingabe: unknown): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => geraetAendernVorgang(z, id, eingabe));
}

/** Ausmustern (aktiv = false) und zurückholen. */
export async function geraetAktivAction(id: string, aktiv: boolean): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => geraetAktivVorgang(z, id, aktiv));
}

export async function erledigtEintragenAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => erledigtEintragenVorgang(z, geraetId, eingabe));
}

/** Der Prüfplan eines Geräts (IDA-368): Prüfarten der Art abwählen, weitere zuschalten, eigenes Intervall. */
export async function pruefplanSpeichernAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => pruefplanSpeichernVorgang(z, geraetId, eingabe));
}

/** Die Inhaltsliste einer Materialkiste (IDA-335) — Verwalter ihrer Gruppe, auch am Telefon in der Halle. */
export async function inhaltSpeichernAction(geraetId: string, eingabe: unknown, stand: unknown): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => inhaltSpeichernVorgang(z, geraetId, eingabe, stand));
}

export async function mangelBehebenAction(id: string): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => mangelBehebenVorgang(z, id));
}

// ---------------------------------------------------------------- Unterlagen (IDA-300; Hochladen: Route `geraete/[id]/unterlagen`)

/** Die Unterlage, wenn die aufrufende Person die Gruppe ihres Geräts verwaltet — Gruppe aus der Datenbank. */
function eigeneUnterlage(rechte: Rechte, id: string) {
  const u = ladeUnterlage(getDb(), id);
  if (!u) throw new Abgelehnt("Diese Unterlage gibt es nicht mehr.");
  if (!verwaltetGruppe(rechte, u.gruppeId)) throw new Abgelehnt(NICHT_DEINE);
  return u;
}

export async function unterlageLoeschenAction(id: string): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  let weg: { id: string; typ: "pdf" | "bild" } | null = null;
  const r = await schreibe("verwalter", (z) => ausfuehren(z, ({ rechte }) => {
    const u = eigeneUnterlage(rechte, id);
    unterlageLoeschen(getDb(), u.id);
    weg = { id: u.id, typ: u.typ };
  }));
  // Erst der Eintrag, dann die Datei: bricht es dazwischen, bleibt höchstens eine Datei ohne Verweis liegen. Der Pfad
  // entsteht aus der ID, wie sie in der Datenbank steht, nicht aus der Eingabe.
  const datei = weg as { id: string; typ: "pdf" | "bild" } | null;
  if (r.ok && datei) await entferneUnterlage(datei.id, datei.typ);
  return r;
}

export async function unterlageVerschiebenAction(id: string, richtung: unknown): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success || (richtung !== -1 && richtung !== 1)) return { ok: false, fehler: UNGUELTIG };
  return schreibe("verwalter", (z) => ausfuehren(z, ({ rechte }) => {
    eigeneUnterlage(rechte, id);
    unterlageVerschieben(getDb(), id, richtung);
  }));
}

// ---------------------------------------------------------------- Gerätearten (jeder Verwalter)

export async function artSpeichernAction(id: string | null, eingabe: unknown): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => artSpeichernVorgang(z, id, eingabe));
}

export async function artLoeschenAction(id: string): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => artLoeschenVorgang(z, id));
}

// ---------------------------------------------------------------- Prüfarten (IDA-368), wie Gerätearten für alle Gruppen

export async function pruefartSpeichernAction(id: string | null, eingabe: unknown): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => pruefartSpeichernVorgang(z, id, eingabe));
}

export async function pruefartLoeschenAction(id: string): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => pruefartLoeschenVorgang(z, id));
}

export async function pruefartVerschiebenAction(id: string, richtung: -1 | 1): Promise<Ergebnis> {
  return schreibe("verwalter", (z) => pruefartVerschiebenVorgang(z, id, richtung));
}

// ---------------------------------------------------------------- Gruppen (nur Admins)

export async function gruppeSpeichernAction(id: string | null, eingabe: unknown): Promise<Ergebnis> {
  return schreibe("admin", (z) => gruppeSpeichernVorgang(z, id, eingabe));
}

export async function gruppeLoeschenAction(id: string): Promise<Ergebnis> {
  return schreibe("admin", (z) => gruppeLoeschenVorgang(z, id));
}

// ---------------------------------------------------------------- Verwalter einer Gruppe (nur Admins, IDA-337)

const KEIN_VERZEICHNIS: DirectoryResult = { status: "error", people: [] };
/** `core/directory` wirft nie; die Zeile überlebt einen Austausch gegen einen Client, der es doch tut. */
async function verzeichnis(abruf: () => Promise<DirectoryResult>): Promise<DirectoryResult> {
  try { return await abruf(); } catch { return KEIN_VERZEICHNIS; }
}

export async function verwalterHinzufuegenAction(eingabe: unknown): Promise<Ergebnis> {
  // Erst das Recht, dann das Verzeichnis: dessen Antwort ist ein Ausschnitt der ganzen Organisation.
  return schreibe("admin", (z) => verwalterHinzufuegenVorgang(z, eingabe, () => verzeichnis(() => getDirectory().list())));
}

export async function verwalterEntfernenAction(eingabe: unknown): Promise<Ergebnis> {
  return schreibe("admin", (z) => verwalterEntfernenVorgang(z, eingabe));
}

/** Lesend: höchstens `SUCHE_MAX_TREFFER` Vorschläge ab `SUCHE_MIN_ZEICHEN` Zeichen. */
export async function suchePersonenAction(gruppeId: unknown, begriff: unknown): Promise<PersonVorschlag[]> {
  await requireAktion("admin");
  const id = idSchema.safeParse(gruppeId);
  const q = z.string().max(100).safeParse(begriff);
  if (!id.success || !q.success || q.data.trim().length < SUCHE_MIN_ZEICHEN) return [];
  const v = await verzeichnis(() => getDirectory().search(q.data.trim(), SUCHE_MAX_TREFFER));
  return vorschlaege(getDb(), id.data, q.data, v);
}
