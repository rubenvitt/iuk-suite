"use server";

import { z } from "zod";
import type { Symbolquelle } from "../_lib/zeichen/grundlagen";
import { symboleFuerSchluessel } from "../_lib/zeichen/zeichen";
import { requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Lesend: die SVGs der Suchtreffer und neu gewählter Zeichen (Entscheidung 4). Das Rezept-Generat
// bleibt so auf dem Server; eine Client-Insel importiert diese Datei nur als Aufrufverweis.
const eingabe = z.array(z.string().min(1).max(80)).max(40);

export async function ladeZeichenAction(schluessel: unknown): Promise<Record<string, Symbolquelle>> {
  await requireKommplanBearbeitenAktion();
  const r = eingabe.safeParse(schluessel);
  return r.success ? symboleFuerSchluessel(r.data) : {};
}
