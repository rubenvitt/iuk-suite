"use client";

import { useActionState, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Collapse, Input, InputNumber, Modal, Popconfirm } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { deleteGroupAction, regenerateSecretAction, updateGroupAction } from "../actions";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { DEFAULT_CLOSE_AFTER_HOURS } from "../_lib/lifecycle";
import { T } from "./typo";
import { Zuordnung, type ZuordnungPerson } from "./Zuordnung";

/**
 * ZONE e — EINSTELLUNGEN (Entwurf §2.6, §4.4, §4.6, §4.9).
 *
 * Alles, was man selten braucht, an einem Ort und ohne eigene Route. Fuenf
 * Server-Actions hatten bis hierher KEINEN Aufrufer — Gruppe bearbeiten, Secret
 * neu erzeugen, Gruppe loeschen (plus Abend bearbeiten/loeschen in Zone d): jede
 * Korrektur war ein Datenbankeingriff.
 *
 * DIE REIHENFOLGE IST DER SCHUTZ: Gruppe → Leitung → FOLGENSCHWER. Am Handy sind
 * beide Knoepfe gleich gross, und die einzige Sicherung ist, dass der
 * folgenschwere zuverlaessig am Fuss steht (§2.6).
 *
 * EINGEKLAPPT IN ALLEN VIER ZUSTAENDEN, auch bei „Gruppe ganz neu" — nichts davon
 * braucht man im Gruppenraum. `Collapse items={[…]}`, nie `Collapse.Panel`.
 *
 * `slug` FEHLT HIER NICHT AUS VERSEHEN (§2.6): er steckt in jedem gedruckten
 * QR-Code. Ein Slug-Wechsel ist funktional dasselbe wie „Neues Secret erzeugen"
 * und gehoert nicht in ein Speichern-Formular — die Action ignoriert das Feld
 * selbst dann, wenn es im POST auftaucht.
 */

export type EinstellungenPanelProps = {
  groupId: number;
  name: string;
  /** `null` heisst „Vorgabe benutzen" — das Feld bleibt dann leer. */
  closeAfterHours: number | null;
  istAdmin: boolean;
  /**
   * Die zugeordnete Leitung — NUR fuer Admins gefuellt. Nicht-Admins bekommen die
   * Kennungen fremder Personen nicht in ihre Client-Nutzlast serialisiert; ein
   * bloss ungerendeter Block haette sie trotzdem ausgeliefert.
   */
  leitung?: ZuordnungPerson[];
  /**
   * Steht das Personenverzeichnis des Identitaetsanbieters zur Verfuegung?
   * EIN BOOLEAN, KEINE LISTE: die Nutzerliste der Organisation gehoert nicht in
   * die Client-Nutzlast jeder Cockpit-Seite. Gesucht wird pro Anschlag,
   * serverseitig. `false` heisst „Rueckfall auf `known_users`" — die Oberflaeche
   * zeigt dann wieder das schlichte Eingabefeld.
   */
  verzeichnisAktiv?: boolean;
  /** Zahlen fuer den Loeschdialog — aus der Seite gerechnet, nie behauptet (§4.6). */
  abende: number;
  rueckmeldungen: number;
};

const HAARLINIE: CSSProperties = {
  border: 0,
  borderTop: "1px solid var(--fb-split)",
  margin: `${SPACE.lg}px 0`,
};

const FELD: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.xs };

/**
 * Der zurueckgegebene Fristwert als Zahl fuer `InputNumber` — und `0` bleibt `0`.
 *
 * Ein `Number(roh) || undefined` haette die getippte Null geloescht: `0` ist
 * falsy. Der Nutzer bekaeme dann eine Fehlermeldung UND ein leeres Feld, also
 * genau den Verlust, den §4.4 ausschliesst („Eingaben gehen nie verloren").
 * Unparsbarer Text kann in einem `InputNumber` nicht stehen; uebrig bleibt der
 * leere Fall, und der heisst „Vorgabe benutzen".
 */
function fristVorbelegung(roh: string): number | undefined {
  const geputzt = roh.trim();
  if (geputzt === "") return undefined;
  const n = Number(geputzt);
  return Number.isFinite(n) ? n : undefined;
}

export function EinstellungenPanel({
  groupId,
  name,
  closeAfterHours,
  istAdmin,
  leitung,
  verzeichnisAktiv,
  abende,
  rueckmeldungen,
}: EinstellungenPanelProps) {
  return (
    <Card styles={{ body: { padding: 0 } }}>
      <Collapse
        ghost
        items={[
          {
            key: "einstellungen",
            label: (
              <span style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm, flexWrap: "wrap" }}>
                <span style={{ ...T.body, fontWeight: 600 }}>Einstellungen</span>
                <span style={T.meta}>
                  {istAdmin ? "Name, Frist, Leitung, Zugang" : "Name, Frist, Zugang"}
                </span>
              </span>
            ),
            children: (
              <div>
                <GruppenFormular
                  groupId={groupId}
                  name={name}
                  closeAfterHours={closeAfterHours}
                />
                {istAdmin && (
                  <>
                    <hr style={HAARLINIE} />
                    <Zuordnung
                      groupId={groupId}
                      personen={leitung ?? []}
                      verzeichnisAktiv={verzeichnisAktiv}
                    />
                  </>
                )}
                <hr style={HAARLINIE} />
                <Folgenschwer
                  groupId={groupId}
                  name={name}
                  abende={abende}
                  rueckmeldungen={rueckmeldungen}
                  istAdmin={istAdmin}
                />
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}

/**
 * GRUPPE (§2.6 Punkt 1, §4.4). Speichern ist `default`, NICHT `primary`: es gibt
 * genau einen Primaerknopf pro Seite, und der steht in der Lagekarte.
 */
function GruppenFormular({
  groupId,
  name,
  closeAfterHours,
}: {
  groupId: number;
  name: string;
  closeAfterHours: number | null;
}) {
  const [state, formAction, isPending] = useActionState(updateGroupAction, FORM_START);
  const nameFehler = feldFehler(state, "name");
  const fristFehler = feldFehler(state, "closeAfterHours");

  return (
    <form
      action={formAction}
      className="fb-form"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}
    >
      <input type="hidden" name="id" value={groupId} />
      <label style={FELD}>
        <span style={T.kicker}>Gruppenname</span>
        <Input
          name="name"
          required
          defaultValue={feldWert(state, "name", name)}
          status={nameFehler ? "error" : undefined}
          aria-invalid={nameFehler ? true : undefined}
          aria-describedby={nameFehler ? "fb-gruppenname-err" : undefined}
        />
        {/* §4.4: Feldfehler sind Text in `--fb-muted`, nicht rot. */}
        {nameFehler && (
          <span id="fb-gruppenname-err" style={T.meta}>
            {nameFehler}
          </span>
        )}
      </label>
      <label style={FELD}>
        <span style={T.kicker}>Standard-Schließfrist</span>
        <InputNumber
          name="closeAfterHours"
          /*
           * BEWUSST OHNE `min`: `InputNumber` klemmt den Wert bei `changeOnBlur`
           * (Vorgabe) auf die Grenze: eine getippte 0 waere beim Verlassen des
           * Feldes still eine 1 — der Nutzer bekaeme nie zu sehen, dass seine
           * Eingabe verworfen wurde, und die Feldmeldung der Action („ganze
           * Stunden über 0") waere unerreichbar. Die Untergrenze gehoert dorthin,
           * wo sie auch ohne JavaScript gilt: in die Action.
           */
          step={1}
          suffix="Stunden"
          style={{ width: "100%", maxWidth: 240 }}
          defaultValue={
            state.ok
              ? (closeAfterHours ?? undefined)
              : fristVorbelegung(feldWert(state, "closeAfterHours", ""))
          }
          status={fristFehler ? "error" : undefined}
          aria-invalid={fristFehler ? true : undefined}
          aria-describedby={fristFehler ? "fb-frist-err" : undefined}
        />
        {fristFehler && (
          <span id="fb-frist-err" style={T.meta}>
            {fristFehler}
          </span>
        )}
        <span style={T.meta}>
          {`Vorgabe: ${DEFAULT_CLOSE_AFTER_HOURS} Stunden. Gilt für jede neu gestartete Umfrage — gerechnet ab Mitternacht nach dem Abendtag.`}
        </span>
      </label>
      <div>
        <Button htmlType="submit" loading={isPending} disabled={isPending} className="fb-block-mobil">
          Speichern
        </Button>
      </div>
    </form>
  );
}

/**
 * FOLGENSCHWER (§2.6 Punkt 3, §4.6). Zwei Zeilen, Erklaerung links, Knopf rechts.
 *
 * KEIN `type="primary" danger` — `colorError === colorPrimary === #c8000f`
 * (§4.9), ein gefuellter Gefahrenknopf waere pixelgleich mit dem normalen
 * Primaerknopf. Rot erscheint nur am Knopfrand und im okButton des Dialogs.
 *
 * ZWEI ZEILEN, ZWEI ZUSTAENDIGKEITEN. „Zugang neu vergeben" ist Sache der
 * Gruppenleitung — sie merkt als erste, dass der Aushang in falsche Haende
 * geraten ist. „Gruppe loeschen" ist ADMIN-SACHE (Spec-IA), und der Knopf ist
 * deshalb fuer Nicht-Admins GAR NICHT DA: `deleteGroupAction` haengt an
 * `guardAdmin` und wuerde ihn abweisen, ein Knopf, der beim Klick auf die
 * Fehlerseite fuehrt, ist schlimmer als kein Knopf.
 */
function Folgenschwer({
  groupId,
  name,
  abende,
  rueckmeldungen,
  istAdmin,
}: {
  groupId: number;
  name: string;
  abende: number;
  rueckmeldungen: number;
  istAdmin: boolean;
}) {
  const router = useRouter();
  const [secretLaeuft, starteSecret] = useTransition();
  const [loeschenLaeuft, starteLoeschen] = useTransition();
  const [offen, setOffen] = useState(false);
  const [getippt, setGetippt] = useState("");

  const neuesSecret = () =>
    starteSecret(async () => {
      const daten = new FormData();
      daten.set("id", String(groupId));
      await regenerateSecretAction(daten);
    });

  const loeschen = () =>
    starteLoeschen(async () => {
      const daten = new FormData();
      daten.set("id", String(groupId));
      await deleteGroupAction(daten);
      // Die Seite, auf der dieser Dialog stand, gibt es danach nicht mehr — ohne
      // Sprung stuende der Nutzer vor einem 404 seiner eigenen Aktion.
      router.push("/m/feedback");
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <span style={T.kicker}>FOLGENSCHWER</span>

      <Zeile
        titel="Zugang neu vergeben"
        erklaerung="Nötig, wenn der Aushang in falsche Hände geraten ist."
      >
        <Popconfirm
          title="Neues Secret erzeugen?"
          description="Bestehende QR-Codes und gedruckte Aushänge werden ungültig und müssen neu ausgehängt werden."
          okText="Secret neu erzeugen"
          cancelText="Abbrechen"
          /* §4.6/§4.9: Rot darf im okButton des Gefahrendialogs stehen. */
          okButtonProps={{ danger: true, loading: secretLaeuft }}
          onConfirm={neuesSecret}
        >
          <Button danger loading={secretLaeuft}>
            Neues Secret erzeugen
          </Button>
        </Popconfirm>
      </Zeile>

      {istAdmin && (
        <Zeile
          titel="Gruppe löschen"
          erklaerung="Die Gruppe, ihre Dienstabende und alle Rückmeldungen verschwinden."
        >
          <Button danger onClick={() => setOffen(true)}>
            Gruppe löschen
          </Button>
        </Zeile>
      )}

      {/*
       * `Modal` mit TIPPBESTAETIGUNG, nicht `Popconfirm` (§4.6): sobald der
       * Schaden eine ganze Gruppe oder alle gedruckten Aushaenge betrifft, muss
       * der Nutzer etwas tippen. Die Zahlen kommen aus der Seite — nie behauptet.
       */}
      <Modal
        open={istAdmin && offen}
        title="Gruppe löschen"
        okText="Gruppe löschen"
        cancelText="Abbrechen"
        okButtonProps={{
          danger: true,
          disabled: getippt.trim() !== name,
          loading: loeschenLaeuft,
        }}
        onOk={loeschen}
        onCancel={() => {
          setOffen(false);
          setGetippt("");
        }}
        destroyOnHidden
      >
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
          <p style={{ ...T.meta, margin: 0 }}>
            {`Löscht ${abende} ${abende === 1 ? "Dienstabend" : "Dienstabende"} und ${rueckmeldungen} ${
              rueckmeldungen === 1 ? "Rückmeldung" : "Rückmeldungen"
            } unwiderruflich.`}
          </p>
          <label style={FELD}>
            <span style={T.kicker}>Gruppennamen abtippen</span>
            <Input
              data-testid="loeschen-bestaetigung"
              value={getippt}
              onChange={(e) => setGetippt(e.target.value)}
              placeholder={name}
              autoComplete="off"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

/** Erklaerung links, Knopf rechts (§2.6) — am Handy gestapelt. */
function Zeile({
  titel,
  erklaerung,
  children,
}: {
  titel: string;
  erklaerung: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: SPACE.md,
        flexWrap: "wrap",
      }}
    >
      <div style={{ ...FELD, flex: "1 1 240px" }}>
        <span style={T.body}>{titel}</span>
        <span style={T.meta}>{erklaerung}</span>
      </div>
      {children}
    </div>
  );
}
