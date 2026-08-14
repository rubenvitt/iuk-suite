import { isoTag } from "../_lib/datum";
import { darfEinstellenFuerAndere, personFuerSeite, subFuerSitzung } from "../_lib/zugang";
import { getDb } from "../_db/client";
import type { PersonRow } from "../_db/schema";
import { AufgabeFormular } from "../_ui/AufgabeFormular";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * `/neu` — AUFGABE EINSTELLEN (Spec §8, §8.3, Aufgabe 15). Fuer JEDE Rolle erreichbar (Spec §8s
 * Tabelle: „auftrag, koordination; BuFDis fuer sich selbst") — ANDERS ALS `/routinen`/`/verteilen`/
 * `/personen`/`/freigaben` traegt diese Route DESHALB KEIN rollengebundenes `notFound()`-Gate: jede
 * aktive Person mit einer `personen`-Zeile darf zumindest fuer sich selbst einstellen
 * (`anfangsZustand()`, `_lib/lebenszyklus.ts`), und genau DAS entscheidet, nicht ein zweites,
 * hier nachgebautes Praedikat.
 *
 * `darfEinstellenFuerAndere(person, heute)` ENTSCHEIDET NUR, OB DAS FORMULAR DIE ZUSAETZLICHE WAHL
 * „fuer mich selbst" ANBIETET — nicht, ob die Seite ueberhaupt erreichbar ist. Eine inaktive Person
 * sieht das Formular ebenfalls (kein Gate hier verdoppelt `istAktiv`); ihr Versuch, es abzusenden,
 * scheitert an `anfangsZustand()`s eigener `istAktiv`-Pruefung in `aufgabeEinstellenAction` — mit
 * einem Wurf, nicht mit einer stillen Seite, die gar nicht erst erschienen waere. Diese
 * Entscheidung ist bewusst und im Bericht benannt, keine Luecke: sie vermeidet eine ZWEITE Fassung
 * derselben `istAktiv`-Frage an einer Stelle, die die Aktion ohnehin schon durchsetzt.
 *
 * `neuInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`/`personenInhalt`)
 * — `page.test.tsx` ruft sie direkt, ohne eine Sitzung zu stellen.
 */
export function neuInhalt(person: PersonRow, heute: string) {
  const darfFuerAndere = darfEinstellenFuerAndere(person, heute);
  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: "Aufgabe einstellen" }]}
        titel="Aufgabe einstellen"
        kontext="Titel, Erklärung, Priorität, Frist und Dauerschätzung sind Pflichtfelder."
      />
      <AufgabeFormular darfFuerAndere={darfFuerAndere} />
    </>
  );
}

export default async function NeuPage() {
  const db = getDb();
  // `personFuerSeite` statt `personFuerSession`: Modulzugang ohne `personen`-Zeile ist die eigene
  // Erklaerseite, nicht `notFound()` (Spec-Nachtrag 2026-08-14, `_lib/zugang.ts`).
  const person = await personFuerSeite(db);
  if (!person) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const heute = isoTag(new Date());
  return neuInhalt(person, heute);
}
