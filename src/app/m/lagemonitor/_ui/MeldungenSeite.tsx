"use client";

import { useMemo, useState } from "react";
import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import type { KonfigurationDTO } from "../_lib/konfiguration";
import type { KategorieDTO } from "../_lib/kategorieRegeln";
import type { LagekarteObjektDTO } from "../_lib/lagekarteRegeln";
import type { MeldungDTO } from "../_lib/meldungRegeln";
import type { ZugangDTO } from "../_lib/schluessel";
import type { StandortDTO } from "../_lib/standort";
import type { Szenario } from "../_lib/vorschau";
import { Meldungen, type MeldungEntwurf } from "./Meldungen";
import { bandMeldungen, kartenMitte, useJetzt, vorschauOrtVon } from "./vorschauBand";
import { VorschauSpalte } from "./VorschauSpalte";
import { ZumMonitor } from "./ZumMonitor";
import v from "./verwaltung.module.css";

/**
 * Die Startseite der Verwaltung (IDA-396): Meldungen anlegen und beenden, die Tagesaufgabe. Daneben die
 * Vorschau mit der gespeicherten Einrichtung und dem getippten Entwurf im Band. Die Einrichtung liegt auf
 * eigener Seite, einen Schritt entfernt über den Knopf im Kopf. Nur serialisierbare Props (Falle 9).
 */
export function MeldungenSeite({
  konfiguration,
  meldungen,
  kategorien,
  online,
  zugaenge,
  standorte,
  lagekarte,
}: {
  konfiguration: KonfigurationDTO;
  meldungen: MeldungDTO[];
  kategorien: KategorieDTO[];
  online: string | null;
  zugaenge: ZugangDTO[];
  standorte: Record<string, StandortDTO>;
  lagekarte: LagekarteObjektDTO[];
}) {
  const jetzt = useJetzt();
  const [entwurf, setEntwurf] = useState<MeldungEntwurf | null>(null);
  const [szenario, setSzenario] = useState<Szenario>("ruhe");
  const band = useMemo(() => bandMeldungen(meldungen, kategorien, entwurf, jetzt), [meldungen, kategorien, entwurf, jetzt]);
  const standortName = vorschauOrtVon(zugaenge, standorte);
  const mitte = useMemo(() => kartenMitte(zugaenge, standorte), [zugaenge, standorte]);
  // Die Vorschau zeigt, was gespeichert ist: genau das steht am Monitor.
  const eingabe = useMemo(
    () => ({ ...konfiguration, standortName, tomtom: konfiguration.tomtomHinterlegt }),
    [konfiguration, standortName],
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Meldungen"
        aktionen={
          <>
            <Button href="/einrichtung" icon={<Icons8Ikone name="settings" groesse={16} />} data-testid="zur-einrichtung">
              Einrichtung
            </Button>
            <ZumMonitor online={online} />
          </>
        }
      />
      <div className={v.raster}>
        <Meldungen liste={meldungen} kategorien={kategorien} jetzt={jetzt} onEntwurf={setEntwurf} />
        <VorschauSpalte
          eingabe={eingabe}
          band={band}
          szenario={szenario}
          onSzenario={setSzenario}
          lagekarte={{ objekte: lagekarte, mitte, zoom: konfiguration.kartenZoom }}
        />
      </div>
    </div>
  );
}
