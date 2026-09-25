//! Grenzen, die der Reader der Suite beim Öffnen durchsetzt (`einsatzSchema` und
//! `exportinhaltSchema` in `src/app/m/einsatzbuch/_lib/reader/pruefung.ts`). Ein Einsatz über
//! einer dieser Grenzen ließe sich versiegeln, aber nie mehr öffnen. Deshalb prüft der Kern sie
//! vorher: die Formularwerte beim Absenden (`pruefe_entwurf` in `erfassung.rs`), die Felder der
//! Schnappschüsse schon beim Übernehmen der Stammdaten (`Buch::richte_ein`,
//! `Buch::uebernehme_stammdaten`) und die Kettenlänge vor einem neuen Einsatz (`Buch::sende_ab`).
//!
//! Längen zählen in UTF-16-Codeeinheiten wie `z.string().max` im Reader, nicht in Bytes und nicht
//! in Unicode-Skalaren: „ä“ zählt eins, ein Emoji außerhalb der BMP zwei.
use crate::einrichtung::Stammdatenpaket;

pub const STICHWORT: usize = 80;
pub const STRASSE: usize = 200;
pub const ORT: usize = 200;
pub const OBJEKT: usize = 500;
pub const NOTIZEN: usize = 20_000;
pub const FAHRZEUGE: usize = 200;
pub const PERSONAL: usize = 1_000;

pub const FAHRZEUG_ID: usize = 80;
pub const FAHRZEUG_TYP: usize = 40;
pub const FAHRZEUG_KENNUNG: usize = 40;
pub const FAHRZEUG_RUF: usize = 120;
pub const FAHRZEUG_STANDORT: usize = 80;
pub const PERSON_ID: usize = 80;
pub const PERSON_NAME: usize = 120;
pub const PERSON_QUALI: usize = 40;
pub const PERSON_OV: usize = 80;

/// Höchstlänge von `nummer` im Einsatz. `T-JJJJ-NNN` bleibt weit darunter, auch mit einer
/// vier- oder fünfstelligen laufenden Nummer (Test in `tests/versiegeln.rs`).
pub const NUMMER: usize = 40;

/// Höchstzahl der Blöcke in einem Export; ein Rechner hängt nie mehr Blöcke an seine Kette.
pub const BLOECKE: u64 = 10_000;

/// Länge in UTF-16-Codeeinheiten, wie JavaScripts `String.length`.
pub fn laenge(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Ob an eine Kette mit dem letzten Block `letzter` (`None` bei leerer Kette) noch ein Block passt.
pub fn kette_hat_platz(letzter: Option<u64>) -> bool {
    letzter.unwrap_or(0) < BLOECKE
}

/// Ein Stammdatenfeld über seiner Grenze: welches Feld, an welchem Eintrag, wie lang.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ueberlaenge {
    pub feld: &'static str,
    pub eintrag: String,
    pub laenge: usize,
    pub hoechstens: usize,
}

fn pruefe(feld: &'static str, eintrag: &str, wert: &str, hoechstens: usize) -> Result<(), Ueberlaenge> {
    let laenge = laenge(wert);
    if laenge > hoechstens {
        return Err(Ueberlaenge { feld, eintrag: eintrag.to_string(), laenge, hoechstens });
    }
    Ok(())
}

/// Prüft jedes Feld, das beim Versiegeln als Schnappschuss in den Einsatz wandert, und jedes
/// Stichwort, das die Oberfläche zur Wahl stellt. `fahrzeugId` einer Person ist immer die ID eines
/// dieser Fahrzeuge und damit mitgeprüft. Die Anzahl der Fahrzeuge und Personen prüft sie bewusst
/// nicht: Die Stammdaten dürfen mehr führen, als ein einzelner Einsatz nennen darf.
pub fn pruefe_stammdaten(paket: &Stammdatenpaket) -> Result<(), Ueberlaenge> {
    let s = &paket.stammdaten;
    for f in &s.fahrzeuge {
        // Der Eintrag heißt nach seiner ID; ist die selbst zu lang, nur ihr Anfang.
        let name: String = f.id.chars().take(FAHRZEUG_ID).collect();
        pruefe("Fahrzeug-ID", &name, &f.id, FAHRZEUG_ID)?;
        pruefe("Fahrzeugtyp", &name, &f.typ, FAHRZEUG_TYP)?;
        pruefe("Kennung", &name, &f.kennung, FAHRZEUG_KENNUNG)?;
        pruefe("Funkrufname", &name, &f.ruf, FAHRZEUG_RUF)?;
        pruefe("Standort", &name, &f.standort, FAHRZEUG_STANDORT)?;
    }
    for p in &s.personal {
        let name: String = p.id.chars().take(PERSON_ID).collect();
        pruefe("Personen-ID", &name, &p.id, PERSON_ID)?;
        pruefe("Name", &name, &p.name, PERSON_NAME)?;
        pruefe("Qualifikation", &name, &p.quali, PERSON_QUALI)?;
        pruefe("Ortsverein", &name, &p.ov, PERSON_OV)?;
    }
    for g in &s.stichworte {
        for item in &g.items {
            pruefe("Alarmstichwort", &g.name, item, STICHWORT)?;
        }
    }
    Ok(())
}
