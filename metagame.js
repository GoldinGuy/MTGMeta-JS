"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
const skmeans = require("skmeans");
// globals
const NUM_CLUSTERS = 20;
const NUM_TOP_VERS = 15;
const FORMATS = ["modern", "legacy", "pauper"];
const IGNORE = [
    "Island",
    "Forest",
    "Mountain",
    "Swamp",
    "Plains"
];
var decks = [];
var all_cards = [];
var cards_w_ignore = [];
var unique_cards = [];
function cardNames(deck) {
    let names = [];
    for (const card in deck) {
        names.push(card[1]);
    }
    return names;
}
function mostCommonCards(deck, k) {
    deck = deck.sort((a, b) => a[0] - b[0]).reverse();
    let card_names = [];
    for (var card in deck.slice(0, k)) {
        let card_name = deck[card][1];
        if (!IGNORE.includes(card_name)) {
            card_names.push(card_name);
        }
    }
    return card_names;
}
function distance(x, y) {
    let d = 0.0;
    for (const [z, elem] of x.entries()) {
        d += (elem - y[z]) * (elem - y[z]);
    }
    return Math.sqrt(d);
}
function intersect(a1, a2) {
    let a3 = [...a1, ...a2];
    console.log(a3);
    return a1.filter(function (n) {
        return a2.indexOf(n) !== -1;
    });
}
function zipDeck(a1, a2) {
    var deck_zip = [];
    for (var j = 0; j < a1.length; j++) {
        deck_zip.push([a1[j], a2[j]]);
    }
    return deck_zip;
}
// function set(arr): Array<string> {
// 	return Object.keys(
// 		arr.reduce(function (seen, val) {
// 			seen[val] = true;
// 			return seen;
// 		}, {})
// 	);
// }
fs.readFile("decks_json/decks-" + FORMATS[0] + ".json", "utf8", function (err, json) {
    var decks_json = JSON.parse(json);
    // console.log(JSON.stringify(decks_json));
    for (let i of Object.keys(decks_json)) {
        var deck_of_cards = [];
        for (let card of decks_json[i]["main"]) {
            // initialize deck dict, determine card data
            deck_of_cards.push([card["quantity"], card["name"]]);
            all_cards.push(card["name"]);
            if (!IGNORE.some(c => card["name"].includes(c))) {
                cards_w_ignore.push(card["name"]);
            }
            let idx = unique_cards.findIndex(c => c.card_name == card.name);
            if (idx == -1) {
                unique_cards.push({
                    card_name: card["name"],
                    quantity: card["quantity"]
                });
            }
            else if (!IGNORE.some(c => card.name.includes(c))) {
                unique_cards[idx].quantity += card.quantity;
            }
        }
        decks.push(deck_of_cards);
    }
    var format_json = {
        archetypes: [],
        format_top_cards: [],
        format_versatile_cards: [],
        total_cards_parsed: all_cards.length,
        unique_cards_parsed: unique_cards.length
    };
    // Determine "deck vectors" - translate mtg decks to a format that can be used for KM++
    function deck_to_vector(input_deck) {
        var v = Array(all_cards.length).fill(0);
        for (const [x, name] of all_cards.entries()) {
            for (const [idx, card] of input_deck.entries()) {
                if (card[1] == name) {
                    v[x] += card[0];
                }
            }
        }
        return v;
    }
    var deck_vectors = [];
    for (var deck of decks) {
        deck_vectors.push(deck_to_vector(deck));
    }
    // Determine meta using K-Means++ clustering
    var kmeans = skmeans(deck_vectors, NUM_CLUSTERS, "kmpp");
    var deck_zip = zipDeck(decks, kmeans.idxs);
    // Translate K-Means data to a format that can be parsed
    var card_counts = [];
    for (var i in [...Array(NUM_CLUSTERS).keys()]) {
        card_counts.push([parseInt(i), decksByIdx(parseInt(i)).length]);
    }
    var total_instances = 0;
    card_counts.forEach(function (a, b) {
        total_instances += a[1];
    });
    function decksByIdx(idx) {
        let indexes = [];
        for (const [label, [deck, index]] of deck_zip.entries()) {
            if (index == idx) {
                indexes.push([deck, index]);
            }
        }
        return indexes;
    }
    function apparationRatio(card_name) {
        var label_count = Array(NUM_CLUSTERS).fill(0);
        for (const [label, [deck, id]] of deck_zip.entries()) {
            for (var card in decks) {
                if (card[1].includes(card_name)) {
                    label_count[id] += 1;
                }
            }
        }
        let total_apps = new Set(label_count).size;
        let labels = [];
        for (var count of label_count) {
            labels.push(count / total_apps);
        }
        return [labels, total_apps];
    }
    // FOR EACH CLUSTER
    for (let i in [...Array(NUM_CLUSTERS).keys()]) {
        // Define cluster - Instead of taking the intersection of all the decks in a cluster, which could lead to archetype staples being excluded due to variance, this method involves taking every deck in the cluster and finding the most common cards (or archetype staples)
        var card_set = [];
        for (let deck_item of decksByIdx(parseInt(i))) {
            card_set.push(new Set(mostCommonCards(deck_item[0], 40)));
        }
        let card_list = Array.prototype.concat.apply([], card_set);
        let count_cards = card_list.reduce((a, b) => {
            a[b] = (a[b] || 0) + 1;
            return a;
        }, {});
        let sorted_cards = Object.keys(count_cards)
            .map(function (k) {
            return [k, count_cards[k]];
        })
            .sort(function (a, b) {
            return b[1] - a[1];
        });
        var cluster = [];
        for (var card_item of sorted_cards.slice(0, 20)) {
            cluster.push(card_item[0]);
        }
        // calculate percentage of meta, deck name, best_fit deck
        var instances = decksByIdx(parseInt(i)).length;
        var deck_archetype = {
            archetype_name: "Unknown",
            top_cards: cluster,
            metagame_percentage: ((instances / total_instances) * 100).toFixed(2) + "%",
            best_fit_deck: { main: [], sb: [] }
        };
        let max_similar = 0;
        for (const deck_obj of Object.values(decks_json)) {
            let similar = 0;
            for (const card of deck_obj["main"]) {
                if (cluster.includes(card["name"])) {
                    similar += 1;
                }
                if (similar > max_similar) {
                    max_similar = similar;
                    deck_archetype.archetype_name = deck_obj["name"];
                    deck_archetype.best_fit_deck = {
                        main: deck_obj["main"],
                        sb: deck_obj["sb"]
                    };
                }
            }
        }
        console.log("\nCluster #" + i + " (" + deck_archetype.archetype_name + ") :");
        console.log(deck_archetype.top_cards);
        format_json.archetypes.push(deck_archetype);
    }
    function closestCards(a_card, b) {
        let this_card = apparationRatio(a_card)[0];
        var distances = [];
        for (var name in cards_w_ignore) {
            let dist = distance(apparationRatio(name)[0], this_card);
            distances.push([name, dist]);
        }
        distances.sort((a, b) => b[1] - a[1]);
        var closest_cards = [];
        for (var [card_name, dist] of distances.slice(0, b)) {
            if (card_name != a_card) {
                closest_cards.push(card_name);
            }
        }
        return closest_cards;
    }
    function versatile_cards(k) {
        var variances = [];
        for (var name in cards_w_ignore) {
            let versatility = 0;
            for (var x of apparationRatio(name)) {
                // for (var x of apparationRatio(name, deck_zip)[0]) {
                if (x > 0) {
                    versatility += 1;
                }
            }
            variances.push([name, versatility]);
        }
        variances.sort((a, b) => b[1] - a[1]);
        var versatile_cards = [];
        for (var [card_name, versatility] of variances.slice(0, k)) {
            versatile_cards.push(card_name);
        }
        return versatile_cards;
    }
    // function common_decks(card):
    //     common_decks = []
    //     apps = apparition_ratio(card)
    //     i = 0
    //     while i < NUM_CLUSTERS:
    //         if (apps[0][i] * 100) > 15:
    //             common_decks.append(format_json['archetypes'][i]['archetype_name'])
    //         i += 1
    //     return common_decks
    //  Determine top cards in format
    for (var card_dict in unique_cards.splice(0, NUM_TOP_VERS)) {
        let card_name = list(card_dict.keys())[0];
        let quantity = list(card_dict.values())[0];
        var top_card = {
            card_name: card_name,
            common_archetypes: common_decks(card_name),
            cards_found_with: closest_cards(card_name, 8),
            total_instances: quantity,
            percentage_of_total_cards: "{:.2%}".format(quantity / len(cards_w_ig))
        };
        format_json["format_top_cards"].push(top_card);
    }
    // # DETERMINE VERSATILE CARDS IN FORMAT
    // for card in versatile_cards(NUM_TOP_VERS):
    //     versatile_card = {
    //         'card_name': card,
    //         'common_archetypes': common_decks(card),
    //         'cards_found_with': closest_cards(card, 8),
    //         'total_instances': apparition_ratio(card)[1]
    //     }
    //     format_json['format_versatile_cards'].append(versatile_card)
    // Sort JSON
    format_json["archetypes"].sort((a, b) => parseFloat(b.metagame_percentage.replace("%", "")) -
        parseFloat(a.metagame_percentage.replace("%", "")));
    format_json["format_versatile_cards"].sort((a, b) => b.total_instances - a.total_instances);
    // Write JSON Output
    fs.writeFile(FORMATS[0] + ".json", JSON.stringify(format_json, null, 4), "utf8", function (err, data) { });
});
