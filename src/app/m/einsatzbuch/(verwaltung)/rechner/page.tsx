import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../_db/client";
import { requireEinsatzbuchHost } from "../../_lib/host";
import { requireEinsatzbuchZugang } from "../../_lib/zugang";
import { rechnerStatus } from "../../_lib/anbindung/status";
import { EchterRechner } from "../../_ui/rechner/EchterRechner";
import { TestRechnerListe } from "../../_ui/rechner/TestRechnerListe";
import { Freigaben } from "../../_ui/rechner/Freigaben";

export const dynamic = "force-dynamic";

/**
 * Die Verwaltungsseite „Rechner" (Plan Stufe 5, Task 5): der echte Einsatzbuch-Rechner mit
 * Widerruf, die Test-Rechner mit Löschen und die letzten Schlüsselfreigaben. Die Riegel stehen
 * hier noch einmal, weil eine Route Group keine Sicherheitsgrenze ist (wie
 * `stammdaten/page.tsx`). `Card` und `Table` dürfen in einer Server Component stehen (Falle 1);
 * die drei `_ui/rechner`-Bausteine sind eigene Client-Inseln, weil sie Server Actions auslösen.
 */
export default async function RechnerSeite() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  const db = getDb();
  const { echt, test, freigaben } = rechnerStatus(db);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Rechner"
        beschreibung="Der echte Einsatzbuch-Rechner, alle Test-Rechner und die letzten Schlüsselfreigaben."
      />
      <EchterRechner rechner={echt} />
      <TestRechnerListe liste={test} />
      <Freigaben liste={freigaben} />
    </div>
  );
}
