"use client";

import { useFormStatus } from "react-dom";
import { Button } from "antd";

/**
 * DER SPERRENDE ZUSTAND DES AKTUALISIEREN-KNOPFS (§4.7,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3814-3818`).
 *
 * ⛔ WARUM DIESE DATEI UEBERHAUPT EXISTIERT — eine benannte Abweichung von der Dateiliste des
 * Aufgabenbriefs, kein Zusatz aus Bequemlichkeit: `useFormStatus` ist ein CLIENT-Hook und
 * liest den Zustand des `<form>`, in dem die aufrufende Komponente STEHT. Die Uebersicht ist
 * eine async Server Component; dort kann der Hook nicht laufen, und ein Knopf, der ihn in
 * derselben Komponente wie sein eigenes `<form>` riefe, saehe den Zustand ebenfalls nicht.
 * Der Brief schreibt den Knopf unter `geraete/page.tsx` — in dieser Bauform ist das nicht
 * baubar. Dieselbe Klasse wie der vernarbte Praezedenzfall `cookies().delete()` in einer
 * Server Component: eine Zusage, welche die Bauform nicht halten kann.
 *
 * ⛔ DAS `<form action={listeAktualisieren}>` STEHT DESHALB IN DER SERVER COMPONENT, dieser
 * Knopf DARIN. Das ist die vorgesehene Aufteilung, nicht ein Umweg: die Server Action wird
 * dort DIREKT importiert (Falle 9, `CLAUDE.md:52-70` — eine gewoehnliche Funktion darf die
 * RSC-Grenze nicht ueberqueren, eine Server Action nur als direkter Import), und ueber diese
 * Grenze reist gar keine Prop.
 *
 * ⛔ KEIN `useState`-FEHLERKASTEN MIT FUENF-SEKUNDEN-SELBSTSCHLUSS mehr
 * (`radio-inventar/apps/frontend/src/components/features/DeviceList.tsx:19`, `:35-49`,
 * `:143-165`): ein fehlgeschlagenes Neuladen ist genau der Fall, den man nicht nach fuenf
 * Sekunden verstecken sollte. `listeAktualisieren` hat ausserdem keinen Fehlerkanal — bei
 * fehlendem Zugang tut sie NICHTS (`_actions/ausleihe.ts:342-346`).
 *
 * ⛔ KEIN ZEICHEN, SONDERN EINE BESCHRIFTUNG (Entscheidung E5, Spec:3750-3752): `RefreshCw`
 * faellt weg. ⛔ Und kein `@ant-design/icons` — in KEINER Datei dieses Moduls (Falle 7,
 * `CLAUDE.md:31-44`), `"use client"` behebt das nicht, es macht es still.
 *
 * ⛔ KEIN `size` (Falle 4, `CLAUDE.md:18-22`): die Flaeche laeuft ohne `FullShell` und erbt
 * `controlHeight: TAP = 56` (`src/core/theme/theme.ts:50-51`); `size="large"` waere 72.
 */
export function AktualisierenKnopf() {
  /*
   * ⚠️ `pending` SPERRT UND ZEIGT ZUGLEICH. `loading` allein liesse antd den Knopf zwar
   * ausgrauen, aber ein zweites Absenden ueber die Tastatur bliebe moeglich; `disabled`
   * allein liesse die Person raten, ob etwas passiert.
   */
  const { pending } = useFormStatus();
  return (
    <Button htmlType="submit" loading={pending} disabled={pending} data-rolle="radio-aktualisieren">
      Aktualisieren
    </Button>
  );
}
