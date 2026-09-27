import { auditActor, auditDenied } from "@/core/audit/server";
import { notFound } from "next/navigation";
import { getDb } from "../../../_db/client";
import { aufgabe } from "../../../_db/queries";
import type { AufgabeRow } from "../../../_db/schema";
import { isoTag } from "../../../_lib/datum";
import { bearbeitung } from "../../../_lib/lebenszyklus";
import { akteurFuerSeite, darfAufgabeSehen, subFuerSitzung } from "../../../_lib/zugang";
import { AufgabeFormular } from "../../../_ui/AufgabeFormular";
import { NichtEingetragenSeite } from "../../../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../../../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * `/a/<id>/bearbeiten` — AUFGABE AENDERN (DRK-487; auf dem Bildschirm „Ändern", damit es nicht wie
 * „Bearbeitung starten" klingt). Dasselbe Formular wie `/neu`, vorbelegt mit
 * der Aufgabe (`AufgabeFormular`s `bestand`).
 *
 * DAS GATE IST `bearbeitung()` (`_lib/lebenszyklus.ts`) — dieselbe Funktion, die den Knopf in der
 * Aktionszone setzt (`aktionsOptionen`) und die `aufgabeBearbeitenAction` fragt. Wer nicht
 * bearbeiten darf oder die Aufgabe nicht sehen darf, bekommt `notFound()`, wie ueberall im Modul.
 * Keine `loading.tsx` darueber, sonst waere das `notFound()` ein HTTP 200 (Falle 23).
 */
export function bearbeitenInhalt(task: AufgabeRow) {
  return (
    <>
      <SeitenKopf
        brotkrume={[
          { label: "Aufgaben", href: "/" },
          { label: task.titel, href: `/a/${task.id}` },
          { label: "Ändern" },
        ]}
        titel="Aufgabe ändern"
        hilfe="aufgabe"
        kontext="Zuweisung und Zustand ändern sich hier nicht. Jede Änderung steht danach im Verlauf."
      />
      <AufgabeFormular darfFuerAndere={false} bestand={task} />
    </>
  );
}

export default async function AufgabeBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;

  const { id } = await params;
  const task = aufgabe(db, id);
  if (!task) notFound();
  if (!darfAufgabeSehen(akteur, task)) {
    auditDenied("aufgaben", auditActor(akteur.person));
    notFound();
  }
  // ZWEI ZWEIGE, WEIL SIE ZWEI VERSCHIEDENE AUSKUENFTE SIND (`core/audit/page-coverage-manifest.json`):
  // die falsche Person ist eine Abweisung mit Protokollzeile, der falsche Zustand ist keine.
  const darf = bearbeitung(task, akteur, isoTag(new Date()));
  if (!darf.erlaubt && darf.accessDenied) {
    auditDenied("aufgaben", auditActor(akteur.person));
    notFound();
  }
  if (!darf.erlaubt) notFound();
  return bearbeitenInhalt(task);
}
