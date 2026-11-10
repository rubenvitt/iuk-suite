"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer } from "antd";
import type { PersonRow } from "../_db/schema";
import { flyinBreite } from "@/core/theme/flyin";
import { PersonenFormular } from "./PersonenFormular";

/*
 * „PERSON ANLEGEN" ALS KNOPF MIT SCHUBLADE (IDA-386). Bis dahin stand das Anlegeformular als
 * erster Schirm ueber der Liste — die Liste begann am Telefon erst nach mehr als einer
 * Bildschirmhoehe, obwohl Nachsehen der haeufigere Gang ist als Anlegen.
 *
 * DIE SCHUBLADE TRAEGT AUCH DAS AENDERN: `?bearbeiten=<id>` (der Knopf „Ändern" der Tabelle) oeffnet
 * sie mit der Person, Schliessen fuehrt zurueck auf `/personen`. Die Adresse bleibt damit die Quelle
 * des Bearbeitungsziels, wie vorher; die Person kommt serverseitig aus der Datenbank
 * (`personen/page.tsx`), nie aus dem Parameter selbst.
 *
 * FALLE 24 (`CLAUDE.md`): `autoFocus={false}` und keine Fokusrueckgabe beim Schliessen — der Fokus
 * wird nur gesetzt, wenn er frei bzw. verloren ist (`fokusFrei`), sonst landete Getipptes still
 * woanders. Vorbild `kommplan/_ui/fokus.ts`, hier auf die zwei Faelle des Moduls verkuerzt.
 */

/** Steht der Fokus nirgends (`body`) oder in einer Schublade ohne Eingabefeld (ihr Container)? */
function fokusFrei(): boolean {
  const aktiv = document.activeElement;
  if (aktiv === null || aktiv === document.body) return true;
  const rahmen = aktiv.closest('[role="dialog"]');
  return rahmen !== null && !aktiv.matches("input, textarea, select, button, [role='combobox']");
}

export function PersonenSchublade({
  bearbeiten,
  verzeichnisAktiv,
}: {
  bearbeiten: PersonRow | null;
  verzeichnisAktiv: boolean;
}) {
  const router = useRouter();
  const [neu, setNeu] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const offen = neu || bearbeiten !== null;
  const person = neu ? null : bearbeiten;

  const schliessen = useCallback(() => {
    setNeu(false);
    if (bearbeiten !== null) router.replace("/personen");
  }, [bearbeiten, router]);

  const anlegen = (): void => {
    if (bearbeiten !== null) router.replace("/personen");
    setNeu(true);
  };

  return (
    <>
      <Button ref={knopf} type="primary" onClick={anlegen}>
        Person anlegen
      </Button>
      <Drawer
        open={offen}
        onClose={schliessen}
        size={flyinBreite(520)}
        title={person ? `Person „${person.name}“ ändern` : "Person anlegen"}
        destroyOnHidden
        autoFocus={false}
        focusable={{ focusTriggerAfterClose: false }}
        afterOpenChange={(auf) => {
          if (!fokusFrei()) return;
          if (auf) document.getElementById(person ? "pf-name" : "pf-sub")?.focus();
          else knopf.current?.focus();
        }}
      >
        {offen ? (
          <PersonenFormular
            key={person?.id ?? "neu"}
            person={person ?? undefined}
            verzeichnisAktiv={verzeichnisAktiv}
            beiErfolg={schliessen}
          />
        ) : null}
      </Drawer>
    </>
  );
}
