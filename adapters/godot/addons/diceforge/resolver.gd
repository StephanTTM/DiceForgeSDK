class_name DiceForgeResolver
extends RefCounted
## Port of the core's resolution: parsed expression + random source -> record.
##
## Dice are rolled in term order, each die finished (rerolled, exploded) before
## the next starts, so a seeded stream replays identically to the TypeScript
## core (ADR-0016, ADR-0021). Records are Dictionaries shaped exactly like the
## core's schema v2 JSON, optional keys omitted rather than null.

const Notation := preload("res://addons/diceforge/notation.gd")

const EVENT_SCHEMA_VERSION := 2
const UINT32_RANGE := 0x100000000


## Uniform integer in [1, sides] by rejection sampling, exactly as the core:
## plain modulo would favour low faces.
static func roll_face(random, sides: int) -> int:
	var limit := UINT32_RANGE - (UINT32_RANGE % sides)
	var value: int = random.next_uint32()
	while value >= limit:
		value = random.next_uint32()
	return (value % sides) + 1


static func resolve_roll(expr: Dictionary, random, registry: Dictionary) -> Dictionary:
	var groups: Array = []
	var modifier := 0
	var dice_total := 0
	for term in expr["terms"]:
		if term["type"] == "modifier":
			modifier += int(term["sign"]) * int(term["value"])
			continue
		var group := _resolve_group(term, random, registry)
		groups.append(group)
		dice_total += int(term["sign"]) * int(group["subtotal"])
	return {
		"kind": "roll",
		"schemaVersion": EVENT_SCHEMA_VERSION,
		"expression": expr["normalized"],
		"groups": groups,
		"modifier": modifier,
		"total": dice_total + modifier,
		"provenance": random.provenance(),
	}


static func resolve_coin_flip(random) -> Dictionary:
	var face := roll_face(random, 2)
	return {
		"kind": "coin-flip",
		"schemaVersion": EVENT_SCHEMA_VERSION,
		"outcome": "heads" if face == 1 else "tails",
		"provenance": random.provenance(),
	}


static func _select_kept_flags(values: Array, selection: Dictionary) -> Array:
	var flags: Array = []
	if selection.is_empty():
		for value in values:
			flags.append(true)
		return flags
	var highest_first: bool = selection["mode"] == "kh" or selection["mode"] == "dh"
	var ranked: Array = []
	for index in values.size():
		ranked.append({"value": values[index], "index": index})
	# The comparator is total — ties break by roll order — so sort stability
	# cannot matter, which is what makes an unstable sort safe here.
	ranked.sort_custom(
		func(a, b):
			if a["value"] != b["value"]:
				return a["value"] > b["value"] if highest_first else a["value"] < b["value"]
			return a["index"] < b["index"]
	)
	var keep_mode: bool = selection["mode"] == "kh" or selection["mode"] == "kl"
	for value in values:
		flags.append(not keep_mode)
	var chosen: int = mini(int(selection["count"]), ranked.size())
	for rank in chosen:
		flags[ranked[rank]["index"]] = keep_mode
	return flags


static func _resolve_group(term: Dictionary, random, registry: Dictionary) -> Dictionary:
	var definition: Dictionary = {}
	if term.has("die"):
		definition = registry.get(String(term["die"]).to_lower(), {})
		if definition.is_empty():
			push_error("unknown die %s reached resolution; the parser should have caught it" % term["die"])
	var sides: int = definition["faces"].size() if not definition.is_empty() else int(term["sides"])
	var highest_value := sides
	if not definition.is_empty():
		var values: Array = []
		for face in definition["faces"]:
			values.append(face["value"])
		highest_value = values.max()

	var reroll: Dictionary = term.get("reroll", {})
	var explode: bool = term.get("explode", false)
	var rolled: Array = []
	var extras := 0
	for index in int(term["count"]):
		var current := _draw(random, sides, definition)

		if not reroll.is_empty():
			var attempts := 0
			while (
				int(current["value"]) <= int(reroll["threshold"])
				and attempts < Notation.MAX_REROLLS_PER_DIE
				and extras < Notation.MAX_EXTRA_DICE_PER_GROUP
			):
				current["rerolled"] = true
				rolled.append(current)
				extras += 1
				current = _draw(random, sides, definition)
				current["source"] = "reroll"
				attempts += 1
				if reroll["once"]:
					break
		rolled.append(current)

		if explode:
			var chain := 0
			var last := current
			while (
				int(last["value"]) == highest_value
				and chain < Notation.MAX_EXPLOSIONS_PER_DIE
				and extras < Notation.MAX_EXTRA_DICE_PER_GROUP
			):
				last = _draw(random, sides, definition)
				last["source"] = "explosion"
				rolled.append(last)
				extras += 1
				chain += 1

	var live_values: Array = []
	for die in rolled:
		if not die.get("rerolled", false):
			live_values.append(die["value"])
	var kept_flags := _select_kept_flags(live_values, term.get("selection", {}))
	var live_position := 0
	var dice: Array = []
	var subtotal := 0
	for die in rolled:
		var kept: bool
		if die.get("rerolled", false):
			kept = false
		else:
			kept = kept_flags[live_position]
			live_position += 1
		var outcome := {"sides": sides, "value": die["value"], "kept": kept}
		if not definition.is_empty():
			outcome["die"] = definition["id"]
		if die.has("label"):
			outcome["label"] = die["label"]
		if die.has("source"):
			outcome["source"] = die["source"]
		if die.get("rerolled", false):
			outcome["rerolled"] = true
		dice.append(outcome)
		if kept:
			subtotal += int(die["value"])

	var rendered_term := term
	if not definition.is_empty():
		rendered_term = term.duplicate()
		rendered_term["die"] = definition["id"]
		rendered_term["sides"] = sides
	var group := {
		"notation": Notation.render_group_notation(rendered_term),
		"sign": term["sign"],
		"sides": sides,
	}
	if not definition.is_empty():
		group["die"] = definition["id"]
	group["dice"] = dice
	group["subtotal"] = subtotal
	return group


## One RNG draw, in order, exactly as a plain numeric die: a custom die changes
## what a face is worth, never how many numbers it consumes.
static func _draw(random, sides: int, definition: Dictionary) -> Dictionary:
	var index := roll_face(random, sides)
	if definition.is_empty():
		return {"value": index}
	var face: Dictionary = definition["faces"][index - 1]
	var result := {"value": face["value"]}
	if face.has("label"):
		result["label"] = face["label"]
	return result
