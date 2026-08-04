import type { DB } from "./client";
import { tokens, users } from "./schema";

export type Quelle = (quelleTyp: string, quelleId: string) => string;

/**
 * Loest quelleTyp/quelleId aus den append-only-Logs in einen Anzeigenamen auf.
 * 1:1 aus `lagerbuch/src/db/quelle.ts:12-25`.
 *
 * IN DER DB BLEIBT DIE ROHE ID STEHEN (nachweisfest); nur die Anzeige wird
 * aufgeloest:
 *   oidc   → users.name, sonst E-Mail, sonst die ROHE ID
 *   token  → tokens.label (der Code allein sagt niemandem etwas)
 *   system → "System"
 *
 * WARUM DIESE DATEI UNTER _db/ LIEGT, obwohl _db/ keine Fachabfrage haelt: sie ist
 * eine von ZWEI benannten Ausnahmen (neben etiketten.ts), und der Grund ist bei
 * beiden derselbe — sie kennt KEINE SEITE, sondern nur eine Zeilenform, und jeder
 * Lesepfad benutzt sie. Waechst hier etwas heran, das eine Seite kennt, ist es am
 * falschen Ort.
 *
 * EIN AUFRUF LAEDT BEIDE LOOKUP-TABELLEN EINMAL — den Resolver pro Request bauen
 * und ueber alle Zeilen wiederverwenden.
 *
 * BEIDE KENNUNGSRAEUME DUERFEN NEBENEINANDER LEBEN, und genau deshalb gibt es
 * keine Zuordnungstabelle alt_sub → neu_sub (§4.13): die Map enthaelt beide, es
 * gibt keine Kollision, weil beide Werte Primaerschluessel derselben Tabelle sind.
 * Nachgeprueft ist zudem, dass die Kennung nirgends gefiltert, gruppiert oder
 * aggregiert wird — sie erscheint ausschliesslich in Projektionen.
 *
 * ⚠️ `select count(*) from users` ist KEINE Personenzahl. Das gilt vor wie nach
 * der Bereinigung und gehoert in jede Oberflaeche, die die Zahl anzeigen will.
 */
export function quelleAufloeser(db: DB): Quelle {
  const userNamen = new Map(
    db.select().from(users).all()
      .map((u) => [u.id, u.name?.trim() || u.email?.trim() || u.id] as const),
  );
  const tokenLabels = new Map(
    db.select().from(tokens).all().map((t) => [t.code, t.label] as const),
  );
  return (quelleTyp, quelleId) => {
    if (quelleTyp === "system") return "System";
    if (quelleTyp === "token") return tokenLabels.get(quelleId) ?? quelleId;
    return userNamen.get(quelleId) ?? quelleId;
  };
}
