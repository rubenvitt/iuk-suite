"use client";

import { useActionState, useRef } from "react";
import { Button, Input, Popconfirm } from "antd";
import {
  fertigMeldenAction,
  startenAction,
  wiederaufnehmenAction,
  zurueckziehenAction,
  zuruecksetzenAction,
} from "../actions";
import type { AufgabeRow } from "../_db/schema";
import type { AktionsOptionen } from "../_lib/aktionsOptionen";
import { NACHWEIS_ART_TEXT } from "../_lib/anzeige";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";
import { FreigabeAktionen } from "./FreigabeZone";

/*
 * DIE AKTIONSZONE VON `/a/<id>` (Spec §8.4, Aufgabe 16) — trägt NUR, was diese Person mit dieser
 * Aufgabe in DIESEM Zustand tun darf. `optionen` kommt FERTIG BERECHNET von `a/[id]/page.tsx`
 * herein (`_lib/aktionsOptionen.ts`, das `uebergang()` je Aktion ruft) — diese Datei entscheidet
 * selbst NICHTS ueber Berechtigung oder Zustand, sie rendert nur, was schon entschieden ist.
 *
 * KEIN IMPORT AUS `_lib/zugang.ts` ODER `_lib/lebenszyklus.ts` HIER: `lebenszyklus.ts` importiert
 * `zugang.ts`, und die importiert `@/core/auth` (next-auth) — ein Import in dieser Client-Insel
 * zoege next-auths serverseitigen Code ins Client-Bundle (dasselbe Muster wie
 * `_ui/PersonenTabelle.tsx`s Kopfkommentar zu `istAktivHeute`).
 *
 * FREIGEBEN/ZURUECKWEISEN KOMMEN AUS `FreigabeZone.tsx`s EXPORTIERTER `FreigabeAktionen` —
 * dieselbe Bestaetigungspflicht-mit-Text-Logik wie auf `/freigaben`, keine zweite Fassung
 * (Brief: „zwei Fassungen derselben Zone liefen auseinander").
 *
 * `optionen.freigeben` UND `optionen.zurueckweisen` SIND IMMER GLEICH (`_lib/lebenszyklus.ts`s
 * `TABELLE`: beide Zeilen teilen sich `wer: darfFreigeben`) — die Zone prueft deshalb nur EINES der
 * beiden Felder, um zu entscheiden, ob `FreigabeAktionen` ueberhaupt erscheint.
 *
 * ZURUECKZIEHEN IST BESTAETIGUNGSPFLICHTIG (Spec §9.9) — Vorbild `_ui/PersonenTabelle.tsx`s
 * „Beenden": `Popconfirm` plus ein `ref` aufs Formular, `onConfirm` loest `requestSubmit()` aus.
 * `zurueckziehenAction` LOESCHT DIE AUFGABE — nach dem Absenden existiert `/a/<id>` fuer diese Id
 * nicht mehr, und die naechste Revalidierung dieser Route zeigt `notFound()`. Das ist keine
 * Regression dieser Aufgabe: `zurueckziehenAction` (Aufgabe 9) redirectet heute nirgendwohin, und
 * eine solche Aenderung an einer bereits getesteten, modulweiten Action ist NICHT Teil dieses
 * Auftrags — im Bericht als bekannte, kleine Rauheit vermerkt statt still mitgezogen.
 */
export function AktionsZone({
  aufgabe,
  optionen,
}: {
  aufgabe: AufgabeRow;
  optionen: AktionsOptionen;
}) {
  const keineAktion =
    !optionen.starten &&
    !optionen.zuruecksetzen &&
    !optionen.fertig &&
    !optionen.freigeben &&
    !optionen.wiederaufnehmen &&
    !optionen.zurueckziehen;

  if (keineAktion) {
    return <p>Für diese Aufgabe ist derzeit keine Aktion möglich.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      {optionen.starten ? (
        <EinfacheAktion aufgabeId={aufgabe.id} aktion={startenAction} beschriftung="Bearbeitung starten" />
      ) : null}
      {optionen.zuruecksetzen ? (
        <EinfacheAktion
          aufgabeId={aufgabe.id}
          aktion={zuruecksetzenAction}
          beschriftung="Bearbeitung zurücksetzen"
        />
      ) : null}
      {optionen.fertig ? <FertigMeldenFormular aufgabe={aufgabe} /> : null}
      {optionen.freigeben ? <FreigabeAktionen aufgabe={aufgabe} /> : null}
      {optionen.wiederaufnehmen ? (
        <EinfacheAktion
          aufgabeId={aufgabe.id}
          aktion={wiederaufnehmenAction}
          beschriftung="Bearbeitung wieder aufnehmen"
        />
      ) : null}
      {optionen.zurueckziehen ? <ZurueckziehenKnopf aufgabeId={aufgabe.id} /> : null}
    </div>
  );
}

/**
 * DIE VIER STATUSWECHSEL OHNE EIGENES FORMULARFELD (starten, zuruecksetzen, wiederaufnehmen —
 * `optionen.freigeben`/`zurueckziehen` haben eigene Komponenten) TEILEN SICH DIESE FORM: ein
 * natives `<form action={...}>` mit genau einem versteckten Feld, wie
 * `_ui/EinstiegBufdi.tsx`s `posteingangAktionen` es fuer „Annehmen" schon tut.
 */
function EinfacheAktion({
  aufgabeId,
  aktion,
  beschriftung,
}: {
  aufgabeId: string;
  aktion: (formData: FormData) => Promise<void>;
  beschriftung: string;
}) {
  return (
    <form action={aktion}>
      <input type="hidden" name="aufgabeId" value={aufgabeId} />
      <Button type="primary" htmlType="submit">
        {beschriftung}
      </Button>
    </form>
  );
}

/**
 * „FERTIG MELDEN" (Spec §5.3, §8.4) — DIE PFLICHT IST EINE UNTERGRENZE: `nachweisArt === "bild"`
 * verlangt heute eine Datei, die diese Oberflaeche NOCH NICHT anbietet (Aufgabe 17-19); die
 * Server-Action lehnt in diesem Fall MIT FELDFEHLER `nachweis` ab (`actions.ts`s
 * `fertigMeldenAction`-Kopfkommentar) — NICHT `nachweisText`. BEIDE SCHLUESSEL WERDEN GERENDERT:
 * wuerde nur `nachweisText` gelesen, verschwaende der Bild-Pflicht-Fehler nach dem Absenden
 * spurlos — genau die stille Fehlerklasse, die dieses Modul immer wieder gefangen hat.
 */
function FertigMeldenFormular({ aufgabe }: { aufgabe: AufgabeRow }) {
  const [state, formAction, isPending] = useActionState(fertigMeldenAction, FORM_START);
  const nachweisTextFehler = feldFehler(state, "nachweisText");
  const nachweisFehler = feldFehler(state, "nachweis");

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, maxWidth: 480 }}
    >
      <input type="hidden" name="aufgabeId" value={feldWert(state, "aufgabeId", aufgabe.id)} />

      {aufgabe.nachweisPflicht ? (
        <p style={{ margin: 0, fontSize: 12 }}>
          Nachweispflicht: {NACHWEIS_ART_TEXT[aufgabe.nachweisArt]}
          {aufgabe.nachweisArt === "bild"
            ? " — Bildupload folgt in einer späteren Aufgabe, bis dahin nur per Text erfüllbar."
            : ""}
        </p>
      ) : null}

      <div>
        <label htmlFor="az-nachweistext" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Nachweis (Text)
        </label>
        <Input.TextArea
          id="az-nachweistext"
          name="nachweisText"
          autoSize={{ minRows: 3, maxRows: 8 }}
          defaultValue={feldWert(state, "nachweisText", "")}
          status={nachweisTextFehler ? "error" : undefined}
          aria-invalid={nachweisTextFehler ? true : undefined}
          aria-describedby={nachweisTextFehler ? "az-nachweistext-err" : undefined}
        />
        {nachweisTextFehler ? (
          <p id="az-nachweistext-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {nachweisTextFehler}
          </p>
        ) : null}
      </div>

      {nachweisFehler ? <p style={{ margin: 0 }}>{nachweisFehler}</p> : null}

      <Button
        type="primary"
        htmlType="submit"
        loading={isPending}
        disabled={isPending}
        style={{ alignSelf: "flex-start" }}
      >
        Fertig melden
      </Button>
    </form>
  );
}

function ZurueckziehenKnopf({ aufgabeId }: { aufgabeId: string }) {
  const formular = useRef<HTMLFormElement>(null);
  return (
    <form action={zurueckziehenAction} ref={formular}>
      <input type="hidden" name="aufgabeId" value={aufgabeId} />
      <Popconfirm
        title="Aufgabe zurückziehen?"
        description="Die Aufgabe wird samt ihrem gesamten Verlauf gelöscht. Das lässt sich nicht rückgängig machen."
        okText="Zurückziehen"
        cancelText="Abbrechen"
        onConfirm={() => formular.current?.requestSubmit()}
      >
        <Button danger data-testid="zurueckziehen">
          Zurückziehen
        </Button>
      </Popconfirm>
    </form>
  );
}
