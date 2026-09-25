//! Wiederherstellung einer Sicherung im Kern (Spec §4.5, Entscheidung 6): die reine Prüfung der
//! Sicherungsdatei gegen den gepinnten Schlüssel und den Kettenanker der Suite, dazu das
//! Zusammenfassen der Einsatznummern je Jahr aus den geöffneten Blöcken. Übernommen wird mit
//! `Buch::uebernehme_sicherung`. Datei lesen, Anker holen, Blöcke freigeben lassen und öffnen
//! (`krypto::oeffne_block`) ist Sache der Hülle.
//!
//! **Nur bei passendem Anker** (Review Focus 3): Die Sicherung muss den höchsten Anker der Suite
//! mit gleichem Hash enthalten. Sie darf darüber hinausgehen, denn solche Blöcke hängen per Kette
//! an ihm. Kennt die Suite keinen Anker, endet die Sicherung davor oder weicht der Hash ab, wird
//! abgelehnt.
use std::collections::BTreeMap;

use crate::format::{Block, Einsatz, Umgebung};
use crate::kette::{self, Kettengrund};
use crate::sicherung::Sicherungsdatei;

/// Warum eine Sicherung nicht wiederhergestellt wird. Die Texte zeigt die Oberfläche wörtlich.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum Wiederherstellungsfehler {
    #[error("Die Sicherung enthält keine Blöcke.")]
    Leer,
    #[error("Die Kette in der Sicherung ist gebrochen bei Block {block}: {grund}")]
    KetteGebrochen { block: u64, grund: Kettengrund },
    #[error("Die Sicherung gehört zu einem anderen Schlüssel ({gefunden} in Block {block}, gepinnt ist {gepinnt}).")]
    AndererSchluessel { block: u64, gefunden: String, gepinnt: String },
    #[error("Block {block} der Sicherung stammt aus dem Testbetrieb. Wiederherstellen lässt sich nur eine echte Kette.")]
    Testbetrieb { block: u64 },
    #[error("Die Suite kennt noch keinen Anker dieser Kette. Ohne Anker lässt sich die Sicherung nicht prüfen.")]
    KeinAnker,
    /// Die Suite vergibt Anker ab Block 1. Block 0 ist eine kaputte Antwort und kein Anlass,
    /// die Prüfung zu überspringen.
    #[error("Die Suite meldet einen ungültigen Anker (Block 0). Ohne gültigen Anker lässt sich die Sicherung nicht prüfen.")]
    UngueltigerAnker,
    #[error("Die Sicherung endet bei Block {ende}, die Suite kennt die Kette bis Block {anker}. Diese Sicherung ist veraltet.")]
    Veraltet { ende: u64, anker: u64 },
    #[error("Block {block} der Sicherung passt nicht zum Anker der Suite (Sicherung {sicherung}, Suite {suite}).")]
    AnkerPasstNicht { block: u64, sicherung: String, suite: String },
    #[error("Die Einsatznummer „{nummer}“ in der Sicherung ist nicht lesbar, erwartet ist JJJJ-NNN.")]
    UnlesbareNummer { nummer: String },
}

/// Prüft eine gelesene Sicherungsdatei, bevor irgendein Block freigegeben oder übernommen wird.
/// Format und Version prüft schon `sicherung::lies`. In dieser Reihenfolge:
/// 1. Die Blöcke selbst (`pruefe_bloecke`): nicht leer, Kette ab Block 1, gepinnter Schlüssel,
///    nur `echt`.
/// 2. Der Anker der Suite (`suite::hole_kettenanker`) liegt vor (`KeinAnker`), zeigt auf Block 1
///    oder höher (`UngueltigerAnker`), nicht über den letzten Block der Sicherung hinaus
///    (`Veraltet`), und der Block dort trägt denselben Hash (`AnkerPasstNicht`).
pub fn pruefe(datei: &Sicherungsdatei, gepinnt: &str, anker: Option<(u64, &str)>) -> Result<(), Wiederherstellungsfehler> {
    pruefe_bloecke(&datei.bloecke, gepinnt)?;
    let Some(letzter) = datei.bloecke.last() else {
        return Err(Wiederherstellungsfehler::Leer);
    };

    let (anker_block, anker_hash) = anker.ok_or(Wiederherstellungsfehler::KeinAnker)?;
    if anker_block == 0 {
        return Err(Wiederherstellungsfehler::UngueltigerAnker);
    }
    let ende = letzter.kopf.block;
    if anker_block > ende {
        return Err(Wiederherstellungsfehler::Veraltet { ende, anker: anker_block });
    }
    // Nach `kette::pruefe` trägt der Block an Position i die Nummer i + 1, und
    // `1 <= anker_block <= ende` passt deshalb in den Index.
    let am_anker = &datei.bloecke[(anker_block - 1) as usize];
    if am_anker.hash != anker_hash {
        return Err(Wiederherstellungsfehler::AnkerPasstNicht {
            block: anker_block,
            sicherung: am_anker.hash.clone(),
            suite: anker_hash.to_string(),
        });
    }
    Ok(())
}

/// Die Prüfungen, die nur die Blöcke brauchen, ohne Netz. Die Hülle ruft sie vor der Anfrage
/// nach dem Anker (eine kaputte Datei meldet sich so auch offline), und `Buch::uebernehme_sicherung`
/// ruft sie noch einmal in seiner Transaktion. In dieser Reihenfolge:
/// 1. Mindestens ein Block (`Leer`).
/// 2. Die Kette ist ab Block 1 vollständig und unverändert (`kette::pruefe`, `KetteGebrochen`).
/// 3. Jeder Kopf trägt die gepinnte `schluesselId` (`AndererSchluessel`) und `umgebung: "echt"`
///    (`Testbetrieb`), gemeldet wird der erste abweichende Block.
pub fn pruefe_bloecke(bloecke: &[Block], gepinnt: &str) -> Result<(), Wiederherstellungsfehler> {
    if bloecke.is_empty() {
        return Err(Wiederherstellungsfehler::Leer);
    }
    kette::pruefe(bloecke).map_err(|f| Wiederherstellungsfehler::KetteGebrochen { block: f.block, grund: f.grund })?;
    for b in bloecke {
        if b.kopf.schluessel_id != gepinnt {
            return Err(Wiederherstellungsfehler::AndererSchluessel {
                block: b.kopf.block,
                gefunden: b.kopf.schluessel_id.clone(),
                gepinnt: gepinnt.to_string(),
            });
        }
        if b.kopf.umgebung != Umgebung::Echt {
            return Err(Wiederherstellungsfehler::Testbetrieb { block: b.kopf.block });
        }
    }
    Ok(())
}

/// Fasst die Einsatznummern der geöffneten Blöcke zu `jahr → letzte` zusammen, dem Inhalt der
/// Tabelle `nummern`: je Jahr die höchste laufende Nummer. Gelesen wird nur die Form, die
/// `versiegele_ausstehend` im Echtbetrieb schreibt (`{jahr}-{letzte:03}`, ohne `T-`): Eine
/// Nummer gilt, wenn sie genau so wieder entsteht, mit vierstelligem Jahr und laufender Nummer
/// ab 1. Jede andere ist ein Fehler, denn sonst vergäbe der Rechner danach womöglich eine Nummer
/// doppelt.
pub fn nummern(einsaetze: &[Einsatz]) -> Result<BTreeMap<i64, i64>, Wiederherstellungsfehler> {
    let mut letzte = BTreeMap::new();
    for e in einsaetze {
        let (jahr, laufend) = lies_nummer(&e.nummer).ok_or_else(|| Wiederherstellungsfehler::UnlesbareNummer { nummer: e.nummer.clone() })?;
        let bisher = letzte.entry(jahr).or_insert(laufend);
        *bisher = (*bisher).max(laufend);
    }
    Ok(letzte)
}

/// `JJJJ-NNN` → `(jahr, laufend)`, nur in der kanonischen Schreibweise (siehe `nummern`).
fn lies_nummer(nummer: &str) -> Option<(i64, i64)> {
    let (jahr_text, laufend_text) = nummer.split_once('-')?;
    let jahr: i64 = jahr_text.parse().ok()?;
    let laufend: i64 = laufend_text.parse().ok()?;
    let gueltig = (1000..=9999).contains(&jahr) && laufend >= 1 && format!("{jahr}-{laufend:03}") == nummer;
    gueltig.then_some((jahr, laufend))
}
