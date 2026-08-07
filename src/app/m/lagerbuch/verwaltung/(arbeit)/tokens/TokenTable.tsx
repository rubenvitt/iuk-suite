"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, Button, Checkbox, Flex, Table } from "antd";
import { setTokenAktiv } from "../../../_actions/tokens";
import {
  deaktiviereElement,
  loescheElement,
  pruefeLoeschbar,
} from "../../../_actions/loeschen";
import { falte } from "../../../_lib/suche";
import { toggleInSet } from "../../../_lib/mengen";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { LoeschButton } from "../../../_ui/LoeschButton";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";

const STATUS_FEHLER = "Zugangs-Code-Status konnte nicht geändert werden.";
const PRUEF_FEHLER = "Löschbarkeit konnte nicht geprüft werden.";
const LOESCH_FEHLER = "Zugangs-Code konnte nicht gelöscht werden.";
const SPERR_FEHLER = "Zugangs-Code konnte nicht gesperrt werden.";

export type ZielFilter = "fahrzeug" | "artikel" | "liste";

export type TokenAnzeigeZeile = {
  id: string;
  code: string;
  label: string;
  aktiv: boolean;
  lastUsedText: string;
  zielTyp: "fahrzeug" | "artikel" | null;
  zielId: string | null;
  zielName: string | null;
};

export function zielVon(z: TokenAnzeigeZeile): ZielFilter {
  return z.zielTyp ?? "liste";
}

/** SUCHFELDMENGE 6 VON 6: Code · Label · Zielname. */
export function sucheTrifft(z: TokenAnzeigeZeile, begriff: string): boolean {
  const nadel = falte(begriff.trim());
  return !nadel || falte(`${z.code} ${z.label} ${z.zielName ?? ""}`).includes(nadel);
}

async function loeschen(id: string): Promise<void> {
  try {
    const ergebnis = await loescheElement("token", id);
    if (!ergebnis.ok) throw new Error(LOESCH_FEHLER);
  } catch {
    throw new Error(LOESCH_FEHLER);
  }
}

async function sperren(id: string): Promise<void> {
  try {
    const ergebnis = await deaktiviereElement("token", id);
    if (!ergebnis.ok) throw new Error(SPERR_FEHLER);
  } catch {
    throw new Error(SPERR_FEHLER);
  }
}

export function TokenTable({ zeilen }: { zeilen: TokenAnzeigeZeile[] }) {
  const [suche, setSuche] = useState("");
  const [nurGesperrt, setNurGesperrt] = useState(false);
  const [ziele, setZiele] = useState<ReadonlySet<ZielFilter>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();

  const gefiltert = useMemo(() => zeilen.filter((zeile) => {
    if (nurGesperrt && zeile.aktiv) return false;
    if (ziele.size > 0 && !ziele.has(zielVon(zeile))) return false;
    return sucheTrifft(zeile, suche);
  }), [nurGesperrt, suche, zeilen, ziele]);

  const hatFilter = suche.trim() !== "" || nurGesperrt || ziele.size > 0;
  const zielUmschalten = (ziel: ZielFilter) => () => {
    setZiele((bisher) => toggleInSet(bisher, ziel));
  };

  function statusAendern(zeile: TokenAnzeigeZeile): void {
    setFehler(null);
    startTransition(async () => {
      try {
        const ergebnis = await setTokenAktiv({ id: zeile.id, aktiv: !zeile.aktiv });
        if (!ergebnis.ok) setFehler(STATUS_FEHLER);
      } catch {
        setFehler(STATUS_FEHLER);
      }
    });
  }

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Code, Bezeichnung oder Ziel suchen…"
        />
        <Checkbox
          checked={nurGesperrt}
          onChange={(ereignis) => setNurGesperrt(ereignis.target.checked)}
        >
          gesperrt
        </Checkbox>
        <Checkbox.Group<ZielFilter>
          value={[...ziele]}
          options={[
            {
              value: "fahrzeug",
              onChange: zielUmschalten("fahrzeug"),
              label: <span><Ikone name="fahrzeug" groesse={12} /> Fahrzeug</span>,
            },
            {
              value: "artikel",
              onChange: zielUmschalten("artikel"),
              label: <span><Ikone name="objekt" groesse={12} /> Artikel</span>,
            },
            {
              value: "liste",
              onChange: zielUmschalten("liste"),
              label: <span><Ikone name="liste" groesse={12} /> Artikel-Liste</span>,
            },
          ]}
        />
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
      </Flex>

      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          style={{ marginBlockEnd: 12 }}
        />
      ) : null}

      <Table<TokenAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Zugangs-Codes"
        dataSource={gefiltert}
        locale={{
          emptyText: hatFilter
            ? "Kein Code passt zu Suche und Filter."
            : "Noch keine Codes. Lege oben den ersten an.",
        }}
        columns={[
          {
            title: "Code",
            dataIndex: "code",
            render: (code: string) => (
              <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{code}</span>
            ),
          },
          { title: "Bezeichnung", dataIndex: "label" },
          {
            title: "Ziel",
            dataIndex: "zielTyp",
            render: (_wert: unknown, zeile) => {
              const ziel = zielVon(zeile);
              return (
                <Chip
                  ton="grau"
                  zeichen={ziel === "fahrzeug"
                    ? "fahrzeug"
                    : ziel === "artikel" ? "objekt" : "liste"}
                >
                  {ziel === "liste" ? "Artikel-Liste" : (zeile.zielName ?? "—")}
                </Chip>
              );
            },
          },
          {
            title: "Status",
            dataIndex: "aktiv",
            render: (aktiv: boolean) => (
              <Chip ton={aktiv ? "ok" : "rot"}>{aktiv ? "aktiv" : "gesperrt"}</Chip>
            ),
          },
          {
            title: "Zuletzt benutzt",
            dataIndex: "lastUsedText",
            render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
          },
          {
            title: "",
            key: "aktionen",
            render: (_wert: unknown, zeile) => (
              <Flex gap={8} align="center">
                <Button
                  size="small"
                  disabled={laeuft}
                  onClick={() => statusAendern(zeile)}
                >
                  {zeile.aktiv ? "Sperren" : "Reaktivieren"}
                </Button>
                <LoeschButton
                  size="small"
                  nurZeichen
                  name={zeile.code}
                  typLabel="Zugangs-Code"
                  deaktivierenLabel="Sperren"
                  pruefen={async () => {
                    try {
                      const ergebnis = await pruefeLoeschbar("token", zeile.id);
                      if (ergebnis.ok) return ergebnis.wert;
                    } catch {
                      // Fester, nicht löschbarer Zustand folgt.
                    }
                    return {
                      loeschbar: false,
                      grund: PRUEF_FEHLER,
                      kannDeaktivieren: true,
                    };
                  }}
                  onLoeschen={() => loeschen(zeile.id)}
                  onDeaktivieren={() => sperren(zeile.id)}
                />
              </Flex>
            ),
          },
        ]}
      />
    </>
  );
}
