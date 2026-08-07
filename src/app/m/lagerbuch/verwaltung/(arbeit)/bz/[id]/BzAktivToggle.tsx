"use client";

import { useState, useTransition } from "react";
import { Alert, Space, Switch } from "antd";
import { useRouter } from "next/navigation";
import { setGeraetAktiv } from "../../../../_actions/bz";
import {
  deaktiviereElement,
  loescheElement,
  pruefeLoeschbar,
} from "../../../../_actions/loeschen";
import { LoeschButton } from "../../../../_ui/LoeschButton";

const STATUS_FEHLER = "BZ-Gerätestatus konnte nicht geändert werden.";
const PRUEF_FEHLER = "Löschbarkeit konnte nicht geprüft werden.";
const LOESCH_FEHLER = "BZ-Gerät konnte nicht gelöscht werden.";
const DEAKTIVIER_FEHLER = "BZ-Gerät konnte nicht deaktiviert werden.";

export function BzAktivToggle({
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

  function aktivAendern(naechsterWert: boolean): void {
    setFehler(null);
    startTransition(async () => {
      try {
        const ergebnis = await setGeraetAktiv({ id, aktiv: naechsterWert });
        if (!ergebnis.ok) {
          setFehler(STATUS_FEHLER);
          return;
        }
        setIstAktiv(naechsterWert);
      } catch {
        setFehler(STATUS_FEHLER);
      }
    });
  }

  async function loeschen(): Promise<void> {
    try {
      const ergebnis = await loescheElement("bzGeraet", id);
      if (!ergebnis.ok) throw new Error(LOESCH_FEHLER);
    } catch {
      throw new Error(LOESCH_FEHLER);
    }
    router.push("/verwaltung/bz");
  }

  async function deaktivieren(): Promise<void> {
    try {
      const ergebnis = await deaktiviereElement("bzGeraet", id);
      if (!ergebnis.ok) throw new Error(DEAKTIVIER_FEHLER);
    } catch {
      throw new Error(DEAKTIVIER_FEHLER);
    }
    router.push("/verwaltung/bz");
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Space wrap>
        <Switch
          checked={istAktiv}
          loading={laeuft}
          aria-label="BZ-Gerät aktiv"
          onChange={aktivAendern}
        />
        <span>{istAktiv ? "Aktiv" : "Inaktiv"}</span>
        <LoeschButton
          name={name}
          typLabel="BZ-Gerät"
          pruefen={async () => {
            try {
              const ergebnis = await pruefeLoeschbar("bzGeraet", id);
              if (ergebnis.ok) return ergebnis.wert;
            } catch {
              // Der feste unbenutzbare Status steht direkt darunter.
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
