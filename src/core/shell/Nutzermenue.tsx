"use client";

import { useState } from "react";
import { Avatar, Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { signOut } from "next-auth/react";

import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { oeffneRueckmeldung } from "@/core/rueckmeldung/flyinZustand";
import type { Rueckmeldeweg } from "@/core/rueckmeldung/konfiguration";
import { initialen } from "@/core/shell/initialen";
import { AVATAR_FARBEN, PROFIL_PFAD } from "@/core/shell/profil";
import { SCHRIFT } from "@/core/theme/schrift";
import s from "./menue.module.css";

/**
 * DAS AVATAR-MENÜ — Name, Profil, Feedback, Abmelden, Modulstand. Herausgelöst aus `SuiteNav`
 * (IDA-347, Etappe 2), weil es seither zwei Hüllen tragen: die Kopfzeile von `MinimalShell`
 * (`SuiteNav`) und die Seitenleiste von `FullShell` (`SuiteLeiste`). Eine Abschrift liefe beim
 * nächsten Eintrag auseinander.
 *
 * Die Begründungen der einzelnen Einträge stehen unverändert an Ort und Stelle:
 *
 * - DER ZUSTAND WIRD SELBST GEHALTEN, obwohl `Dropdown` das allein könnte: nur so lässt sich
 *   `aria-expanded` am Auslöser setzen.
 * - `trigger: click`, nicht antds `hover`: auf einem Touchgerät gibt es kein Hover, und dieses Menü
 *   trägt den einzigen Abmeldeweg.
 * - KEIN `forceRender`: antd rendert das Menü per Portal nach `document.body`, und serverseitig gibt
 *   es kein `document`. Geschlossen legt `@rc-component/portal` nichts an — das Menü ist auf dem
 *   Server nur der Knopf und braucht kein `montiert`-Gatter.
 * - PROFIL und FEEDBACK sind echte `<a>`: das Profil liegt im Portal auf einem anderen Host, das
 *   Formular auf einem fremden. Kein Ziel, kein Eintrag — ein toter Link ist schlimmer als keiner.
 * - ABMELDEN läuft über `oidc-signout`, damit auch die Sitzung bei Pocket ID endet; `void`, damit
 *   ein scheiternder Aufruf keine unbehandelte Ablehnung hinterlässt.
 * - Anonym steht an derselben Stelle ein Anmelden-Knopf, und KEINE Modulliste.
 *
 * `testIdZusatz`: die Seitenleiste und das Blatt (Telefon) stehen gleichzeitig im Baum. Zwei
 * Knoten mit `data-testid="nutzermenue"` wären für Playwright eine Strict-Mode-Verletzung —
 * dieselbe Regel wie beim Theme-Umschalter (`theme-toggle-drawer`).
 */
export function Nutzermenue({
  angemeldet,
  userName,
  userBild = null,
  profilHref,
  rueckmeldeweg,
  modulStand = null,
  mitNamen = false,
  placement = "bottomRight",
  testIdZusatz = "",
}: {
  angemeldet: boolean;
  userName: string | null;
  userBild?: string | null;
  profilHref: string | null;
  rueckmeldeweg: Rueckmeldeweg | null;
  modulStand?: string | null;
  /** Der Name steht sichtbar neben dem Avatar (Seitenleiste). */
  mitNamen?: boolean;
  placement?: "bottomRight" | "topLeft" | "topRight";
  testIdZusatz?: string;
}) {
  const [offen, setOffen] = useState(false);

  if (!angemeldet) {
    return (
      <Button
        type="text"
        data-testid={`anmelden${testIdZusatz}`}
        href="/login"
        icon={<Icons8Ikone name="login" />}
      >
        Anmelden
      </Button>
    );
  }

  const profilEintrag = profilHref
    ? [
        {
          key: "profil",
          label: (
            <a data-testid="profil-link" href={`${profilHref}${PROFIL_PFAD}`}>
              Profil
            </a>
          ),
        },
      ]
    : [];

  const feedbackEintrag = !rueckmeldeweg
    ? []
    : rueckmeldeweg.art === "link"
      ? [
          {
            key: "feedback",
            label: (
              <a data-testid="feedback-link" href={rueckmeldeweg.url} target="_blank" rel="noopener noreferrer">
                Feedback geben
              </a>
            ),
          },
        ]
      : [
          {
            // IDA-214: derselbe Eintrag öffnet das Flyin der Suite statt eines Tabs.
            key: "feedback",
            label: "Feedback geben",
            "data-testid": "feedback-link",
            onClick: () => {
              setOffen(false);
              oeffneRueckmeldung();
            },
          },
        ];

  const abmeldenEintrag = {
    key: "abmelden",
    icon: <Icons8Ikone name="logout" />,
    label: "Abmelden",
    "data-testid": "abmelden",
    onClick: () => void signOut({ callbackUrl: "/api/auth/oidc-signout" }),
  };

  // Die Modulversion, ganz unten und gedämpft (IDA-328): eine Auskunft, keine Handlung.
  const standEintrag: MenuProps["items"] = modulStand
    ? [
        { type: "divider" as const },
        {
          key: "modulstand",
          disabled: true,
          label: (
            <span data-testid="modul-version" style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)" }}>
              {modulStand}
            </span>
          ),
        },
      ]
    : [];

  const eintraege: MenuProps["items"] = userName
    ? [
        {
          key: "nutzer",
          type: "group",
          label: <span data-testid="nutzername">{userName}</span>,
          children: [...profilEintrag, ...feedbackEintrag, abmeldenEintrag],
        },
        ...standEintrag,
      ]
    : [...profilEintrag, ...feedbackEintrag, abmeldenEintrag, ...standEintrag];

  // `alt=""`: der Name steht schon im `aria-label` des Knopfes.
  const avatar = (
    <Avatar size="small" src={userBild ?? undefined} alt="" style={AVATAR_FARBEN}>
      {initialen(userName)}
    </Avatar>
  );

  return (
    <Dropdown
      menu={{ items: eintraege }}
      trigger={["click"]}
      placement={placement}
      open={offen}
      onOpenChange={setOffen}
    >
      <Button
        type="text"
        shape={mitNamen ? undefined : "circle"}
        className={mitNamen ? s.nutzerKnopf : undefined}
        data-testid={`nutzermenue${testIdZusatz}`}
        aria-label={userName ? `Nutzermenü — ${userName}` : "Nutzermenü"}
        aria-haspopup="menu"
        aria-expanded={offen}
        icon={avatar}
      >
        {mitNamen && userName ? <span className={s.nutzerName}>{userName}</span> : null}
      </Button>
    </Dropdown>
  );
}
