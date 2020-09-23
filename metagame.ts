var fs = require("fs");
const skmeans = require("skmeans");

export interface Kmeans {
	it: number;
	k: number;
	idxs: Array<number>;
	centroids: Array<number>;
}

export interface FormatJson {
	archetypes: Array<Archetype>;
	format_top_cards: Array<TopCard>;
	format_versatile_cards: Array<VersatileCard>;
	total_cards_parsed: number;
	unique_cards_parsed: number;
}

export interface Archetype {
	archetype_name: String;
	top_cards: Array<String>;
	metagame_percentage: String;
	best_fit_deck: {
		main: Array<{
			name: String;
			quantity: number;
		}>;
		sb: Array<{
			name: String;
			quantity: number;
		}>;
	};
}

export interface TopCard {
	card_name: String;
	common_archetypes: Array<String>;
	cards_found_with: Array<String>;
	total_instances: number;
	percentage_of_total_cards: String;
}

export interface VersatileCard {
	card_name: String;
	common_archetypes: Array<String>;
	cards_found_with: Array<String>;
	total_instances: number;
	percentage_of_total_cards: String;
}

export type Deck = Array<Card>;
export type Card = [number, string];

// globals
const NUM_CLUSTERS: number = 20;
const NUM_TOP_VERS: number = 15;
const FORMATS: Array<String> = ["modern", "legacy", "pauper"];
const IGNORE: Array<String> = [
	"Island",
	"Forest",
	"Mountain",
	"Swamp",
	"Plains"
];

var decks: Array<Deck> = [];
var all_cards: Array<String> = [];
var cards_w_ignore: Array<String> = [];
var unique_cards: Array<{
	card_name: String;
	quantity: number;
}> = [];

function cardNames(deck: Deck): Array<String> {
	let names: Array<String> = [];
	for (const card in deck) {
		names.push(card[1]);
	}
	return names;
}

function mostCommonCards(deck: Deck, k: number): Array<String> {
	deck = deck.sort((a, b) => a[0] - b[0]).reverse();
	let card_names: Array<string> = [];
	for (var card in deck.slice(0, k)) {
		let card_name = deck[card][1];
		if (!IGNORE.includes(card_name)) {
			card_names.push(card_name);
		}
	}
	return card_names;
}

function decksByIdx(
	idx: number,
	decks_indexes: Array<[Deck, number]>
): Array<[Deck, number]> {
	let indexes: Array<[Deck, number]> = [];
	for (const [label, [deck, index]] of decks_indexes.entries()) {
		if (index == idx) {
			indexes.push([deck, index]);
		}
	}
	return indexes;
}

// function apparition_ratio(card_name: String, decks_labels) {
// 	var label_count = Array(NUM_CLUSTERS).fill(0);
// 	for (const [deck, label] of decks_labels.entries()) {
// 		for (var card in decks) {
// 			if (card[1].includes(card_name)) {
// 				label_count[label] += 1;
// 			}
// 		}
// 	}
// 	let total_apps = label_count.reduce();
// 	let labels = [];
// 	for (var count in label_count) {
// 		labels.push([count / total_apps]);
// 	}
// 	return [labels, total_apps];
// }

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

function zipDeck(a1: Array<Deck>, a2: Array<number>): Array<[Deck, number]> {
	var deck_zip: Array<[Deck, number]> = [];
	for (var j = 0; j < a1.length; j++) {
		deck_zip.push([a1[j], a2[j]]);
	}
	return deck_zip;
}

function set(arr): Array<string> {
	return Object.keys(
		arr.reduce(function (seen, val) {
			seen[val] = true;
			return seen;
		}, {})
	);
}

fs.readFile("decks_json/decks-" + FORMATS[0] + ".json", "utf8", function (
	err: string,
	json: string
) {
	var decks_json: JSON = JSON.parse(json);
    // console.log(JSON.stringify(decks_json));
    
	for (let i of Object.keys(decks_json)) {
		var deck_of_cards: Deck = [];
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
			} else if (!IGNORE.some(c => card.name.includes(c))) {
				unique_cards[idx].quantity += card.quantity;
			}
		}
		decks.push(deck_of_cards);
	}

	var format_json: FormatJson = {
		archetypes: [],
		format_top_cards: [],
		format_versatile_cards: [],
		total_cards_parsed: all_cards.length,
		unique_cards_parsed: unique_cards.length
	};

	// Determine "deck vectors" - translate mtg decks to a format that can be used for KM++
	function deck_to_vector(input_deck: Deck): Array<number> {
		var v: Array<number> = Array(all_cards.length).fill(0);
		for (const [x, name] of all_cards.entries()) {
			for (const [idx, card] of input_deck.entries()) {
				if (card[1] == name) {
					v[x] += card[0];
				}
			}
		}
		return v;
	}
	var deck_vectors: Array<Array<number>> = [];
	for (var deck of decks) {
		deck_vectors.push(deck_to_vector(deck));
	}
	// Determine meta using K-Means++ clustering
	var kmeans: Kmeans = skmeans(deck_vectors, NUM_CLUSTERS, "kmpp");
	var deck_zip: Array<[Deck, number]> = zipDeck(decks, kmeans.idxs);
	// Translate K-Means data to a format that can be parsed
	var card_counts: Array<[number, number]> = [];
	for (var i in [...Array(NUM_CLUSTERS).keys()]) {
		card_counts.push([parseInt(i), decksByIdx(parseInt(i), deck_zip).length]);
	}
	var total_instances: number = 0;
	card_counts.forEach(function (a, b) {
		total_instances += a[1];
	});

	// FOR EACH CLUSTER
	for (let i in [...Array(NUM_CLUSTERS).keys()]) {
		// Define cluster - Instead of taking the intersection of all the decks in a cluster, which could lead to archetype staples being excluded due to variance, this method involves taking every deck in the cluster and finding the most common cards (or archetype staples)
		var card_set: Array<Array<string>> = [];
		for (let deck_item of decksByIdx(parseInt(i), deck_zip)) {
			card_set.push(set(mostCommonCards(deck_item[0], 40)));
		}
		let card_list: Array<string> = Array.prototype.concat.apply([], card_set);
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
		var cluster: Array<String> = [];
		for (var card_item of sorted_cards.slice(0, 20)) {
			cluster.push(card_item[0]);
		}
		// calculate percentage of meta, deck name, best_fit deck
		var instances: number = decksByIdx(parseInt(i), deck_zip).length;
		var deck_archetype: Archetype = {
			archetype_name: "Unknown",
			top_cards: cluster,
			metagame_percentage:
				((instances / total_instances) * 100).toFixed(2) + "%",
			best_fit_deck: { main: [], sb: [] }
		};
		let max_similar: number = 0;
		for (const deck_obj of Object.values(decks_json)) {
			let similar: number = 0;
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
		console.log(
			"\nCluster #" + i + " (" + deck_archetype.archetype_name + ") :"
		);
		console.log(deck_archetype.top_cards);
		format_json.archetypes.push(deck_archetype);
	}

	// Sort JSON
	format_json["archetypes"].sort(
		(a, b) =>
			parseFloat(b.metagame_percentage.replace("%", "")) -
			parseFloat(a.metagame_percentage.replace("%", ""))
	);
	format_json["format_versatile_cards"].sort(
		(a, b) => b.total_instances - a.total_instances
	);

	// Write JSON Output
	fs.writeFile(
		FORMATS[0] + ".json",
		JSON.stringify(format_json, null, 4),
		"utf8",
		function (err: String, data: String) {}
	);
