import { Suspense } from "react";
import { TeilnehmerApp } from "./_ui/teilnehmer/TeilnehmerApp";

export default function Page() {
  return (
    <Suspense>
      <TeilnehmerApp ansicht="start" />
    </Suspense>
  );
}
