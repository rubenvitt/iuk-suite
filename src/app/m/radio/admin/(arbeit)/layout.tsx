// src/app/m/radio/admin/(arbeit)/layout.tsx
import { headers } from "next/headers";
import { requireRadioHost } from "../../_lib/host";
import { RADIO_NAV } from "../../_lib/nav";
import { requireRadioAdmin } from "../../_lib/zugang";
import { RadioVerwaltungsRahmen } from "../../_ui/RadioVerwaltungsRahmen";

/**
 * HUELLE 1 — die Arbeitsflaechen der Verwaltung (Spec:429-437).
 *
 * DER AEUSSERE HOST-RIEGEL LAEUFT VOR DEM PERSONEN-RIEGEL. So verraet ein anonymer Aufruf
 * auf einem fremden Host die Verwaltungsroute nicht ueber einen vorgeschalteten
 * Login-Umweg (1:1 aus `lagerbuch/verwaltung/(arbeit)/layout.tsx:7-10`).
 *
 * `requireRadioAdmin` BEHAELT SEINEN EIGENEN HOST-RIEGEL: Server Actions rufen die
 * Funktion OHNE dieses Layout auf und brauchen denselben Backstop (Pflicht 16). ⛔ Die
 * Zeile dort ist KEINE Redundanz zu dieser hier — wer sie fuer doppelt haelt und
 * entfernt, oeffnet die Luecke fuer jede kuenftige Verwaltungs-Action.
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
 * ⬜ RADIO_NAV IST HEUTE LEER. Planteil 4 fuellt sie mit den SIEBEN Eintraegen aus
 * Spec:4199-4203; bis dahin rendert die Shell eine Verwaltung ohne Modulnavigation —
 * richtig, weil es noch kein Ziel gibt (`_lib/nav.ts`). ⛔ Planteil 4 stellt dabei auch
 * die WEITERGABE um: `nav={radioNav(stufe)}` statt `nav={RADIO_NAV}` (Spec:4289).
 *
 * ⛔ AUFLAGE AN PLANTEIL 4 — DER PERSONEN-RIEGEL DIESER HUELLE WECHSELT.
 * Spec:4367 setzt `admin/(arbeit)/layout.tsx` verbindlich auf
 * `await requireRadioVerwaltung()`; hier steht heute `requireRadioAdmin()`, weil die
 * zweite Stufe erst mit `_lib/rollen.ts` und `requireRadioVerwaltung` in Planteil 4
 * entsteht (Spec:191, Spec:4420-4422). Solange das so bleibt, sperrt DIESES LAYOUT jede
 * Updater-Person mit 404, BEVOR irgendeine Seite laeuft — und typecheck, lint und build
 * bleiben dabei gruen. Der Wechsel ist deshalb kein Feinschliff, sondern die Bedingung
 * dafuer, dass die Betreiberentscheidung C.6/B4 (zwei Rollen) ueberhaupt wirkt.
 * `riegel.test.ts` (Klausel a) ist bereits pfadsensitiv gebaut und laesst BEIDE Namen in
 * diesem Zweig zu — der Wechsel macht den Scan also nicht rot. ⚠️ `admin/(druck)`
 * bleibt bei `requireRadioAdmin()` (Spec:4368).
 */
export default async function RadioArbeitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kopf = await headers();
  requireRadioHost(kopf);
  await requireRadioAdmin();     // ⬜ Planteil 4: -> await requireRadioVerwaltung() (Spec:4367)

  return <RadioVerwaltungsRahmen nav={RADIO_NAV}>{children}</RadioVerwaltungsRahmen>;
}
