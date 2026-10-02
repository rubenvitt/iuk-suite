"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDirectory, type DirectoryResult } from "@/core/directory";
import { getDb } from "../_db/client";
import { entferneMitglied, ladeEin, mitgliederVon, SUCHE_MAX_TREFFER, SUCHE_MIN_ZEICHEN, teileInOrganisation, vorschlaege, type Mitglied, type PersonVorschlag, type TeilenErgebnis } from "../_lib/mitglieder";
import { rechteAn } from "../_lib/rechte";
import { bearbeiterAus, personAus, requireKommplanAktion } from "../_lib/zugang";

// Teilen in der Organisation und Einladen (`_lib/mitglieder.ts`): Plan und Recht (verwalten) werden dort gegen die
// Datenbank aufgelöst (IDOR). Die Suche fragt das Personenverzeichnis erst NACH der Rechteprüfung — ihr Ergebnis
// ist ein Ausschnitt der ganzen Organisation, nicht nur des Moduls (Vorbild `aufgaben/actions.ts`, `personenSucheAction`).

const ID = z.string().min(1).max(64);
const LEER: DirectoryResult = { status: "error", people: [] };
/** `core/directory` wirft nie; die Zeile überlebt einen Austausch gegen einen Client, der es doch tut. */
async function ohneAusfall(abruf: () => Promise<DirectoryResult>): Promise<DirectoryResult> {
  try { return await abruf(); } catch { return LEER; }
}

export async function teileInOrganisationAction(planId: unknown): Promise<TeilenErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => teileInOrganisation(getDb(), planId, personAus(viewer)));
}

export async function ladeEinAction(eingabe: unknown): Promise<TeilenErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const verzeichnis = await ohneAusfall(() => getDirectory().list());
    return ladeEin(getDb(), eingabe, bearbeiterAus(viewer), personAus(viewer), Date.now(), verzeichnis);
  });
}

export async function entferneMitgliedAction(eingabe: unknown): Promise<TeilenErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => entferneMitglied(getDb(), eingabe, personAus(viewer)));
}

/** Lesend: die Eingeladenen beim Öffnen von „Teilen" (ein zweiter Tab hat vielleicht eingeladen). */
export async function ladeMitgliederAction(planId: unknown): Promise<Mitglied[] | null> {
  const viewer = await requireKommplanAktion();
  const id = ID.safeParse(planId);
  return id.success && rechteAn(getDb(), id.data, personAus(viewer)).verwalten ? mitgliederVon(getDb(), id.data) : null;
}

/** Lesend: höchstens `SUCHE_MAX_TREFFER` Vorschläge ab `SUCHE_MIN_ZEICHEN` Zeichen, nur für wer den Plan verwaltet. */
export async function suchePersonenAction(planId: unknown, begriff: unknown): Promise<PersonVorschlag[]> {
  const viewer = await requireKommplanAktion();
  const id = ID.safeParse(planId);
  const q = z.string().max(100).safeParse(begriff);
  if (!id.success || !q.success || q.data.trim().length < SUCHE_MIN_ZEICHEN) return [];
  if (!rechteAn(getDb(), id.data, personAus(viewer)).verwalten) return [];
  const verzeichnis = await ohneAusfall(() => getDirectory().search(q.data.trim(), SUCHE_MAX_TREFFER));
  return vorschlaege(getDb(), id.data, q.data, verzeichnis);
}
