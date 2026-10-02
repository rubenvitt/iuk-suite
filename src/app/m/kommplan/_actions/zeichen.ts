"use server";

import { z } from "zod";
import type { Symbolquelle } from "../_lib/zeichen/grundlagen";
import { getDb } from "../_db/client";
import { symboleMitEigenen } from "../_lib/zeichen/symbole";
import { requireKommplanAktion } from "../_lib/zugang";

// Lesend: die SVGs der Suchtreffer und neu gewählter Zeichen (Entscheidung 4), eigene eingeschlossen. Das Rezept-Generat
// bleibt so auf dem Server; eine Client-Insel importiert diese Datei nur als Aufrufverweis. Modulzugang
// genügt: jeder mit Zugang bearbeitet eigene Pläne, und die Zeichen sind kein Geheimnis.
const eingabe = z.array(z.string().min(1).max(80)).max(40);

export async function ladeZeichenAction(schluessel: unknown): Promise<Record<string, Symbolquelle>> {
  await requireKommplanAktion();
  const r = eingabe.safeParse(schluessel);
  return r.success ? symboleMitEigenen(getDb(), r.data) : {};
}
