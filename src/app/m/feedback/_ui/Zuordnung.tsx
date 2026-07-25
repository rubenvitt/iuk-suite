"use client";

import { useActionState, useTransition, type CSSProperties } from "react";
import { Button, Input, Table } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { addGroupLeaderAction, removeGroupLeaderAction } from "../actions";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { T } from "./typo";

/**
 * DIE ZUORDNUNG DER LEITUNG (Entwurf §2.6 Punkt 2, §4.4).
 *
 * Warum sie ueberhaupt existiert: `user_groups` war ausschliesslich per
 * Datenbankeingriff fuellbar — in Produktion sah damit kein Gruppenleiter seine
 * Gruppe, und eine Fehlzuordnung war nur mit `sqlite3` korrigierbar.
 *
 * Client-Insel aus zwei Gruenden: `useActionState` fuer „Kennung hinzufuegen"
 * (der Feldfehler muss ohne Seitenwechsel ans Feld, §4.4) und die
 * Entfernen-Aktion in `columns[].render` — eine Funktion, die eine Server
 * Component nicht uebergeben kann.
 *
 * KEIN eigener Guard hier: die Zone wird nur fuer `isFeedbackAdmin` gerendert,
 * und die Actions pruefen die Admin-Rolle SERVERSEITIG selbst. Ein verstecktes
 * Feld ist keine Berechtigung.
 */

export type ZuordnungPerson = {
  /** `sub` aus Pocket ID — das ist, was in `user_groups` steht. */
  userId: string;
  /** Anzeigename aus dem Nutzerverzeichnis; `null`, solange niemand angemeldet war. */
  name: string | null;
  email: string | null;
};

export type ZuordnungProps = {
  groupId: number;
  personen: ZuordnungPerson[];
};

/** Kennungen sind zum Vergleichen da, nicht zum Lesen: mono 13 (§2.6). */
const KENNUNG: CSSProperties = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 13,
};

export function Zuordnung({ groupId, personen }: ZuordnungProps) {
  const [state, formAction, isPending] = useActionState(addGroupLeaderAction, FORM_START);
  const [laeuft, starte] = useTransition();
  const fehler = feldFehler(state, "kennung");

  const entfernen = (userId: string) =>
    starte(async () => {
      const daten = new FormData();
      daten.set("groupId", String(groupId));
      daten.set("userId", userId);
      await removeGroupLeaderAction(daten);
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <span style={T.kicker}>LEITUNG</span>
      <Table<ZuordnungPerson>
        size="middle"
        rowKey="userId"
        pagination={false}
        dataSource={personen}
        /*
         * §4.3: leer ist ein Zustand, keine leere Tabelle.
         *
         * Der Satz sagt AUSDRUECKLICH nichts darueber, wer die Gruppe sehen kann,
         * denn diese Tabelle ist nur die eine von ZWEI Quellen:
         * `memberGroupIdsFor` (`queries.ts:38-55`) gewaehrt Zugang zusaetzlich
         * ueber das Fachgruppen-Attribut aus Pocket ID per Abgleich mit
         * `groups.slug` — im Projekt der uebliche Weg. Eine leere `user_groups`-
         * Liste ist also KEIN abgeschotteter Zustand, und ein Satz wie „bis dahin
         * sehen nur Admins diese Gruppe" waere die Falschaussage, die einen Admin
         * die Gruppe fuer dicht halten laesst. „Kann", nicht „hat": die Slugs sind
         * von hier aus nicht bekannt.
         */
        locale={{
          emptyText: (
            <span style={T.meta}>
              Niemand einzeln zugeordnet — Zugang kann zusätzlich über das
              Fachgruppen-Attribut aus Pocket ID bestehen.
            </span>
          ),
        }}
        columns={[
          {
            title: "Person",
            key: "person",
            render: (_: unknown, p: ZuordnungPerson) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {p.name ? (
                  <span style={T.body}>{p.name}</span>
                ) : (
                  <span style={T.meta}>hat sich noch nicht angemeldet</span>
                )}
                <span style={{ ...KENNUNG, color: "var(--fb-muted)" }}>{p.userId}</span>
              </div>
            ),
          },
          {
            title: "",
            key: "aktion",
            width: 110,
            align: "right",
            render: (_: unknown, p: ZuordnungPerson) => (
              /*
               * Kein `Popconfirm`: der Schaden trifft eine einzige Zuordnung und
               * ist mit demselben Formular eine Zeile weiter unten ruecknehmbar
               * (§4.6 verlangt eine Bestaetigung erst, wenn eine Gruppe oder alle
               * gedruckten Aushaenge betroffen sind).
               */
              <Button
                type="text"
                size="small"
                data-testid={`entfernen-${p.userId}`}
                loading={laeuft}
                onClick={() => entfernen(p.userId)}
              >
                Entfernen
              </Button>
            ),
          },
        ]}
      />

      <form
        action={formAction}
        className="fb-form"
        style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}
      >
        <input type="hidden" name="groupId" value={groupId} />
        <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
          <Input
            id="fb-kennung"
            name="kennung"
            style={{ flex: "1 1 220px" }}
            placeholder="Kennung oder E-Mail"
            defaultValue={feldWert(state, "kennung", "")}
            status={fehler ? "error" : undefined}
            aria-invalid={fehler ? true : undefined}
            aria-describedby={fehler ? "fb-kennung-err" : undefined}
          />
          <Button
            htmlType="submit"
            loading={isPending}
            disabled={isPending}
            className="fb-block-mobil"
          >
            Kennung oder E-Mail hinzufügen
          </Button>
        </div>
        {fehler ? (
          /* §4.4: Text in `--fb-muted`, NICHT rot — `status="error"` am `Input`
             faerbt nur einen 1px-Rahmen und bleibt als vierter Kanal erlaubt. */
          <p id="fb-kennung-err" style={{ ...T.meta, margin: 0 }}>
            {fehler}
          </p>
        ) : (
          <p style={{ ...T.meta, margin: 0 }}>
            Die Person muss sich einmal angemeldet haben, damit ihre E-Mail bekannt ist.
          </p>
        )}
      </form>
    </div>
  );
}
