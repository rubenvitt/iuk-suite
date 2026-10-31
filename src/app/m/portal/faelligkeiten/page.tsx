import { Card } from "antd";
import { notFound } from "next/navigation";

import { auditActor, auditDenied } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { canAdminModule } from "@/core/auth/guards";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { faelligkeitenAbo, sendeZiel } from "@/app/m/portal/_lib/faelligkeiten/konfiguration";
import { SENDE_STUNDE } from "@/app/m/portal/_lib/faelligkeiten/takt";
import { FAELLIG_ANZEIGENAME } from "@/app/m/portal/_lib/ntfy";
import { sammle, sichtbareQuellen } from "@/app/m/portal/_lib/faelligkeiten/sammeln";
import { FaelligkeitenJetztSenden } from "@/app/m/portal/_ui/FaelligkeitenJetztSenden";
import { FaelligkeitenListe } from "@/app/m/portal/_ui/FaelligkeitenListe";
import { NtfyAnleitung } from "@/app/m/portal/_ui/ServerwartungAnleitung";

export const dynamic = "force-dynamic";

/**
 * „WAS STEHT AN" (IDA-297) — die Fristen aller Module an einer Stelle, je Person auf die Module
 * beschränkt, die sie verwaltet (`sichtbareQuellen`, dasselbe Prädikat wie der Riegel des Moduls).
 *
 * 404 statt 403 für alle ohne ein solches Modul, mit Audit-Zeile — dieselbe Bauform wie
 * `serverwartung/page.tsx`. Das Portal hat keine `loading.tsx`, der 404 ist also echt (Falle 23).
 *
 * Darunter, wenn eingerichtet, das Abo für den wöchentlichen Push und für den Suite-Betrieb „Jetzt
 * senden". Das Thema erreicht den Browser nur als Prop der Insel und nur nach der Prüfung.
 */
export default async function FaelligkeitenPage() {
  const session = await auth();
  const quellen = sichtbareQuellen(session?.user?.groups);
  if (quellen.length === 0) {
    auditDenied("portal", auditActor(session?.user));
    notFound();
  }

  const gruppen = sammle(quellen, new Date());
  const abo = faelligkeitenAbo();
  const darfSenden = abo !== null && sendeZiel() !== null && (await canAdminModule("portal"));

  return (
    <>
      <Seitenkopf
        titel="Was steht an"
        beschreibung="Fristen aus den Apps, die du verwaltest. Ein Tipp auf eine Zeile führt dorthin, wo du sie erledigst."
        zurueck={{ titel: "Apps & Dienste", href: "/" }}
      />
      <FaelligkeitenListe gruppen={gruppen} />
      {abo && (
        <section style={{ marginBlockStart: SPACE.xl, display: "flex", flexDirection: "column", gap: SPACE.lg }}>
          <h2 style={{ ...SCHRIFT.titel, margin: 0 }}>Aufs Telefon</h2>
          <p style={{ ...SCHRIFT.text, margin: 0, maxInlineSize: 720 }}>
            Jeden Montag um {SENDE_STUNDE} Uhr kommt eine kurze Zusammenfassung als Mitteilung, wenn etwas fällig ist.
            Namen von Personen stehen darin nicht.
          </p>
          {darfSenden && (
            <Card title="Probe" style={{ maxInlineSize: 720 }}>
              <p style={{ ...SCHRIFT.text, marginBlock: `0 ${SPACE.md}px` }}>
                Schickt die Zusammenfassung sofort an alle, die das Thema abonniert haben. Der Montag bleibt davon unberührt.
              </p>
              <FaelligkeitenJetztSenden />
            </Card>
          )}
          <NtfyAnleitung
            abo={abo}
            anzeigename={FAELLIG_ANZEIGENAME}
            praefix="faellig"
            hinweis={{
              fett: "Gib das Thema nicht weiter.",
              text: "Senden kann nur die Suite, mitlesen aber jeder, der das Thema kennt. Wer die Mitteilungen auch braucht, bekommt die Berechtigung für das Lagerbuch oder die Funkgeräte und findet dann diese Seite im Portal.",
            }}
          />
        </section>
      )}
    </>
  );
}
