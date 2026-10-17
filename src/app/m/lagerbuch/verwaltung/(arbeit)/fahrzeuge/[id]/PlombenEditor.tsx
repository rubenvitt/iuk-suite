"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Flex, Input, Select, Switch } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { plombeAendern, plombeAnlegen } from "../../../../_actions/plomben";
import { Chip } from "../../../../_ui/Chip";
import { Ikone } from "../../../../_ui/ikonen";

/**
 * Plomben einer Einheit — IDA-222.
 *
 * Die Verwaltung legt fest, WELCHER Behaelter verplombt wird und welches Fach
 * er abdeckt. Die Nummer setzt der Vollcheck; hier steht nur, ob und wann.
 *
 * ⚠️ `gesetzt` KOMMT ALS FERTIGER TEXT, nicht als `Date`: ein `Date` reist
 * klaglos ueber die RSC-Grenze und formatierte hier in der Zone des Geraets.
 */
export type PlombeVerwaltungZeile = {
  id: string;
  bezeichnung: string;
  fachLabel: string | null;
  aktiv: boolean;
  /** „gesetzt am …: Nummer" oder `null` = steht nicht. */
  gesetzt: string | null;
};

const FEHLER = "Plombe konnte nicht gespeichert werden.";

export function PlombenEditor({
  lagerortId,
  plomben,
  faecher,
}: {
  lagerortId: string;
  plomben: PlombeVerwaltungZeile[];
  /** Die Faecher der Soll-Bestueckung — nur sie kann eine Plombe abdecken. */
  faecher: string[];
}) {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  const [neuName, setNeuName] = useState("");
  const [neuFach, setNeuFach] = useState<string | undefined>(undefined);
  const [laeuft, start] = useTransition();

  const fachOptionen = faecher.map((f) => ({ value: f, label: f }));

  const ausfuehren = (fn: () => Promise<{ ok: boolean; fehler?: string }>, danach?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          setFehler(r.fehler ?? FEHLER);
          return;
        }
        setFehler(null);
        danach?.();
        router.refresh();
      } catch {
        setFehler(FEHLER);
      }
    });

  return (
    <div style={{ display: "grid", gap: SPACE.md }} data-rolle="plomben-editor">
      <p style={{ margin: 0 }}>
        Eine Plombe bezeugt, dass ein Behälter seit dem letzten Vollcheck zu war. Solange sie
        steht, liest der Kurzcheck nur ihre Nummer ab, statt das Fach zu zählen. Gesetzt wird die
        Nummer im Vollcheck.
      </p>
      {plomben.length === 0 ? (
        <p style={{ margin: 0 }}>Noch keine Plombe angelegt.</p>
      ) : (
        <div style={{ display: "grid", gap: SPACE.sm }}>
          {plomben.map((p) => (
            <Flex key={p.id} gap={SPACE.sm} wrap align="center" data-rolle="plombe-zeile">
              <strong style={{ minWidth: 160 }}>{p.bezeichnung}</strong>
              <Select<string>
                allowClear
                placeholder="Kein Fach"
                aria-label={`Fach von ${p.bezeichnung}`}
                value={p.fachLabel ?? undefined}
                options={fachOptionen}
                disabled={laeuft}
                style={{ minWidth: 200 }}
                onChange={(fach) =>
                  ausfuehren(() => plombeAendern({ id: p.id, lagerortId, fachLabel: fach ?? null }))}
              />
              <Switch
                checked={p.aktiv}
                disabled={laeuft}
                aria-label={`${p.bezeichnung} aktiv`}
                onChange={(aktiv) => ausfuehren(() => plombeAendern({ id: p.id, lagerortId, aktiv }))}
              />
              {!p.aktiv ? (
                <Chip ton="grau">stillgelegt</Chip>
              ) : p.gesetzt ? (
                <Chip ton="ok">{p.gesetzt}</Chip>
              ) : (
                <Chip ton="gelb">nicht gesetzt</Chip>
              )}
              {p.aktiv && p.fachLabel === null && <Chip ton="grau">deckt kein Fach ab</Chip>}
            </Flex>
          ))}
        </div>
      )}
      <Flex gap={SPACE.sm} wrap align="center">
        <Input
          placeholder="Behälter, z. B. Medizinkoffer"
          aria-label="Neue Plombe"
          value={neuName}
          onChange={(e) => setNeuName(e.target.value)}
          style={{ minWidth: 220, width: "auto" }}
        />
        <Select<string>
          allowClear
          placeholder="Fach, das sie abdeckt"
          aria-label="Fach der neuen Plombe"
          value={neuFach}
          onChange={setNeuFach}
          options={fachOptionen}
          style={{ minWidth: 200 }}
        />
        <Button
          type="primary"
          icon={<Ikone name="plus" groesse={16} />}
          loading={laeuft}
          disabled={!neuName.trim() || laeuft}
          onClick={() =>
            ausfuehren(
              () => plombeAnlegen({ lagerortId, bezeichnung: neuName.trim(), fachLabel: neuFach ?? null }),
              () => { setNeuName(""); setNeuFach(undefined); },
            )}
        >
          Plombe hinzufügen
        </Button>
      </Flex>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </div>
  );
}
