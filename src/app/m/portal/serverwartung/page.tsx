import { notFound } from "next/navigation";

import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { darfWartungSehen, wartungsAbo } from "@/app/m/portal/_lib/serverwartung";
import { ServerwartungAnleitung } from "@/app/m/portal/_ui/ServerwartungAnleitung";

/**
 * WIE MAN AN DIE WARTUNGSNACHRICHTEN KOMMT — nur für den Suite-Betrieb und die
 * Gruppen aus `SUITE_WARTUNG_GROUPS` (`_lib/serverwartung.ts`).
 *
 * 404 statt 403 für alle anderen, und auch solange das Abo nicht eingerichtet
 * ist: ein 403 verriete, dass es hier etwas gibt (dieselbe Begründung wie in
 * `core/auth/guards.ts`). Das Portal hat keine `loading.tsx`, das `notFound()`
 * hier ist also ein echter 404 (Falle 23 trifft nicht).
 *
 * Das Thema erreicht den Browser ausschließlich als Prop der Insel und nur
 * nach dieser Prüfung — nie über das Bundle (kein `NEXT_PUBLIC_*`).
 */
export default async function ServerwartungPage() {
  const session = await auth();
  const abo = wartungsAbo();
  if (!abo || !darfWartungSehen(session?.user?.groups)) notFound();

  return (
    <>
      <Seitenkopf
        titel="Serverwartung"
        beschreibung="Wenn am Server gearbeitet wird oder etwas ausfällt, kommt eine Nachricht aufs Telefon. So bekommst du sie."
        zurueck={{ titel: "Apps & Dienste", href: "/" }}
      />
      <ServerwartungAnleitung abo={abo} />
    </>
  );
}
