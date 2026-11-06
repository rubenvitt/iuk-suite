/**
 * Die festen Kennungen aus `_db/migrations/0001_startbestand.sql` (UUIDv5). Demodaten und Tests finden über sie
 * die Gruppen, Arten und Prüfarten, die jede Datenbank des Moduls von Anfang an hat.
 */
export const START = {
  gruppe: { technik: "c7ccd7ce-32aa-51cf-aee2-50a529dfa2e9", iuk: "3c4eb323-d210-59c9-a3b0-c1b7c410f13d" },
  art: {
    stromerzeuger: "fd1af1ab-5190-5347-969d-cd0a31d9b6c4",
    heizung: "041a7030-e246-5614-9946-20bd4d2f490c",
    akku: "32104ecc-dd27-59e1-ac96-15ee83b96707",
    it: "d0fd6334-2f77-5dde-a0df-613133afdf84",
    /** `0005_materialkisten.sql` (IDA-335). */
    kiste: "a538c43d-3b3d-5b99-9509-e4f850a72e44",
  },
  /**
   * Der Katalog nach `0006_pruefarten.sql` (IDA-368): gleichnamige Fristen der Arten wurden eine Prüfart und
   * behielten die ID der ersten (Stromerzeuger vor Heizung vor Akku vor IT).
   */
  pruefart: {
    quartal: "d06ab9f8-8d7d-55c8-a1ab-17e081c17795",
    wartung: "0a60d30a-b5c2-5b6e-82bb-57fd37fbb1ab",
    dguv: "0b3bc63a-20c9-5da6-9e87-d6127573b178",
    heizsaison: "8a2acc24-6dda-5c16-a7f5-4d24504cf700",
  },
} as const;
