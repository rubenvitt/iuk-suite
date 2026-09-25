/**
 * Reine Ablauflogik der Erfassung — keine React-Abhängigkeit, kein `invoke`. Die Oberfläche
 * fragt `status` per Polling ab (alle paar Sekunden, oder sofort per `frist_pruefen`, sobald die
 * lokale Frist-Uhr auf 0 steht) und leitet daraus mit `phaseAus` die anzuzeigende Phase ab; Rust
 * entscheidet mit seiner eigenen Uhr, welcher Zustand tatsächlich gilt.
 */
import type { Status } from "../typen";

export type Phase = "einrichtung" | "anmelden" | "startfehler" | "start" | "form" | "frist" | "versiegelt" | "verwaltung";

export interface Lokal {
  phase: Phase;
  bearbeiten: boolean;
}

/**
 * Leitet die anzuzeigende Phase aus dem Server-`Status` und dem lokalen Zustand ab, in dieser
 * Reihenfolge:
 * 1. `status.startfehler` gesetzt → "startfehler", vor allem anderen: Ohne offene Datenbank
 *    sagt kein anderes Feld des Status noch etwas Verlässliches.
 * 2. nicht eingerichtet → "einrichtung".
 * 3. `status.versiegelung` gesetzt → "versiegelt". Das bleibt so, bis die Oberfläche eine
 *    gezeigte Versiegelung per `befehle.versiegelungQuittieren()` quittiert hat — und zwar bei
 *    „Neuen Einsatz erfassen“, gleich ob die Versiegelung von „Jetzt versiegeln“ stammt oder von
 *    der Frist-Uhr. Ohne das Quittieren melden `status` und `frist_pruefen` dieselbe Versiegelung
 *    beim nächsten Aufruf erneut, und diese Funktion kennt kein „schon gesehen“: Sie zeigt
 *    "versiegelt", solange das Feld gesetzt ist, unabhängig vom lokalen Zustand (siehe Test
 *    „bleibt versiegelt, bis der Status quittiert ist“).
 * 4. `status.ausstehend` gesetzt und lokal schon `form` mit `bearbeiten: true` → so lassen: Die
 *    Person ändert gerade die Angaben eines abgesendeten, noch nicht versiegelten Einsatzes.
 * 5. `status.ausstehend` gesetzt (sonst) → "frist".
 * 6. lokal `form` → "form".
 * 7. lokal `anmelden` oder `verwaltung` → so lassen. Beide sind, wie „form“, ein rein lokaler
 *    Ausflug der Verwaltung (Kopf-Knopf „Verwaltung · Anmelden“ bzw. der Name in der Sitzung), den
 *    kein Feld des Status auslöst; ein zwischendurch neu geladener Status (etwa nach `laden()`)
 *    soll ihn nicht verlassen.
 * 8. sonst → "start".
 *
 * Beim allerersten Status nach dem Start mit `ausstehend` UND `entwurf` gesetzt entscheidet die
 * Oberfläche selbst für `{ phase: "form", bearbeiten: true }` als lokalen Ausgangspunkt, bevor sie
 * `phaseAus` das erste Mal aufruft — das ist kein Fall dieser Funktion, weil es keinen lokalen
 * Vorzustand gibt, aus dem sie ihn ableiten könnte.
 */
export function phaseAus(status: Status, lokal: Lokal): Lokal {
  if (status.startfehler) return { phase: "startfehler", bearbeiten: false };
  if (!status.eingerichtet) return { phase: "einrichtung", bearbeiten: false };
  if (status.versiegelung) return { phase: "versiegelt", bearbeiten: false };
  if (status.ausstehend) {
    if (lokal.phase === "form" && lokal.bearbeiten) return lokal;
    return { phase: "frist", bearbeiten: false };
  }
  if (lokal.phase === "form") return { phase: "form", bearbeiten: lokal.bearbeiten };
  if (lokal.phase === "anmelden" || lokal.phase === "verwaltung") return { phase: lokal.phase, bearbeiten: false };
  return { phase: "start", bearbeiten: false };
}

/** Restzeit bis zur Frist in ganzen Sekunden, aufgerundet und nie negativ (Vorlage: `rest`). */
export function restSekunden(fristBisMs: number, jetztMs: number): number {
  return Math.max(0, Math.ceil((fristBisMs - jetztMs) / 1000));
}

/** „845“ → „14:05“ (Vorlage: `restText`). */
export function restText(sek: number): string {
  return `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, "0")}`;
}
