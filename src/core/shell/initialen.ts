/**
 * Bis zu zwei Initialen aus einem Namen, `?` ohne Namen. Rueckfall fuer das
 * Profilbild aus Pocket ID — im Nutzermenue (`SuiteNav`) und auf der
 * Profilseite (`ProfilAnsicht`), deshalb hier und nicht in einer der beiden.
 */
export function initialen(name: string | null): string {
  return (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
