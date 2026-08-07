"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Space, Switch } from "antd";
import { useRouter } from "next/navigation";
import { setFlascheAktiv } from "../../../../_actions/sauerstoff";
import {
  deaktiviereElement,
  loescheElement,
  pruefeLoeschbar,
} from "../../../../_actions/loeschen";
import { LoeschButton } from "../../../../_ui/LoeschButton";

const STATUS_FEHLER = "Flaschenstatus konnte nicht geändert werden.";
const PRUEF_FEHLER = "Löschbarkeit konnte nicht geprüft werden.";
const LOESCH_FEHLER = "Sauerstoffflasche konnte nicht gelöscht werden.";
const DEAKTIVIER_FEHLER = "Sauerstoffflasche konnte nicht deaktiviert werden.";

export function FlascheAktivToggle({
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
        const ergebnis = await setFlascheAktiv({ id, aktiv: naechsterWert });
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
      const ergebnis = await loescheElement("o2Flasche", id);
      if (!ergebnis.ok) throw new Error(LOESCH_FEHLER);
    } catch {
      throw new Error(LOESCH_FEHLER);
    }
    router.push("/verwaltung/sauerstoff");
  }

  async function deaktivieren(): Promise<void> {
    try {
      const ergebnis = await deaktiviereElement("o2Flasche", id);
      if (!ergebnis.ok) throw new Error(DEAKTIVIER_FEHLER);
    } catch {
      throw new Error(DEAKTIVIER_FEHLER);
    }
    router.push("/verwaltung/sauerstoff");
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Space wrap>
        <Switch
          checked={istAktiv}
          loading={laeuft}
          aria-label="Flasche aktiv"
          onChange={aktivAendern}
        />
        <span>{istAktiv ? "Aktiv" : "Inaktiv"}</span>
        <LoeschButton
          name={name}
          typLabel="Sauerstoffflasche"
          pruefen={async () => {
            try {
              const ergebnis = await pruefeLoeschbar("o2Flasche", id);
              if (ergebnis.ok) return ergebnis.wert;
            } catch {
              // Der feste, nicht löschbare Zustand folgt direkt darunter.
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
