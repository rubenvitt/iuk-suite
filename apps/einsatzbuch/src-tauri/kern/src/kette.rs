//! Kettenprüfung — Rust-Gegenstück zu `pruefeKette` in
//! `src/app/m/einsatzbuch/_lib/kern/kette.ts`, aber strenger: Hier gilt nur eine vollständige
//! Kette ab Block 1 als gültig, denn geprüft wird eine Sicherungsdatei vor der Wiederherstellung.
//! Reihenfolge der Prüfungen und Gründe wie im TS-Kern: erst der Fingerabdruck, dann der
//! Vorgänger, dann der Anfang, dann die Lücke. Die Eingabe kommt aus einer fremden Datei, also
//! führt keine Blocknummer und keine Kanonik in einen Panic.
use crate::format::{Block, GENESIS};
use crate::jcs::{self, JcsFehler};
use crate::krypto;

/// Warum eine Kette nicht gilt. Der Text ist wörtlich der des TS-Kerns, weil die Oberfläche
/// ihn so anzeigt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum Kettengrund {
    /// Der erste Block ist nicht Block 1, oder sein `prev` ist nicht `GENESIS`; auch eine leere
    /// Liste, denn ihr fehlt Block 1.
    #[error("Anfang der Kette stimmt nicht")]
    Anfang,
    #[error("Lücke in der Reihenfolge")]
    Luecke,
    #[error("Vorgänger fehlt oder wurde verändert")]
    Vorgaenger,
    #[error("Inhalt passt nicht zum Fingerabdruck")]
    Hash,
}

/// Der erste Block, an dem die Prüfung scheitert, und der Grund.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("Block {block}: {grund}")]
pub struct Kettenfehler {
    pub block: u64,
    pub grund: Kettengrund,
}

/// Der Fingerabdruck eines Blocks, gebildet wie in `krypto::versiegele`: SHA-256 (Hex) über
/// `jcs::kanonisch({kopf, iv, daten, umschlag})`. Scheitert die Kanonik (Blocknummer über der
/// Grenze sicherer Ganzzahlen), gibt es keinen Fingerabdruck.
pub fn fingerabdruck(b: &Block) -> Result<String, JcsFehler> {
    let ohne_hash = serde_json::json!({ "kopf": b.kopf, "iv": b.iv, "daten": b.daten, "umschlag": b.umschlag });
    Ok(krypto::sha256_hex(jcs::kanonisch(&ohne_hash)?.as_bytes()))
}

/// Prüft eine vollständige Kette ab Block 1: Jeder Fingerabdruck stimmt, jeder Block zeigt auf
/// den Hash seines Vorgängers, der erste ist Block 1 mit `prev = GENESIS`, und die Nummern steigen
/// ohne Lücke. Meldet den ersten Verstoß. Eine leere Liste ist keine Kette (`Anfang` bei Block 1),
/// denn eine Wiederherstellung darf nie null Blöcke als gültig übernehmen.
pub fn pruefe(bloecke: &[Block]) -> Result<(), Kettenfehler> {
    if bloecke.is_empty() {
        return Err(Kettenfehler { block: 1, grund: Kettengrund::Anfang });
    }
    let mut vorher: Option<&Block> = None;
    for b in bloecke {
        let block = b.kopf.block;
        let fehler = |grund| Err(Kettenfehler { block, grund });
        if fingerabdruck(b).ok().as_deref() != Some(b.hash.as_str()) {
            return fehler(Kettengrund::Hash);
        }
        match vorher {
            Some(v) if b.kopf.prev != v.hash => return fehler(Kettengrund::Vorgaenger),
            None if block != 1 || b.kopf.prev != GENESIS => return fehler(Kettengrund::Anfang),
            Some(v) if v.kopf.block.checked_add(1) != Some(block) => return fehler(Kettengrund::Luecke),
            _ => {}
        }
        vorher = Some(b);
    }
    Ok(())
}
