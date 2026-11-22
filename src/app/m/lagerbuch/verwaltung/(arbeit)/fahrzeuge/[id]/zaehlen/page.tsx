import { Button, Result } from "antd";
import type { ReactNode } from "react";
import { getDb } from "../../../../../_db/client";
import { einheitMeta } from "../../../../../_lib/konstanten";
import type { Leser } from "../../../../../_lib/lesepfade/bestand";
import { verwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import { verwaltungDetailPfad } from "../../../../../_lib/verwaltungPfad";
import { SeitenKopf } from "../../../../../_ui/SeitenKopf";
import { VerwaltungsZaehlung } from "./VerwaltungsZaehlung";

export const dynamic = "force-dynamic";

/**
 * DIE ZÄHLSEITE EINER EINHEIT — Einstieg des Verwaltungschecks.
 *
 * ⚠️ KEIN `notFound()` HIER (Falle 23): unbekannte Einheiten fängt
 * `[id]/layout.tsx` oberhalb der Ladegrenze ab. Eine STILLGELEGTE Einheit gibt
 * es, sie wird nur nicht gezählt — der Schreibweg weist sie ab (Riegel 5 des
 * Checks), also zeigt die Seite einen Leerzustand mit Weg zurück statt einer
 * Maske, deren Abschluss immer scheiterte. `Result` und `Button href` sind
 * Server-Component-sicher (Falle 1; `href`, nie `<Link><Button/></Link>`).
 */
export function zaehlenInhalt(db: Leser, id: string): ReactNode {
  const daten = verwaltungscheckDaten(db, id);
  // Zwischen Layout-Prüfung und hier verschwunden: ebenfalls ruhig, ohne 404.
  const blatt = verwaltungDetailPfad("fahrzeuge", id);
  if (!daten || !daten.fahrzeug.aktiv) {
    return (
      <Result
        status="info"
        title="Diese Einheit ist stillgelegt."
        subTitle="Eine stillgelegte Einheit wird nicht gezählt. Setze sie auf dem Blatt wieder aktiv, dann geht es hier weiter."
        extra={<Button href={blatt}>Zurück zur Einheit</Button>}
      />
    );
  }

  return (
    <>
      <SeitenKopf
        titel="Zählen und einrichten"
        beschreibung={(
          <span>
            {daten.fahrzeug.name}
            {einheitMeta(daten.fahrzeug) ? ` · ${einheitMeta(daten.fahrzeug)}` : ""}
          </span>
        )}
        zurueck={{ titel: daten.fahrzeug.name, href: blatt }}
      />
      <VerwaltungsZaehlung daten={daten} />
    </>
  );
}

export default async function ZaehlenSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return zaehlenInhalt(getDb(), id);
}

export const metadata = { title: "Zählen" };
