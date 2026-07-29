class_name DiceForge
extends RefCounted
## The headless DiceForge engine, in GDScript (ADR-0021).
##
## The same contract as `@diceforge-sdk/core`: outcomes are resolved with no
## renderer, network or scene tree in sight, and a seeded engine produces the
## same records as the TypeScript core, bit for bit — held to the conformance
## vectors in `packages/testing/vectors/core-vectors.json`.
##
##     var forge := DiceForge.seeded("table-42")
##     var record = forge.roll("2d20kh1+3")
##     if record.has("error"):
##         print(record["error"]["message"])
##     else:
##         print(record["total"])
##
## `roll` returns a schema v2 record as a Dictionary — `JSON.stringify(record)`
## is readable by every other DiceForge platform. Errors come back as
## `{ "error": { "position": int, "message": String } }` because GDScript has
## no exceptions; the position is character-exact with the core's.

const SeededRandom := preload("seeded_random.gd")
const Notation := preload("notation.gd")
const Resolver := preload("resolver.gd")

var _random
var _registry: Dictionary = {}
var _dice: Array = []


## A reproducible engine: the same seed replays the same rolls, here and in
## every other DiceForge core.
static func seeded(seed_value) -> RefCounted:
	var forge := new()
	forge._random = SeededRandom.create(seed_value)
	return forge


## A non-reproducible engine, seeded from Godot's entropy.
static func system() -> RefCounted:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	return seeded(rng.randi())


## Registers a custom die for `d{id}` notation (ADR-0015). Faces are
## Dictionaries with an integer `value` and an optional `label`, or plain ints.
## Returns an error Dictionary or empty on success.
func define_die(id: String, faces: Array) -> Dictionary:
	var pattern := RegEx.create_from_string("^[A-Za-z][A-Za-z0-9_-]*$")
	if pattern.search(id) == null:
		return {"error": {"message": "id must start with a letter and use only letters, digits, - and _"}}
	if id.length() > 24:
		return {"error": {"message": "id exceeds 24 characters"}}
	if faces.size() < 2:
		return {"error": {"message": "a die needs at least 2 faces; use a modifier for a constant"}}
	if faces.size() > Notation.MAX_DIE_FACES:
		return {"error": {"message": "a die may not have more than %d faces" % Notation.MAX_DIE_FACES}}
	var key := id.to_lower()
	if _registry.has(key):
		return {"error": {"message": 'duplicate die id "%s"; ids are matched case-insensitively' % id}}
	var normalized: Array = []
	for face in faces:
		if face is int:
			normalized.append({"value": face})
		elif face is Dictionary and face.has("value"):
			var entry := {"value": int(face["value"])}
			if face.has("label"):
				entry["label"] = String(face["label"])
			normalized.append(entry)
		else:
			return {"error": {"message": "each face must be an int or a {value, label} Dictionary"}}
	var definition := {"id": id, "faces": normalized}
	_registry[key] = definition
	_dice.append(definition)
	return {}


## Parses and resolves dice notation such as "2d20kh1+3" or "4d{fate}".
func roll(expression: String) -> Dictionary:
	var parsed := Notation.parse(expression, _registry, true)
	if not parsed["ok"]:
		return {"error": {"position": parsed["position"], "message": parsed["message"]}}
	return Resolver.resolve_roll(parsed["expr"], _random, _registry)


## Resolves a fair coin flip.
func flip_coin() -> Dictionary:
	return Resolver.resolve_coin_flip(_random)


## The custom dice this engine knows, in the order they were defined.
func dice() -> Array:
	return _dice.duplicate()
