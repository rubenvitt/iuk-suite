import { eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { getDb } from "../_db/client";
import { merkliste } from "../_db/schema";
import { findeZeichen } from "../_lib/katalog";
import { MerklisteSpiegelInsel } from "./MerklisteSpiegelInsel";

/**
 * Schreibt die Merkliste bei JEDEM Online-Aufruf einer Shell-Seite auf das
 * Geraet (Spec §7.5). Rendert nichts.
 *
 * ⛔ SIE STEHT IM `(shell)`-LAYOUT UND NICHT AUF `/offline`: dort gibt es weder
 * Sitzung noch Datenbank, und ein `auth()`-Aufruf traege den Klarnamen ins
 * HTML — genau das, was der Inhaltsriegel des Workers ablehnt.
 *
 * Kosten: EIN indizierter SELECT je Shell-Seitenaufruf (Primaerschluessel
 * `(sub, zeichenId)`). Der Spiegel an eine einzelne Seite zu haengen waere
 * billiger und falsch: wer nur den Katalog benutzt und nie /merkliste oeffnet,
 * faehrt sonst mit einer veralteten Geraeteliste in den Einsatz.
 *
 * ANZEIGEQUELLE IST IMMER DAS GENERAT, der Schnappschuss ist der Rueckfall
 * (Spec §4.2) — sonst laufen zwei Fassungen desselben Titels bei jeder
 * Katalogkorrektur auseinander, und niemand weiss, welche stimmt.
 */
export async function MerklisteSpiegel() {
  const session = await auth();
  const sub = session?.user?.id;
  if (!sub) return null;

  const zeilen = getDb().select().from(merkliste).where(eq(merkliste.sub, sub)).all();
  const eintraege = zeilen.map((z) => ({
    id: z.zeichenId,
    titel: findeZeichen(z.zeichenId)?.titel ?? z.titelSchnappschuss,
  }));

  return <MerklisteSpiegelInsel eintraege={eintraege} />;
}
