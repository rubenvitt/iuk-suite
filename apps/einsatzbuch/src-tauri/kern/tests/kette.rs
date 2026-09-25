//! Kettenprüfung (`kette::pruefe`) gegen die Testvektoren des TS-Kerns
//! (`src/app/m/einsatzbuch/_lib/kern/testvektoren/erwartet.json`): die drei positiven Blöcke und
//! die Negativfälle der Spec §9.1, deren erwartetes Ergebnis als Literal im Vektor steht.
mod hilfe;

use einsatzbuch_kern::format::{Block, GENESIS};
use einsatzbuch_kern::kette::{self, Kettenfehler, Kettengrund};

fn vektorbloecke() -> Vec<Block> {
    let bloecke: Vec<Block> = serde_json::from_value(hilfe::vektor("erwartet.json")["bloecke"].clone()).unwrap();
    assert_eq!(bloecke.len(), 3, "erwartet.json muss drei positive Blöcke tragen");
    bloecke
}

#[test]
fn die_vektorbloecke_sind_eine_gueltige_kette() {
    let bloecke = vektorbloecke();
    for b in &bloecke {
        assert_eq!(kette::fingerabdruck(b).unwrap(), b.hash, "Fingerabdruck Block {}", b.kopf.block);
    }
    assert_eq!(kette::pruefe(&bloecke), Ok(()));
}

/// Der Grund steht im Vektor als Oberflächentext; die Tabelle ordnet ihn ausdrücklich zu, statt
/// den Text nur durchzureichen. `vertauschter-umschlag` erwartet der Vektor als **gültige** Kette
/// (`ok: true`): Der Fingerabdruck ist neu gebildet, erst das Auspacken scheitert.
#[test]
fn jeder_negativfall_aus_den_vektoren_liefert_block_und_grund() {
    let negativ = hilfe::vektor("erwartet.json")["negativ"].as_array().unwrap().clone();
    assert_eq!(negativ.len(), 4, "erwartet.json muss vier Negativfälle tragen");
    for fall in negativ {
        let name = fall["name"].as_str().unwrap();
        let bloecke: Vec<Block> = serde_json::from_value(fall["bloecke"].clone()).unwrap();
        let ergebnis = kette::pruefe(&bloecke);
        if fall["kette"]["ok"].as_bool().unwrap() {
            assert_eq!(ergebnis, Ok(()), "{name}");
            continue;
        }
        let grund = match fall["kette"]["grund"].as_str().unwrap() {
            "Inhalt passt nicht zum Fingerabdruck" => Kettengrund::Hash,
            "Vorgänger fehlt oder wurde verändert" => Kettengrund::Vorgaenger,
            "Anfang der Kette stimmt nicht" => Kettengrund::Anfang,
            "Lücke in der Reihenfolge" => Kettengrund::Luecke,
            anderer => panic!("unbekannter Grund {anderer:?} in {name}"),
        };
        let block = fall["kette"]["block"].as_u64().unwrap();
        assert_eq!(ergebnis, Err(Kettenfehler { block, grund }), "{name}");
        // Die Oberfläche zeigt den Grund wörtlich wie der TS-Kern.
        assert_eq!(grund.to_string(), fall["kette"]["grund"].as_str().unwrap(), "{name}");
    }
}

/// Die Vektoren haben keinen Fall für einen falschen Vorgänger: Block 2 zeigt auf einen anderen
/// Hash, sein eigener Fingerabdruck ist aber neu gebildet.
#[test]
fn falscher_vorgaenger_wird_erkannt() {
    let mut bloecke = vektorbloecke();
    bloecke[1].kopf.prev = "a".repeat(64);
    bloecke[1].hash = kette::fingerabdruck(&bloecke[1]).unwrap();
    assert_eq!(kette::pruefe(&bloecke), Err(Kettenfehler { block: 2, grund: Kettengrund::Vorgaenger }));
}

/// Eine vollständige Kette beginnt bei Block 1 — ein Ausschnitt ab Block 2 ist kein Anfang,
/// auch wenn jeder Fingerabdruck stimmt.
#[test]
fn eine_kette_ab_block_2_ist_kein_anfang() {
    let bloecke = vektorbloecke();
    assert_eq!(kette::pruefe(&bloecke[1..]), Err(Kettenfehler { block: 2, grund: Kettengrund::Anfang }));
}

/// Block 1 mit neu gebildetem Fingerabdruck, aber falschem `prev` — wie `falscher-anfang`, nur
/// hier ausdrücklich am Aufbau geprüft, nicht nur über den Vektor.
#[test]
fn block_1_braucht_genesis_als_vorgaenger() {
    let mut bloecke = vektorbloecke();
    assert_eq!(bloecke[0].kopf.prev, GENESIS);
    bloecke[0].kopf.prev = "0".repeat(63) + "1";
    bloecke[0].hash = kette::fingerabdruck(&bloecke[0]).unwrap();
    assert_eq!(kette::pruefe(&bloecke[..1]), Err(Kettenfehler { block: 1, grund: Kettengrund::Anfang }));
}

/// Eine leere Liste ist keine Kette ab Block 1. Die Wiederherstellung darf nie null Blöcke als
/// gültig übernehmen, deshalb `Anfang` bei Block 1 statt `Ok`.
#[test]
fn eine_leere_liste_ist_keine_kette() {
    assert_eq!(kette::pruefe(&[]), Err(Kettenfehler { block: 1, grund: Kettengrund::Anfang }));
}

/// Eine Blocknummer über der Grenze sicherer Ganzzahlen lässt die Kanonik scheitern. Aus einer
/// fremden Datei darf das nie in einen Panic laufen, sondern ist ein Fingerabdruck, der nicht
/// passt.
#[test]
fn blocknummer_ueber_der_sicheren_grenze_ist_ein_hashfehler() {
    let mut bloecke = vektorbloecke();
    bloecke[2].kopf.block = u64::MAX;
    assert_eq!(kette::pruefe(&bloecke), Err(Kettenfehler { block: u64::MAX, grund: Kettengrund::Hash }));
    assert!(kette::fingerabdruck(&bloecke[2]).is_err());
}

#[test]
fn kettenfehler_nennt_block_und_grund() {
    let f = Kettenfehler { block: 7, grund: Kettengrund::Luecke };
    assert_eq!(f.to_string(), "Block 7: Lücke in der Reihenfolge");
}
