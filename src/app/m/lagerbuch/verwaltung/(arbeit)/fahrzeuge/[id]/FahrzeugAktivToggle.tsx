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
import { LoeschButton } from "../../../../_ui/LoeschButton";

const STATUS_FEHLER = "Fahrzeugstatus konnte nicht geändert werden.";
const PRUEF_FEHLER = "Löschbarkeit konnte nicht geprüft werden.";
const LOESCH_FEHLER = "Fahrzeug konnte nicht gelöscht werden.";
const DEAKTIVIER_FEHLER = "Fahrzeug konnte nicht deaktiviert werden.";

export function FahrzeugAktivToggle({
  id,
  name,
  aktiv,
}: {
  id: string;
  name: string;
  aktiv: boolean;
}) {
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
      if (!ergebnis.ok) throw new Error(LOESCH_FEHLER);
    } catch {
      throw new Error(LOESCH_FEHLER);
    }
    router.push("/verwaltung/fahrzeuge");
  }

  async function deaktivieren(): Promise<void> {
    try {
      const ergebnis = await deaktiviereElement("fahrzeug", id);
      if (!ergebnis.ok) throw new Error(DEAKTIVIER_FEHLER);
    } catch {
      throw new Error(DEAKTIVIER_FEHLER);
    }
    router.push("/verwaltung/fahrzeuge");
  }

  return (
    <div style={{ display: "grid", gap: SPACE.sm }}>
      <Space wrap>
        <Switch
          checked={istAktiv}
          loading={laeuft}
          aria-label="Fahrzeug aktiv"
          onChange={aktivAendern}
        />
        <span>{istAktiv ? "Aktiv" : "Inaktiv"}</span>
        <LoeschButton
          name={name}
          typLabel="Fahrzeug"
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
