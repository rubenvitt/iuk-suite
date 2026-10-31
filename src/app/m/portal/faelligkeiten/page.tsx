import { notFound } from "next/navigation";

import { auditActor, auditDenied } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { aboVon, vermerkeGruppen } from "@/app/m/portal/_lib/faelligkeiten/abos";
import { auswahlOptionen } from "@/app/m/portal/_lib/faelligkeiten/auswahl";
import { aboFuer, versand } from "@/app/m/portal/_lib/faelligkeiten/konfiguration";
import { SENDE_STUNDE } from "@/app/m/portal/_lib/faelligkeiten/takt";
import { FAELLIG_ANZEIGENAME } from "@/app/m/portal/_lib/ntfy";
import { sammle, sichtbareQuellen } from "@/app/m/portal/_lib/faelligkeiten/sammeln";
import {
  FaelligkeitenAboVerwalten, FaelligkeitenAuswahl, FaelligkeitenEinrichten, FaelligkeitenProbe,
} from "@/app/m/portal/_ui/FaelligkeitenAbo";
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
 * Darunter, wenn der Versand eingerichtet ist, das EIGENE Abo der Person: ein eigenes Thema, die Auswahl
 * der Arten, eine Probe. Das Thema erreicht den Browser nur als Prop und nur nach der Prüfung; die
 * Person ist die aus der Sitzung (`session.user.id`), nie eine aus der URL.
 */
export default async function FaelligkeitenPage() {
  const session = await auth();
  const quellen = sichtbareQuellen(session?.user?.groups);
  if (quellen.length === 0) {
    auditDenied("portal", auditActor(session?.user));
    notFound();
  }

  const gruppen = sammle(quellen, new Date());
  const v = versand();
  const personId = session?.user?.id;
  const abo = v && personId ? aboVon(personId) : null;
  // Der Stand für den Fall ohne Verzeichnis (lokal); mit Pocket ID fragt der Takt dort (`personenGruppen.ts`).
  if (abo) vermerkeGruppen(abo, session?.user?.groups ?? []);
  const ntfyAbo = v && abo ? aboFuer(v, abo.thema) : null;

  return (
    <>
      <Seitenkopf
        titel="Was steht an"
        beschreibung="Fristen aus den Apps, die du verwaltest. Ein Tipp auf eine Zeile führt dorthin, wo du sie erledigst."
        zurueck={{ titel: "Apps & Dienste", href: "/" }}
      />
      <FaelligkeitenListe gruppen={gruppen} />
      {v && personId && (
        <section style={{ marginBlockStart: SPACE.xl, display: "flex", flexDirection: "column", gap: SPACE.lg }}>
          <h2 style={{ ...SCHRIFT.titel, margin: 0 }}>Aufs Telefon</h2>
          <p style={{ ...SCHRIFT.text, margin: 0, maxInlineSize: 720 }}>
            Jeden Montag um {SENDE_STUNDE} Uhr kommt eine kurze Zusammenfassung als Mitteilung, wenn etwas fällig ist,
            das du ausgewählt hast. Namen von Personen stehen darin nicht.
          </p>
          {!abo && <FaelligkeitenEinrichten />}
          {abo && (
            <>
              <FaelligkeitenAuswahl push={abo.push} abgewaehlt={abo.abgewaehlt} module={auswahlOptionen(quellen)} />
              {ntfyAbo && (
                <NtfyAnleitung
                  abo={ntfyAbo}
                  anzeigename={FAELLIG_ANZEIGENAME}
                  praefix="faellig"
                  hinweis={{
                    fett: "Gib das Thema nicht weiter.",
                    text: "Es gehört nur dir. Senden kann nur die Suite, mitlesen aber jeder, der das Thema kennt. Kennt es jemand anderes, leg unten ein neues an.",
                  }}
                />
              )}
              <FaelligkeitenProbe />
              <FaelligkeitenAboVerwalten />
            </>
          )}
        </section>
      )}
    </>
  );
}
