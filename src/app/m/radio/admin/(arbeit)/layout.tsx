// src/app/m/radio/admin/(arbeit)/layout.tsx
import { headers } from "next/headers";
import { requireRadioHost } from "../../_lib/host";
import { radioNav } from "../../_lib/nav";
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
 * docs/radio-portierung-analyse.md:1542-1545): `core/routing.ts:68-76` gatet nach dem
 * Modul aus dem Segment und unterscheidet `/m/radio/` und `/m/radio/admin/...` NICHT.
 * Diese zwei Zeilen sind der einzige Traeger. `riegel.test.ts` (Klausel a) haelt sie
 * fest, INKLUSIVE ihrer Reihenfolge.
 *
 * ✅ ⬜ Z-L1 / ⬜ V-L3 IST AM 2026-08-26 ABGELESEN (Aufgabe V23, `riegel.test.ts:50-88`): die
 * zwei Zeilen unten sind WIRKSAM. Schritt E hat den Riegel in `admin/(arbeit)/page.tsx:91`
 * entfernt und `/admin` blieb fuer eine gruppenlose Sitzung 404 — DIESES Layout traegt.
 *
 * ✅ DIE NAVIGATION TRAEGT DIE RECHTESTUFE, SEIT AUFGABE V4 — und die zwei Haelften gehoeren
 * zusammen (NS-Z9): der Riegel LIEFERT die Stufe (`requireRadioVerwaltung` gibt
 * `{ viewer, rolle }`, `_lib/zugang.ts`), und `radioNav(rolle)` blendet danach die drei
 * Menuepunkte aus, die nur die Admin-Stufe erreicht (Spec:4203-4210, Spec:4289). ⛔ WER DIE
 * DESTRUKTURIERUNG SPAETER FUER UEBERFLUESSIG HAELT und wieder `radioNav("admin")` einsetzt,
 * zeigt jeder Updater-Person drei Menuepunkte, die in ein `notFound()` fuehren — bei
 * gruenem typecheck, lint und build. Der Waechter darueber ist `_lib/nav.test.ts`
 * („radioNav(updater) liefert genau vier Eintraege") zusammen mit dieser Zeile.
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
  const { rolle } = await requireRadioVerwaltung();   // Spec:4367 — die Stufe traegt die Navigation

  return <RadioVerwaltungsRahmen nav={radioNav(rolle)}>{children}</RadioVerwaltungsRahmen>;
}
