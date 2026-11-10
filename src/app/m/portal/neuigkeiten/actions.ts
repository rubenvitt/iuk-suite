"use server";

import { auth } from "@/core/auth";
import {
  appsAus, gesehenNach, neuigkeitenFuer, seiteAus, seiteBis, type NeuigkeitenSeite,
} from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import { ALLE_APPS } from "@/app/m/portal/_lib/neuigkeiten/neu";
import { merkeNeuigkeitenGesehen } from "@/app/m/portal/_lib/vorlieben";

/*
 * NACHLADEN UND GESEHEN-MERKEN AUF „NEUIGKEITEN" (IDA-391). Beide Aktionen lösen die Auswahl aus der
 * Sitzung neu auf (`neuigkeitenFuer`) — was ein Aufruf mitbringt, ist nur Filter und Position, nie
 * eine Liste oder eine Person.
 *
 * Kein Audit-Kontext: Lesen öffentlicher Notizen und eine Bedienvorliebe der eigenen Person, kein
 * fachlicher Datensatz (`coverage-manifest.json`).
 */

async function auswahl() {
  const session = await auth();
  return { session, alle: neuigkeitenFuer(session?.user?.groups ?? null) };
}

/**
 * Die Seite ab `ab` im Filter `modul` — oder, mit `bisSlug`, alles bis zu dieser Notiz (Sprungmarke).
 * `null` bei unbrauchbaren Argumenten.
 */
export async function ladeNeuigkeitenAction(
  modul: unknown,
  ab: unknown,
  bisSlug?: unknown,
): Promise<NeuigkeitenSeite | null> {
  const { alle } = await auswahl();
  if (typeof bisSlug === "string") return seiteBis(alle, bisSlug);
  if (typeof modul !== "string" || typeof ab !== "number" || !Number.isInteger(ab) || ab < 0) return null;
  if (modul !== ALLE_APPS && !appsAus(alle).some((a) => a.key === modul)) return null;
  return seiteAus(alle, modul, ab);
}

/**
 * Merkt, bis wohin die Person die Neuigkeiten gesehen hat. Aufgerufen aus einem Effekt NACH dem
 * Anzeigen, nie im Render der Seite: ein Seiteneffekt im RSC liefe auch bei Prefetch und Vorschau.
 */
export async function merkeNeuigkeitenGesehenAction(): Promise<void> {
  const { session, alle } = await auswahl();
  const personId = session?.user?.id;
  const stand = gesehenNach(alle);
  if (!personId || !stand) return;
  merkeNeuigkeitenGesehen(personId, stand);
}
