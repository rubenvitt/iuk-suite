"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Space, Switch } from "antd";
import { useRouter } from "next/navigation";
import { SPACE } from "@/core/theme/tokens";
import { setFahrzeugAktiv } from "../../../../_actions/fahrzeuge";
import {
  deaktiviereElement,
  loescheElement,
  pruefeLoeschbar,
} from "../../../../_actions/loeschen";
import { einheitNomen, type Einheitenart } from "../../../../_lib/konstanten";
import { LoeschButton } from "../../../../_ui/LoeschButton";

/**
 * ⚠️ DIE TEXTE HAENGEN AN DER ART (DRK-309, Reviewrunde 3).
 *
 * Hier steht der LOESCHKNOPF, und seine Rueckfrage ist die folgenreichste
 * Beschriftung des Blattes: „Fahrzeug löschen" über einer Einheit, deren
 * Kopfzeile einen Chip „Tasche" trägt, widerspricht sich in derselben Ansicht
 * — und zwar an der Stelle, an der jemand gerade etwas Unumkehrbares
 * bestätigen soll. Ein Widerspruch dort kostet entweder das Vertrauen in die
 * Angabe oder die falsche Einheit.
 *
 * ⚠️ `loescheElement("fahrzeug", …)` BLEIBT: das ist der Diskriminator des
 * Löschpfads über ALLE Modulobjekte (Artikel, Gerät, Fahrzeug …), kein
 * Anzeigetext. Eine Tasche ist dort dasselbe Objekt wie ein Fahrzeug.
 */
const STATUS_FEHLER = "Der Status konnte nicht geändert werden.";
const PRUEF_FEHLER = "Löschbarkeit konnte nicht geprüft werden.";

export function FahrzeugAktivToggle({
  id,
  name,
  aktiv,
  einheitenart,
}: {
  id: string;
  name: string;
  aktiv: boolean;
  einheitenart: Einheitenart | null;
}) {
  // ⚠️ `einheitNomen` UND NICHT `einheitenartLabel`: hier steht das Wort an
  // einem Bedienelement, und „nicht zugeordnet löschen" ist kein Deutsch.
  const art = einheitNomen(einheitenart);
  const loeschFehler = `${art} konnte nicht gelöscht werden.`;
  const deaktivierFehler = `${art} konnte nicht deaktiviert werden.`;
  const router = useRouter();
  const [istAktiv, setIstAktiv] = useState(aktiv);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  const statusLaeuft = useRef(false);

  function aktivAendern(naechsterWert: boolean): void {
    if (statusLaeuft.current) return;
    statusLaeuft.current = true;
    startTransition(async () => {
      try {
        const ergebnis = await setFahrzeugAktiv({ id, aktiv: naechsterWert });
        if (!ergebnis.ok) {
          setFehler(STATUS_FEHLER);
          return;
        }
        setIstAktiv(naechsterWert);
        setFehler(null);
      } catch {
        setFehler(STATUS_FEHLER);
      } finally {
        statusLaeuft.current = false;
      }
    });
  }

  async function loeschen(): Promise<void> {
    try {
      const ergebnis = await loescheElement("fahrzeug", id);
      if (!ergebnis.ok) throw new Error(loeschFehler);
    } catch {
      throw new Error(loeschFehler);
    }
    router.push("/verwaltung/fahrzeuge");
  }

  async function deaktivieren(): Promise<void> {
    try {
      const ergebnis = await deaktiviereElement("fahrzeug", id);
      if (!ergebnis.ok) throw new Error(deaktivierFehler);
    } catch {
      throw new Error(deaktivierFehler);
    }
    router.push("/verwaltung/fahrzeuge");
  }

  return (
    <div style={{ display: "grid", gap: SPACE.sm }}>
      <Space wrap>
        <Switch
          checked={istAktiv}
          loading={laeuft}
          aria-label={`${art} aktiv`}
          onChange={aktivAendern}
        />
        <span>{istAktiv ? "Aktiv" : "Inaktiv"}</span>
        <LoeschButton
          name={name}
          typLabel={art}
          pruefen={async () => {
            try {
              const ergebnis = await pruefeLoeschbar("fahrzeug", id);
              if (ergebnis.ok) return ergebnis.wert;
            } catch {
              // Der feste, nicht loeschbare Zustand folgt direkt darunter.
            }
            return {
              loeschbar: false,
              grund: PRUEF_FEHLER,
              kannDeaktivieren: false,
            };
          }}
          onLoeschen={loeschen}
          onDeaktivieren={deaktivieren}
        />
      </Space>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </div>
  );
}
