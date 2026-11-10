"use client";

/**
 * DIE AKTIONEN EINER TABELLENZEILE (IDA-393).
 *
 * Gemessen bei 1280px: auf 29 Verwaltungsseiten ragte die Tabelle rechts aus ihrem Rahmen, und
 * abgeschnitten war fast immer die Aktionsspalte — ausgeschriebene Knöpfe nebeneinander („Link
 * kopieren", „Neuer Link", „Bearbeiten", „Entfernen" …), die zugleich die Zeile auf 77px trieben.
 *
 * DIE REGEL: eine Aktion bleibt ein Knopf mit Text. Ab zwei steht ein Knopf mit dem
 * „Mehr"-Zeichen da, und die Aktionen liegen in seinem Menü — eine Zeile ist damit so breit
 * wie EIN Bedienelement, egal wie viele es gibt. Wer eine Aktion trotzdem sichtbar neben dem
 * Menü braucht, gibt sie als `haupt` (höchstens eine).
 *
 * ⚠️ BESTÄTIGEN STATT `Popconfirm`. Ein Menüeintrag verschwindet beim Klick mitsamt dem Menü;
 * ein `Popconfirm` um ihn hätte keinen Anker mehr. Wer `bestaetigen` setzt, bekommt einen Dialog
 * mit denselben Feldern (Titel, Satz, Knopftext). Der Fokus geht danach an den Menüknopf der
 * Zeile zurück — aber nur, wenn er nicht inzwischen woanders steht (Falle 24).
 *
 * Die Spalte selbst baut `aktionsSpalte` (`aktionsspalte.ts`); `Datentabelle` heftet sie rechts an.
 */

import { useRef, useState, type ReactNode } from "react";
import { App, Button, Dropdown, Modal, type MenuProps } from "antd";
import { Icons8Ikone, type Icons8Name } from "../ikonen/Icons8Ikone";

export type Zeilenaktion = {
  key: string;
  label: string;
  ikone?: Icons8Name;
  onClick?: () => void | Promise<void>;
  /** Ein Ziel statt eines Klicks — der Eintrag wird ein echter Anker. */
  href?: string;
  /** Mit `href`: in neuem Tab öffnen. */
  neuesFenster?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Fehlt es (`false`), steht die Aktion gar nicht da — bequemer als ein Filter beim Aufrufer. */
  sichtbar?: boolean;
  bestaetigen?: { titel: ReactNode; text?: ReactNode; ok: string };
};

export type ZeilenaktionenProps = {
  /** Wofür die Aktionen gelten — der Menüknopf heißt „Aktionen für <name>". */
  name: string;
  aktionen: readonly Zeilenaktion[];
  /** Eine Aktion, die NEBEN dem Menü als Knopf mit Text stehen bleibt. */
  haupt?: Zeilenaktion;
  /** Läuft gerade etwas für diese Zeile? Der Menüknopf zeigt es und ist gesperrt. */
  laeuft?: boolean;
};

function fokusVerloren(): boolean {
  const a = document.activeElement;
  return a === null || a === document.body || a.closest('[role="dialog"]') !== null;
}

function Ziel({ aktion }: { aktion: Zeilenaktion }) {
  // Gesperrt heißt auch: keine Adresse. Ein Anker bliebe per Mittelklick oder Tastatur erreichbar.
  if (!aktion.href || aktion.disabled) return <>{aktion.label}</>;
  return (
    <a href={aktion.href} {...(aktion.neuesFenster ? { target: "_blank", rel: "noreferrer" } : {})}>
      {aktion.label}
    </a>
  );
}

export function Zeilenaktionen({ name, aktionen, haupt, laeuft = false }: ZeilenaktionenProps) {
  const { message } = App.useApp();
  const [frage, setFrage] = useState<Zeilenaktion | null>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const sichtbar = aktionen.filter((a) => a.sichtbar !== false);
  const hauptSichtbar = haupt && haupt.sichtbar !== false ? haupt : undefined;

  // Eine Aktion, die wirft (Netz weg, Recht entzogen), meldet sich, statt still liegen zu bleiben.
  const starte = async (a: Zeilenaktion) => {
    try {
      await a.onClick?.();
    } catch {
      void message.error(`„${a.label}“ ging nicht. Bitte die Seite neu laden.`);
    }
  };

  const ausfuehren = (a: Zeilenaktion) => {
    if (a.bestaetigen) setFrage(a);
    else void starte(a);
  };

  const einzelknopf = (a: Zeilenaktion) => (
    <Button
      key={a.key}
      icon={a.ikone ? <Icons8Ikone name={a.ikone} groesse={16} /> : undefined}
      danger={a.danger}
      disabled={a.disabled || laeuft}
      href={a.href}
      target={a.href && a.neuesFenster ? "_blank" : undefined}
      onClick={a.href ? undefined : () => ausfuehren(a)}
      ref={knopf}
    >
      {a.label}
    </Button>
  );

  const items: MenuProps["items"] = sichtbar.map((a) => ({
    key: a.key,
    label: <Ziel aktion={a} />,
    icon: a.ikone ? <Icons8Ikone name={a.ikone} groesse={16} /> : undefined,
    danger: a.danger,
    disabled: a.disabled,
  }));

  let inhalt: ReactNode;
  if (sichtbar.length === 0) inhalt = null;
  else if (sichtbar.length === 1 && !hauptSichtbar) inhalt = einzelknopf(sichtbar[0]!);
  else {
    inhalt = (
      <Dropdown
        trigger={["click"]}
        disabled={laeuft}
        menu={{
          items,
          onClick: ({ key }) => {
            const a = sichtbar.find((x) => x.key === key);
            if (a && !a.href) ausfuehren(a);
          },
        }}
      >
        {/* KEIN `size` (Falle 4): 44px wie jeder Knopf der Arbeitsfläche. */}
        <Button ref={knopf} aria-label={`Aktionen für ${name}`} loading={laeuft} icon={<Icons8Ikone name="more" groesse={18} />} />
      </Dropdown>
    );
  }

  return (
    <span data-rolle="zeilenaktionen" style={{ display: "inline-flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
      {hauptSichtbar ? (
        <Button
          icon={hauptSichtbar.ikone ? <Icons8Ikone name={hauptSichtbar.ikone} groesse={16} /> : undefined}
          danger={hauptSichtbar.danger}
          disabled={hauptSichtbar.disabled || laeuft}
          href={hauptSichtbar.href}
          onClick={hauptSichtbar.href ? undefined : () => ausfuehren(hauptSichtbar)}
        >
          {hauptSichtbar.label}
        </Button>
      ) : null}
      {inhalt}
      <Modal
        open={frage !== null}
        title={frage?.bestaetigen?.titel}
        okText={frage?.bestaetigen?.ok}
        cancelText="Abbrechen"
        okButtonProps={{ danger: frage?.danger }}
        focusable={{ focusTriggerAfterClose: false }}
        onOk={() => { const a = frage; setFrage(null); if (a) void starte(a); }}
        onCancel={() => setFrage(null)}
        afterClose={() => { if (fokusVerloren()) knopf.current?.focus(); }}
        destroyOnHidden
      >
        {frage?.bestaetigen?.text}
      </Modal>
    </span>
  );
}
