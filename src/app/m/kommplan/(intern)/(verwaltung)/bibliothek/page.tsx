import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { ladeBibliothek } from "@/app/m/kommplan/_lib/bibliothekDb";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { ladeEigeneZeichen } from "@/app/m/kommplan/_lib/eigeneZeichenDb";
import { symboleMitEigenen, zeichenIndexMitEigenen } from "@/app/m/kommplan/_lib/zeichen/symbole";
import { pruefeKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Bibliothek } from "@/app/m/kommplan/_ui/bibliothek/Bibliothek";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

/** Bibliothek (Spec §4.3, §6.1): nur für Bearbeitende; Riegel auch im Layout der Gruppe (Falle 23). */
export default async function BibliothekSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  pruefeKommplanBearbeiten(viewer);
  const db = getDb();
  const bib = ladeBibliothek(db);
  const eigene = ladeEigeneZeichen(db);
  const zeichen = [...new Set([...bib.stellen, ...bib.einheiten].map((e) => e.zeichen).filter((z): z is string => z !== null).concat(eigene.map((z) => z.schluessel)))];
  const { reiter } = await searchParams;
  return (
    <Huelle>
      <Seitenkopf titel="Bibliothek" zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung="Stellen, Einheiten und Verbindungen, die du im Editor in Pläne kopierst — Pläne behalten ihre Kopien. Unter Zeichen baust du eigene taktische Zeichen; sie gelten in allen Plänen, die sie nutzen." />
      <Bibliothek bibliothek={bib} eigeneZeichen={eigene} zeichenIndex={zeichenIndexMitEigenen(db)} symbole={symboleMitEigenen(db, zeichen)}
        schrift={ARIMO.style.fontFamily} reiter={reiter === "zeichen" ? "zeichen" : undefined} />
    </Huelle>
  );
}
