"use client";

import { Button, Dropdown } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Ikone } from "../../../../_ui/ikonen";
import { checklistenZiel } from "../ChecklisteKnopf";

/**
 * DIE NEBENAKTIONEN IM KOPF DES EINHEITENBLATTS (IDA-232).
 *
 * Der Kopf trug fünf gleichrangige Bedienelemente nebeneinander — Drucken,
 * Check, Aufladen, den Aktiv-Schalter und den roten Löschknopf. Jetzt trägt er
 * EINE Hauptaktion (Check), das Aufladen daneben, und was seltener gebraucht
 * wird, hinter diesem Knopf. Stilllegen und Löschen stehen im Reiter
 * „Einstellungen" — eine unumkehrbare Aktion gehört nicht neben die tägliche.
 *
 * ⚠️ DER EINTRAG IST EIN ECHTER ANKER, kein `onClick` mit `router.push`: der
 * Druckbogen liegt in der Routengruppe `(druck)` ohne Verwaltungsrahmen, und ein
 * Dokumentwechsel ist dort ohnehin richtig (Begründung an `ChecklisteKnopf`).
 * Der Pfad kommt von dort, damit er genau einmal geschrieben steht.
 */
export function WeitereAktionen({ fahrzeugId }: { fahrzeugId: string }) {
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          {
            key: "checkliste",
            icon: <Ikone name="drucken" groesse={16} />,
            label: <a href={checklistenZiel(fahrzeugId)}>Checkliste drucken</a>,
          },
        ],
      }}
    >
      {/* KEIN `size` (Falle 4) — 44px wie die Knöpfe daneben. */}
      <Button
        aria-label="Weitere Aktionen"
        icon={<Icons8Ikone name="more" groesse={18} />}
      />
    </Dropdown>
  );
}
