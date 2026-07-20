import { Suspense } from "react";
import { QrView } from "@/app/m/qr/QrView";

/**
 * Bewusst ohne die Server-Prop `searchParams`: Die Seite bleibt dadurch
 * statisch vorgerendert und der Service Worker kann sie EINMAL query-los
 * cachen — offline bedient dieselbe Fassung jeden Payload, weil `QrView` die
 * Parameter aus der Adresszeile liest.
 *
 * Die `<Suspense>`-Grenze ist dabei Pflicht, nicht Zierde: `useSearchParams()`
 * in einer statisch vorgerenderten Route lässt Next ohne sie mit
 * `missing-suspense-with-csr-bailout` fehlschlagen.
 */
export default function QrViewPage() {
  return (
    <Suspense>
      <QrView />
    </Suspense>
  );
}
