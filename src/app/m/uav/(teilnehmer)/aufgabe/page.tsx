import { Suspense } from "react";
import { TeilnehmerApp } from "../../_ui/teilnehmer/TeilnehmerApp";

export default function AufgabePage() {
  return (
    <Suspense>
      <TeilnehmerApp ansicht="aufgabe" />
    </Suspense>
  );
}
