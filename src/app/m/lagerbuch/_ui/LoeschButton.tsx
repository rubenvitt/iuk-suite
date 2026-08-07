"use client";

import { useState, type ReactNode } from "react";
import { Button } from "antd";
import type { Loeschbarkeit } from "../_lib/loeschen";
import { Ikone } from "./ikonen";
import { LoeschDialog } from "./LoeschDialog";

/** Knopf und Dialog in einem Bauteil, damit Aufrufer keinen Offen-State halten. */
export function LoeschButton({
  name,
  typLabel,
  label,
  deaktivierenLabel,
  nurZeichen = false,
  hinweis,
  pruefen,
  onLoeschen,
  onDeaktivieren,
  onFertig,
}: {
  name: string;
  typLabel: string;
  label?: string;
  deaktivierenLabel?: string;
  nurZeichen?: boolean;
  hinweis?: ReactNode;
  pruefen: () => Promise<Loeschbarkeit>;
  onLoeschen: () => Promise<void>;
  onDeaktivieren?: () => Promise<void>;
  onFertig?: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const beschriftung = label ?? `${typLabel} löschen`;

  return (
    <>
      <Button
        danger
        icon={<Ikone name="papierkorb" groesse={16} />}
        aria-label={nurZeichen ? `${typLabel} ${name} löschen` : undefined}
        onClick={() => setOffen(true)}
      >
        {nurZeichen ? null : beschriftung}
      </Button>
      <LoeschDialog
        offen={offen}
        name={name}
        typLabel={typLabel}
        deaktivierenLabel={deaktivierenLabel}
        hinweis={hinweis}
        pruefen={pruefen}
        onLoeschen={onLoeschen}
        onDeaktivieren={onDeaktivieren}
        onSchliessen={() => setOffen(false)}
        onFertig={onFertig}
      />
    </>
  );
}
