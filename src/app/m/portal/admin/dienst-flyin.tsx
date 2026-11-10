"use client";

import { useRef } from "react";
import { Drawer } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import type { GruppenOption } from "@/app/m/portal/_lib/gruppen";
import { ServiceForm } from "@/app/m/portal/admin/service-form";
import type { ServiceRow } from "@/app/m/portal/admin/service-table";

const FELD = 'input, textarea, select, button, [contenteditable="true"], [role="combobox"]';

/**
 * DIE SCHUBLADE FÜR „DIENST ANLEGEN" UND „DIENST BEARBEITEN" (IDA-391). Breite über `flyinBreite`
 * (Falle 13). Fokus nach Falle 24: kein `autoFocus`, keine Rückgabe beim Schließen; das Namensfeld
 * bekommt ihn erst nach der Animation und nur, wenn er nicht schon in einem Feld der Schublade steht.
 * Nach dem Schließen geht er an `ausloeser`, aber nur, wenn er verloren ist — der Menüeintrag, von
 * dem aus „Bearbeiten" geöffnet wurde, gibt es dann nicht mehr.
 */
export function DienstFlyin({
  offen,
  dienst,
  gruppen,
  kategorien,
  gruppenNichtAbrufbar,
  ausloeser,
  onSchliessen,
}: {
  offen: boolean;
  dienst?: ServiceRow;
  gruppen: GruppenOption[];
  kategorien: string[];
  gruppenNichtAbrufbar?: boolean;
  ausloeser?: React.RefObject<HTMLElement | null>;
  onSchliessen: () => void;
}) {
  const rahmen = useRef<HTMLDivElement>(null);
  return (
    <Drawer
      open={offen}
      onClose={onSchliessen}
      title={dienst ? `„${dienst.name}“ bearbeiten` : "Dienst anlegen"}
      size={flyinBreite(480)}
      destroyOnHidden
      autoFocus={false}
      focusable={{ focusTriggerAfterClose: false }}
      afterOpenChange={(auf) => {
        if (auf) {
          const ziel = rahmen.current?.querySelector<HTMLInputElement>("input[name=name]");
          const aktiv = document.activeElement;
          const dialog = ziel?.closest('[role="dialog"]');
          if (ziel && !(dialog && aktiv instanceof HTMLElement && aktiv !== ziel && dialog.contains(aktiv) && aktiv.matches(FELD))) {
            ziel.focus();
          }
        } else {
          const aktiv = document.activeElement;
          const verloren = aktiv === null || aktiv === document.body || aktiv.closest('[role="dialog"]') !== null;
          if (verloren) ausloeser?.current?.focus();
        }
      }}
    >
      <div ref={rahmen}>
        {offen ? (
          <ServiceForm
            key={dienst?.id ?? "neu"}
            gruppen={gruppen}
            kategorien={kategorien}
            gruppenNichtAbrufbar={gruppenNichtAbrufbar}
            dienst={dienst}
            onFertig={onSchliessen}
            onAbbrechen={onSchliessen}
          />
        ) : null}
      </div>
    </Drawer>
  );
}
