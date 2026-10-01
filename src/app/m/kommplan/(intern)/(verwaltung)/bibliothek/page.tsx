import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { ladeBibliothek } from "@/app/m/kommplan/_lib/bibliothekDb";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { symboleFuerSchluessel, zeichenIndex } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { pruefeKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Bibliothek } from "@/app/m/kommplan/_ui/bibliothek/Bibliothek";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";

export const dynamic = "force-dynamic";

/** Bibliothek (Spec §4.3, §6.1): nur für Bearbeitende; Riegel auch im Layout der Gruppe (Falle 23). */
export default async function BibliothekSeite() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  pruefeKommplanBearbeiten(viewer);
  const bib = ladeBibliothek(getDb());
  const zeichen = [...new Set([...bib.stellen, ...bib.einheiten].map((e) => e.zeichen).filter((z): z is string => z !== null))];
  return (
    <Huelle>
      <Seitenkopf titel="Bibliothek" zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung="Stellen, Einheiten und Verbindungen, die du im Editor in Pläne kopierst. Pläne behalten ihre Kopien, wenn du hier etwas änderst oder löschst." />
      <Bibliothek bibliothek={bib} zeichenIndex={zeichenIndex()} symbole={symboleFuerSchluessel(zeichen)} />
    </Huelle>
  );
}
