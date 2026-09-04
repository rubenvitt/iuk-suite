import { Suspense } from "react";
import { KatalogInsel } from "../../_ui/KatalogInsel";
import { AbgemeldetStreifen } from "../../_ui/AbgemeldetStreifen";
import { MerklisteGeraet } from "../../_ui/MerklisteGeraet";
import { KATALOG_STAND } from "../../_lib/katalog";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DIE EINZIGE GECACHTE NAVIGATIONSROUTE (Spec §7.3). Sie verdoppelt die
 * Katalogflaeche NICHT — dieselbe `<KatalogInsel />`, nur ohne Shell und mit
 * gesetztem `offline`.
 *
 * ⛔ KEIN `auth()`, KEIN `cookies()`, KEIN Datenbankzugriff. Alles davon
 * traegt am Ende eine Person ins HTML, und der Inhaltsriegel des Workers lehnt
 * das ab — die PWA cachte dann gar nichts mehr.
 */
export default function OfflineSeite() {
  // Aus `YYYY-MM-DD` ohne `new Date`: ein Datumsobjekt braechte an dieser
  // Stelle nur die Zeitzonenfrage zurueck, und die Zeichenkette traegt die
  // Antwort schon (dieselbe Linie wie `neuigkeiten/register.ts`).
  const [jahr, monat, tag] = KATALOG_STAND.erzeugtAm.split("-");

  return (
    <div
      data-testid="zeichen-offline"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
    >
      <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>Zeichen ohne Verbindung</h1>

      {/* DER ERSTE SATZ, nicht eine Fussnote (Spec §7.4): ein Knopf, der
          offline in einen Fehler laeuft, kostet an der Einsatzstelle genau die
          Zeit, um die es geht. */}
      <p style={{ ...SCHRIFT.text, margin: 0 }}>
        Offline kannst du alle Zeichen nachschlagen, durchsuchen und deine Merkliste ansehen.
        Ändern, Bauen und Üben brauchen eine Verbindung.
      </p>

      {/* OHNE DIESE ZEILE kann niemand beurteilen, ob das, was er offline
          sieht, aktuell ist — und der Cache kann beliebig alt sein. */}
      <p style={{ ...SCHRIFT.neben, margin: 0 }} data-testid="zeichen-offline-stand">
        {KATALOG_STAND.anzahl} Zeichen, Stand {tag}.{monat}.{jahr}.
      </p>

      <AbgemeldetStreifen />
      <MerklisteGeraet />
      {/* SUSPENSE UM DIE INSEL, WEIL SIE `useSearchParams()` RUFT.
          ⬜ GEMESSEN am 2026-09-03: `pnpm build` listet diese Route heute als
          „ƒ (Dynamic) server-rendered on demand", NICHT als statisch vorgerendert —
          die Grenze ist damit heute nicht build-erzwingend. Sie bleibt trotzdem
          stehen, als Vorsorge: kippt die Route je ins statische Vorrendern (eine
          Aenderung an der Wurzel genuegt), bricht der Build ohne sie mit
          „useSearchParams() should be wrapped in a suspense boundary" — oder,
          schlimmer, die Offline-Route kippt ganz in CSR. Sie kostet nichts. */}
      <Suspense>
        <KatalogInsel offline />
      </Suspense>
    </div>
  );
}
