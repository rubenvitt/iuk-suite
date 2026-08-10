"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Space, Switch } from "antd";
import { useRouter } from "next/navigation";
import { setGeraetAktiv } from "../../../../_actions/geraete";
import {
  deaktiviereElement,
  loescheElement,
  pruefeLoeschbar,
} from "../../../../_actions/loeschen";
import { LoeschButton } from "../../../../_ui/LoeschButton";

const STATUS_FEHLER = "Gerätestatus konnte nicht geändert werden.";
const PRUEF_FEHLER = "Löschbarkeit konnte nicht geprüft werden.";
const LOESCH_FEHLER = "Gerät konnte nicht gelöscht werden.";
const DEAKTIVIER_FEHLER = "Gerät konnte nicht deaktiviert werden.";

export function GeraetAktivToggle({
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
        const ergebnis = await setGeraetAktiv({ id, aktiv: naechsterWert });
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
      const ergebnis = await loescheElement("geraet", id);
      if (!ergebnis.ok) throw new Error(LOESCH_FEHLER);
    } catch {
      throw new Error(LOESCH_FEHLER);
    }
    router.push("/verwaltung/geraete");
  }

  async function deaktivieren(): Promise<void> {
    try {
      const ergebnis = await deaktiviereElement("geraet", id);
      if (!ergebnis.ok) throw new Error(DEAKTIVIER_FEHLER);
    } catch {
      throw new Error(DEAKTIVIER_FEHLER);
    }
    router.push("/verwaltung/geraete");
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Space wrap>
        <Switch
          checked={istAktiv}
          loading={laeuft}
          aria-label="Gerät aktiv"
          onChange={aktivAendern}
        />
        <span>{istAktiv ? "Aktiv" : "Inaktiv"}</span>
        <LoeschButton
          name={name}
          typLabel="Gerät"
          pruefen={async () => {
            try {
              const ergebnis = await pruefeLoeschbar("geraet", id);
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
      {fehler ? (
        <Alert type="warning" showIcon={false} title={fehler} />
      ) : null}
    </div>
  );
}
