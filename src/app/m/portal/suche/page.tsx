import { Result } from "antd";

import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { MINDESTLAENGE, suchbegriff } from "@/core/suche";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { sucheUeberall } from "@/app/m/portal/_lib/suche";
import { SuchErgebnisse } from "@/app/m/portal/_ui/SuchErgebnisse";
import { SuchFeld } from "@/app/m/portal/_ui/SuchFeld";

export const dynamic = "force-dynamic";

/**
 * DIE SUITEWEITE SUCHE (IDA-301). Server Component: Sitzung lesen, jedes Modul fragen
 * (`_lib/suche.ts`), fertige Treffer zeigen. Die Rechteprüfung steckt in den Modulen; diese Seite
 * zeigt nur, was sie zurückgeben.
 *
 * Der Begriff steht in der Adresse (`?q=`), damit Zurück und Neu laden funktionieren. Gesucht wird nur
 * in Sachdaten (Geräte, Fahrzeuge, Material), nicht in Personaldaten — deshalb ist eine Spur im
 * Browserverlauf hier vertretbar.
 *
 * Nur antd-Bausteine, die in einer Server Component sicher sind (`Result` hier, `Card` und `Tag` in
 * `SuchErgebnisse`; Falle 1).
 */
export default async function SuchSeite({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const roh = (await searchParams).q;
  const eingabe = (Array.isArray(roh) ? roh[0] : roh)?.trim() ?? "";
  const begriff = suchbegriff(roh);
  const ergebnisse = begriff ? sucheUeberall(begriff, await auth()) : [];

  return (
    <>
      <Seitenkopf
        titel="Suche"
        beschreibung="Findet Funkgeräte, Fahrzeuge und Material in allen Modulen, die du öffnen darfst."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xl }}>
        <SuchFeld begriff={eingabe} />
        {eingabe !== "" && !begriff ? (
          <p data-testid="suche-zu-kurz" style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)", margin: 0 }}>
            Gib mindestens {MINDESTLAENGE} Zeichen ein.
          </p>
        ) : null}
        {begriff && ergebnisse.length === 0 ? (
          <Result
            data-testid="suche-ohne-treffer"
            status="info"
            title={`Nichts gefunden für „${begriff}“`}
            subTitle="Gesucht wurde nur in den Modulen, die du öffnen darfst."
          />
        ) : null}
        <SuchErgebnisse ergebnisse={ergebnisse} />
      </div>
    </>
  );
}
