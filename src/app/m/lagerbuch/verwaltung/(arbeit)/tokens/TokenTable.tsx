"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Flex, Table } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { setTokenAktiv } from "../../../_actions/tokens";
import { falte } from "../../../_lib/suche";
import { toggleInSet } from "../../../_lib/mengen";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";

const STATUS_FEHLER = "Zugangs-Code-Status konnte nicht geändert werden.";
const EINSTIEG_FENSTER_MS = 2 * 60_000;
const REFRESH_ABSTAND_MS = 1_000;

type OffenerEinstieg = { id: string; vorher: string; bis: number; zuletzt: number };

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

/**
 * ENTSCHEIDUNG 8-F (§8.3): Der Namensraum der Zugangs-Codes ist gesperrt — ein
 * Code kann nur noch gesperrt, nie mehr gelöscht werden. Hier stand bis T160
 * ein `LoeschButton art="token"` samt Adaptern auf `pruefeLoeschbar`,
 * `loescheElement` und `deaktiviereElement`. Der AUFRUF ist entfallen; übrig
 * bleibt der Knopf „Sperren" / „Reaktivieren" auf `setTokenAktiv`.
 *
 * ⚠️ NICHT der Dialog: `_ui/LoeschDialog.tsx` und `_ui/LoeschButton.tsx`
 * bleiben unangetastet und tragen weiterhin Artikel, Fahrzeuge, BZ-Geräte,
 * O₂-Flaschen, Geräte und Vorlagen.
 *
 * ⚠️ Ankündigungspflicht (Runbook R34): Wer heute einen versehentlich
 * angelegten Code löscht, findet den Knopf nicht mehr. `pruefeLoeschbar`
 * lehnt serverseitig weiterhin benannt ab und nennt das Sperren als Weg
 * (`_lib/tokenForm.ts`, `TOKEN_LOESCHGRUND`) — diese Seite fragt nur nicht
 * mehr danach.
 */
export function TokenTable({ zeilen }: { zeilen: TokenAnzeigeZeile[] }) {
  const [suche, setSuche] = useState("");
  const [nurGesperrt, setNurGesperrt] = useState(false);
  const [ziele, setZiele] = useState<ReadonlySet<ZielFilter>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  const router = useRouter();

  // Die Einloesung im neuen Tab schreibt `lastUsedAt`, diese Zeilen kennen das
  // nicht. Nach einem „Einsteigen" frischt JEDE Rueckkehr des Tabs auf — bis die
  // angeklickte Zeile tatsaechlich einen neuen Wert traegt. Ein Verbrauch beim
  // ersten Fokus reichte nicht: kehrt man zurueck, bevor `/t/<code>` fertig ist,
  // liest dieser eine Refresh noch die alte Zeile. Ohne Einstieg laedt ein
  // Fensterwechsel nichts neu; das Fenster schliesst spaetestens nach zwei
  // Minuten (etwa wenn das Gate die Einloesung abgewiesen hat).
  const einstieg = useRef<OffenerEinstieg | null>(null);
  useEffect(() => {
    const offen = einstieg.current;
    const zeile = offen ? zeilen.find((z) => z.id === offen.id) : undefined;
    if (zeile && zeile.lastUsedText !== offen?.vorher) einstieg.current = null;
  }, [zeilen]);
  useEffect(() => {
    const zurueck = () => {
      const offen = einstieg.current;
      if (!offen || document.visibilityState === "hidden") return;
      const jetzt = Date.now();
      if (jetzt > offen.bis) {
        einstieg.current = null;
        return;
      }
      // `focus` und `visibilitychange` feuern bei derselben Rueckkehr beide.
      if (jetzt - offen.zuletzt < REFRESH_ABSTAND_MS) return;
      offen.zuletzt = jetzt;
      router.refresh();
    };
    window.addEventListener("focus", zurueck);
    document.addEventListener("visibilitychange", zurueck);
    return () => {
      window.removeEventListener("focus", zurueck);
      document.removeEventListener("visibilitychange", zurueck);
    };
  }, [router]);

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
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
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
          style={{ marginBlockEnd: SPACE.md }}
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
            title: <span style={SCHRIFT.feldname}>Code</span>,
            dataIndex: "code",
            render: (code: string) => (
              <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{code}</span>
            ),
          },
          { title: <span style={SCHRIFT.feldname}>Bezeichnung</span>, dataIndex: "label" },
          {
            title: <span style={SCHRIFT.feldname}>Ziel</span>,
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
            title: <span style={SCHRIFT.feldname}>Status</span>,
            dataIndex: "aktiv",
            render: (aktiv: boolean) => (
              <Chip ton={aktiv ? "ok" : "rot"}>{aktiv ? "aktiv" : "gesperrt"}</Chip>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Zuletzt benutzt</span>,
            dataIndex: "lastUsedText",
            render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
          },
          {
            title: "",
            key: "aktionen",
            render: (_wert: unknown, zeile) => (
              <Flex gap={SPACE.sm} align="center">
                {/* KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
                    docs/design/README.md) ist mit der Arbeitsdichte gefallen --
                    44px ist hier bereits die volle wie die halbe Bediendichte,
                    "small" unterbietet die Mindesttapflaeche (WCAG 2.5.5). */}
                {/* EINSTEIGEN: derselbe Weg wie der gescannte QR (`t/[code]/route.ts`),
                    also echte Einloesung mit Helfer-Sitzung, `lastUsedAt` und
                    Protokollzeile. Neuer Tab, damit die Verwaltung offen bleibt.
                    Nur fuer AKTIVE Codes: ein gesperrter landete am Gate und
                    buchte einen Fehlversuch in den geteilten Eimer. */}
                {zeile.aktiv ? (
                  <Button
                    href={`/t/${encodeURIComponent(zeile.code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      einstieg.current = {
                        id: zeile.id,
                        vorher: zeile.lastUsedText,
                        bis: Date.now() + EINSTIEG_FENSTER_MS,
                        zuletzt: 0,
                      };
                    }}
                    icon={<Ikone name="pfeil-rechts" groesse={16} />}
                  >
                    Einsteigen
                  </Button>
                ) : null}
                <Button
                  disabled={laeuft}
                  onClick={() => statusAendern(zeile)}
                >
                  {zeile.aktiv ? "Sperren" : "Reaktivieren"}
                </Button>
              </Flex>
            ),
          },
        ]}
      />
    </>
  );
}
