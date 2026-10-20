"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Radio, Switch } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { alleLoeschenAction, neueFreigebenAction, quelleAction, trennenAction } from "../_actions/verwaltung";
import type { Quelle } from "../_lib/einstellungen";
import styles from "./helfer.module.css";

export interface EinstellungenProps {
  quelle: Quelle;
  neueFreigeben: boolean;
  anzahl: number;
  /** Fehlende Umgebungsvariablen für HiOrg; leer heißt „eingerichtet“. */
  hiorgFehlt: string[];
  verbindung: { kontoName: string; verbundenVon: string; verbundenAm: string; erneuertAm: string } | null;
  /** Ergebnis der Rückkehr von HiOrg (`?hiorg=`), bereits als Text. */
  rueckmeldung: { art: "erfolg" | "warnung"; text: string } | null;
}

/** Die Einstellungen der Verwaltung: Quelle, Verbindung zu HiOrg, Vorgabe der Freigabe, Löschen. */
export function Einstellungen(p: EinstellungenProps) {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const [laeuft, setLaeuft] = useState<string | null>(null);

  async function tue(schluessel: string, aktion: () => Promise<{ ok: boolean; fehler?: string }>, erfolg: string): Promise<void> {
    setLaeuft(schluessel);
    try {
      const e = await aktion();
      if (e.ok) void message.success(erfolg);
      else void message.warning(e.fehler ?? "Das hat nicht geklappt.");
      router.refresh();
    } catch {
      void message.warning("Das hat nicht geklappt. Bitte die Seite neu laden.");
    } finally {
      setLaeuft(null);
    }
  }

  function quelleWechseln(neu: Quelle): void {
    if (neu === p.quelle) return;
    modal.confirm({
      title: neu === "demo" ? "Zur Demo-Quelle wechseln?" : "Zu HiOrg-Server wechseln?",
      content: p.anzahl > 0
        ? `Die ${p.anzahl} Helfer der bisherigen Quelle werden gelöscht. Danach holst du die neuen unter „Abgleich“.`
        : "Danach holst du die Helfer unter „Abgleich“.",
      okText: "Wechseln",
      cancelText: "Abbrechen",
      onOk: () => tue("quelle", () => quelleAction(neu), neu === "demo" ? "Demo-Quelle eingestellt." : "HiOrg-Server eingestellt."),
    });
  }

  return (
    <div style={{ display: "grid", gap: SPACE.xl, maxWidth: 720 }}>
      {p.rueckmeldung ? <Alert type={p.rueckmeldung.art === "erfolg" ? "success" : "warning"} showIcon title={p.rueckmeldung.text} /> : null}

      <section aria-labelledby="quelle" style={{ display: "grid", gap: SPACE.sm }}>
        <h2 id="quelle" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Quelle</h2>
        <Radio.Group value={p.quelle} onChange={(e) => quelleWechseln(e.target.value as Quelle)} disabled={laeuft !== null} style={{ display: "grid", gap: SPACE.xs }}>
          <Radio value="demo" style={{ minHeight: 44, alignItems: "center" }}>Demo — erfundene Helfer zum Ausprobieren</Radio>
          <Radio value="hiorg" style={{ minHeight: 44, alignItems: "center" }} disabled={p.hiorgFehlt.length > 0}>HiOrg-Server</Radio>
        </Radio.Group>
        {p.hiorgFehlt.length > 0 ? (
          <p style={{ ...SCHRIFT.neben, margin: 0 }}>
            HiOrg-Server ist nicht eingerichtet. Es fehlt in der Umgebung der Suite: {p.hiorgFehlt.join(", ")}.
            Den Zugang (Client-ID und Secret) beantragt der Account-Inhaber beim HiOrg-Support.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="verbindung" style={{ display: "grid", gap: SPACE.sm }}>
        <h2 id="verbindung" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Verbindung zu HiOrg-Server</h2>
        {p.verbindung ? (
          <p style={{ margin: 0 }} data-testid="hiorg-verbindung">
            Verbunden als <b>{p.verbindung.kontoName}</b>, eingerichtet von {p.verbindung.verbundenVon} am {p.verbindung.verbundenAm},
            zuletzt erneuert am {p.verbindung.erneuertAm}. Gelesen wird nur, was dieses Konto in HiOrg sehen darf.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            Nicht verbunden. Beim Verbinden meldest du dich einmal bei HiOrg-Server an; die Suite speichert danach nur ein
            verschlüsseltes Erneuerungs-Token, nie dein Passwort.
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm }}>
          {p.hiorgFehlt.length === 0 ? (
            // Ein echter Seitenwechsel, kein `next/link`: das Ziel ist ein Route Handler, der zu HiOrg weiterleitet.
            <a className={styles.knopf} href="/hiorg/verbinden">{p.verbindung ? "Neu verbinden" : "Mit HiOrg-Server verbinden"}</a>
          ) : null}
          {p.verbindung ? (
            <Button onClick={() => void tue("trennen", trennenAction, "Verbindung getrennt, Token gelöscht.")} loading={laeuft === "trennen"} disabled={laeuft !== null}>
              Verbindung trennen
            </Button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="freigabe" style={{ display: "grid", gap: SPACE.sm }}>
        <h2 id="freigabe" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Freigabe fürs Einsatzbuch</h2>
        <label style={{ display: "flex", alignItems: "center", gap: SPACE.sm, minHeight: 44 }}>
          <Switch
            checked={p.neueFreigeben}
            loading={laeuft === "freigabe"}
            disabled={laeuft !== null}
            onChange={(wert) => void tue("freigabe", () => neueFreigebenAction(wert), "Gespeichert.")}
          />
          Neu übernommene Helfer gleich fürs Einsatzbuch freigeben
        </label>
        <p style={{ ...SCHRIFT.neben, margin: 0 }}>Aus: neue Helfer gibst du in der Liste einzeln oder gesammelt frei.</p>
      </section>

      <section aria-labelledby="loeschen" className={styles.gefahrenzone}>
        <h2 id="loeschen" className={styles.gefahrenTitel}>Alle Helferdaten löschen</h2>
        <p style={{ margin: 0 }}>
          Löscht alle {p.anzahl} Helfer und das Abgleichprotokoll. Die Verbindung zu HiOrg bleibt; im Einsatzbuch werden die
          Personen beim nächsten Abgleich deaktiviert.
        </p>
        <div>
          <Button
            danger
            disabled={laeuft !== null || p.anzahl === 0}
            loading={laeuft === "loeschen"}
            onClick={() => modal.confirm({
              title: "Alle Helferdaten löschen?",
              content: "Das lässt sich nicht rückgängig machen; ein neuer Abgleich holt sie wieder aus der Quelle.",
              okText: "Löschen",
              okButtonProps: { danger: true },
              cancelText: "Abbrechen",
              onOk: () => tue("loeschen", alleLoeschenAction, "Alle Helferdaten gelöscht."),
            })}
          >
            Alle löschen
          </Button>
        </div>
      </section>
    </div>
  );
}
