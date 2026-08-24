// src/app/m/radio/admin/(arbeit)/layout.tsx
import { headers } from "next/headers";
import { requireRadioHost } from "../../_lib/host";
import { RADIO_NAV } from "../../_lib/nav";
import { requireRadioVerwaltung } from "../../_lib/zugang";
import { RadioVerwaltungsRahmen } from "../../_ui/RadioVerwaltungsRahmen";

/**
 * HUELLE 1 — die Arbeitsflaechen der Verwaltung (Spec:429-437).
 *
 * DER AEUSSERE HOST-RIEGEL LAEUFT VOR DEM PERSONEN-RIEGEL. So verraet ein anonymer Aufruf
 * auf einem fremden Host die Verwaltungsroute nicht ueber einen vorgeschalteten
 * Login-Umweg (1:1 aus `lagerbuch/verwaltung/(arbeit)/layout.tsx:7-10`).
 *
 * DER PERSONEN-RIEGEL BEHAELT SEINEN EIGENEN HOST-RIEGEL: Server Actions rufen ihn OHNE
 * dieses Layout auf und brauchen denselben Backstop (Pflicht 16). ⛔ Die Zeile dort ist
 * KEINE Redundanz zu dieser hier — wer sie fuer doppelt haelt und entfernt, oeffnet die
 * Luecke fuer jede kuenftige Verwaltungs-Action. Sie steht seit V3 in `riegelAufStufe`,
 * dem gemeinsamen Koerper beider werfenden Riegel (`_lib/zugang.ts`, Entscheidung E-V1).
 *
 * ⚠️ MIT `requiresAuth: false` HAT `/admin` NULL MIDDLEWARE-GATING (Falle 22,
 * docs/radio-portierung-analyse.md:1542-1545): `core/routing.ts:58-66` gatet nach dem
 * Modul aus dem Segment und unterscheidet `/m/radio/` und `/m/radio/admin/...` NICHT.
 * Diese zwei Zeilen sind der einzige Traeger. `riegel.test.ts` (Klausel a) haelt sie
 * fest, INKLUSIVE ihrer Reihenfolge.
 *
 * ⬜ Z-L1: solange unter dieser Group KEINE `page.tsx` liegt, rendert Next dieses Layout
 * nicht — die Wirksamkeit der zwei Zeilen ist damit in Planteil 2 UNBEWIESEN. Abgelesen
 * wird sie in Planteil 4, beim ersten echten Abruf gegen `/admin`.
 *
 * ⬜ RADIO_NAV IST HEUTE LEER, UND DIE WEITERGABE WECHSELT ERST MIT AUFGABE V4.
 * V4 fuellt die Navigation mit den Eintraegen aus Spec:4199-4203 und stellt diese Zeile auf
 * `nav={radioNav(rolle)}` um (Spec:4289) — dann, und erst dann, wird aus dem Aufruf unten
 * `const { rolle } = await requireRadioVerwaltung();`. ⛔ HIER IST DAS NICHT VORWEGZUNEHMEN:
 * `radioNav` existiert noch nicht, und eine Bindung `rolle`, die niemand liest, ist ein
 * Lint-Fehler. Bis dahin rendert die Shell eine Verwaltung ohne Modulnavigation — richtig,
 * weil es noch kein Ziel gibt (`_lib/nav.ts`).
 *
 * ✅ DER PERSONEN-RIEGEL DIESER HUELLE IST IN AUFGABE V3 GEWECHSELT (Spec:4367 setzt
 * `admin/(arbeit)/layout.tsx` verbindlich auf `await requireRadioVerwaltung()`). Bis dahin
 * stand hier `requireRadioAdmin()`, und das sperrte jede Updater-Person mit 404, BEVOR
 * irgendeine Seite lief — bei gruenem typecheck, lint und build. Der Wechsel ist deshalb
 * kein Feinschliff, sondern die Bedingung dafuer, dass die Betreiberentscheidung C.6/B4
 * (zwei Rollen) ueberhaupt wirkt.
 * ⛔ KLAUSEL (a) VON `riegel.test.ts` BEWACHT DIESE RICHTUNG NICHT: sie ist pfadsensitiv
 * gebaut und laesst im `(arbeit)`-Zweig BEIDE Namen zu — eine faelschlich ABGESENKTE oder
 * ANGEHOBENE Fassung dieser Zeile faengt sie strukturell nicht. Der Waechter ist deshalb eine
 * eigene, NAMENTLICHE Zusicherung, in V3 danebengestellt: „die zwei Huellen tragen JE IHRE
 * Stufe, namentlich" (`riegel.test.ts`, im selben `describe` wie Klausel (a)).
 * ⚠️ `admin/(druck)` bleibt bei `requireRadioAdmin()` (Spec:4368) — dort liegen die
 * Zugangscodes im Klartext.
 */
export default async function RadioArbeitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kopf = await headers();
  requireRadioHost(kopf);
  await requireRadioVerwaltung();   // Spec:4367 — ⛔ OHNE Destrukturierung, siehe ⬜ zu V4 oben

  return <RadioVerwaltungsRahmen nav={RADIO_NAV}>{children}</RadioVerwaltungsRahmen>;
}
