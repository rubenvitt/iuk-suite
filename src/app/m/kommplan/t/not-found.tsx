import { TokenUngueltig } from "@/app/m/kommplan/_ui/token/TokenUngueltig";

/**
 * Not-Found-Grenze des Segments `t` — sie fängt das `notFound()` aus `t/[token]/layout.tsx` und jeder Seite darunter
 * (Entscheidung 4). Ohne sie fiele die Antwort auf die Suite-404 (`src/app/not-found.tsx`) mit Weg zur Anmeldung.
 */
export default function TokenNichtGefunden() {
  return <TokenUngueltig />;
}
