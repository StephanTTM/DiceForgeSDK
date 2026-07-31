class_name DiceForgeNotation
extends RefCounted
## Port of the core's dice notation parser, grammar v1.2 (ADR-0016, ADR-0021).
##
## GDScript has no exceptions, so parsing returns a Dictionary:
##   { "ok": true, "expr": { "source", "normalized", "terms": [...] } }
##   { "ok": false, "position": int, "message": String }
## Error positions are part of the conformance contract; messages are not.

const MAX_EXPRESSION_LENGTH := 500
const MAX_TERMS := 20
const MAX_DICE_PER_GROUP := 100
const MAX_MODIFIER := 1000000
const MAX_DIE_FACES := 1000
const MAX_EXPLOSIONS_PER_DIE := 10
const MAX_REROLLS_PER_DIE := 10
const MAX_EXTRA_DICE_PER_GROUP := 100

const SELECTION_MODES := ["kh", "kl", "dh", "dl"]

var _source: String
var _registry: Dictionary
var _has_registry: bool
var _pos := 0
var _error := {}


## `registry` maps lowercase die id to a definition Dictionary. The engine
## always supplies one (possibly empty), which is what makes an unknown
## `d{name}` a parse error with a position rather than a resolve-time surprise.
static func parse(expression: String, registry: Dictionary = {}, has_registry: bool = true) -> Dictionary:
	if expression.length() > MAX_EXPRESSION_LENGTH:
		return {
			"ok": false,
			"position": MAX_EXPRESSION_LENGTH,
			"message": "expression exceeds %d characters" % MAX_EXPRESSION_LENGTH,
		}
	var parser := new()
	parser._source = expression
	parser._registry = registry
	parser._has_registry = has_registry
	return parser._parse()


static func render_group_notation(node: Dictionary) -> String:
	var die: String = "{%s}" % node["die"] if node.has("die") else str(node["sides"])
	var reroll := ""
	if node.has("reroll"):
		reroll = "r%s%d" % ["o" if node["reroll"]["once"] else "", node["reroll"]["threshold"]]
	var explode: String = "!" if node.get("explode", false) else ""
	var selection := ""
	if node.has("selection"):
		selection = "%s%d" % [node["selection"]["mode"], node["selection"]["count"]]
	return "%dd%s%s%s%s" % [node["count"], die, reroll, explode, selection]


static func _render_expression(terms: Array) -> String:
	var normalized := ""
	for index in terms.size():
		var term: Dictionary = terms[index]
		var body: String = (
			render_group_notation(term) if term["type"] == "dice" else str(term["value"])
		)
		var operator: String = "-" if term["sign"] == -1 else ("" if index == 0 else "+")
		normalized += operator + body
	return normalized


func _fail(message: String, position: int) -> Dictionary:
	_error = {"ok": false, "position": position, "message": message}
	return _error


func _parse() -> Dictionary:
	var terms: Array = []
	_skip_whitespace()
	if _at_end():
		return _fail("expression is empty", _pos)
	var sgn := _read_sign(true)
	var term := _read_term(sgn)
	if not _error.is_empty():
		return _error
	terms.append(term)
	_skip_whitespace()
	while not _at_end():
		sgn = _read_sign(false)
		if not _error.is_empty():
			return _error
		term = _read_term(sgn)
		if not _error.is_empty():
			return _error
		terms.append(term)
		_skip_whitespace()
		if terms.size() > MAX_TERMS:
			return _fail("expression exceeds %d terms" % MAX_TERMS, _pos)
	var has_dice := false
	for candidate in terms:
		if candidate["type"] == "dice":
			has_dice = true
	if not has_dice:
		return _fail('expression must include at least one die (for example "1d6")', 0)
	return {
		"ok": true,
		"expr": {"source": _source, "normalized": _render_expression(terms), "terms": terms},
	}


func _at_end() -> bool:
	return _pos >= _source.length()


func _peek() -> String:
	return _source[_pos] if _pos < _source.length() else ""


static func _is_digit(character: String) -> bool:
	return character >= "0" and character <= "9"


static func _is_letter(character: String) -> bool:
	return (character >= "a" and character <= "z") or (character >= "A" and character <= "Z")


func _skip_whitespace() -> void:
	while not _at_end():
		var character := _peek()
		if character != " " and character != "\t" and character != "\n" and character != "\r":
			break
		_pos += 1


func _read_sign(optional: bool) -> int:
	var character := _peek()
	if character == "+":
		_pos += 1
		return 1
	if character == "-":
		_pos += 1
		return -1
	if optional:
		return 1
	_fail('expected "+" or "-" before the next term', _pos)
	return 1


func _read_term(sgn: int) -> Dictionary:
	_skip_whitespace()
	var start := _pos
	var character := _peek()
	if character == "":
		return _fail("expected a term after the operator", _pos)
	if _is_digit(character):
		var value := _read_integer("number")
		if not _error.is_empty():
			return _error
		var next := _peek()
		if next == "d" or next == "D":
			return _read_dice_group(sgn, value, start)
		if value > MAX_MODIFIER:
			return _fail("modifier exceeds %d" % MAX_MODIFIER, start)
		return {"type": "modifier", "sign": sgn, "value": value}
	if character == "d" or character == "D":
		return _read_dice_group(sgn, 1, start)
	return _fail('unexpected character "%s"' % character, _pos)


func _read_dice_group(sgn: int, count: int, start: int) -> Dictionary:
	_pos += 1
	var die := _read_die()
	if not _error.is_empty():
		return _error
	if count < 1:
		return _fail("dice count must be at least 1", start)
	if count > MAX_DICE_PER_GROUP:
		return _fail("dice count exceeds %d" % MAX_DICE_PER_GROUP, start)

	var reroll := {}
	var explode := false
	var selection := {}
	while not _at_end():
		var character := _peek()
		if character == "!":
			if explode:
				return _fail("explode is already set", _pos)
			_assert_can_explode(die, _pos)
			if not _error.is_empty():
				return _error
			_pos += 1
			explode = true
			continue
		if character == "r" or character == "R":
			if not reroll.is_empty():
				return _fail("reroll is already set", _pos)
			reroll = _read_reroll(die)
			if not _error.is_empty():
				return _error
			continue
		if character != "" and _is_letter(character):
			if not selection.is_empty():
				return _fail("keep/drop is already set", _pos)
			selection = _read_selection(count)
			if not _error.is_empty():
				return _error
			continue
		break

	var node := {"type": "dice", "sign": sgn, "count": count, "sides": die["sides"]}
	if die.has("id"):
		node["die"] = die["id"]
	if not reroll.is_empty():
		node["reroll"] = reroll
	if explode:
		node["explode"] = true
	if not selection.is_empty():
		node["selection"] = selection
	return node


## Face values this die can produce, when they are knowable while parsing.
func _face_values(die: Dictionary):
	if not die.has("id"):
		return null
	var definition: Dictionary = _registry.get(String(die["id"]).to_lower(), {})
	if definition.is_empty():
		return null
	var values: Array = []
	for face in definition["faces"]:
		values.append(face["value"])
	return values


func _assert_can_explode(die: Dictionary, position: int) -> void:
	var values = _face_values(die)
	if values == null or values.is_empty():
		return
	var highest: int = values.max()
	for value in values:
		if value != highest:
			return
	_fail("every face of this die is its highest, so it would explode forever", position)


func _read_reroll(die: Dictionary) -> Dictionary:
	var start := _pos
	_pos += 1
	var next := _peek()
	var once := next == "o" or next == "O"
	if once:
		_pos += 1
	var threshold := _read_integer("reroll threshold")
	if not _error.is_empty():
		return {}

	var values = _face_values(die)
	var highest: int = values.max() if values != null else die["sides"]
	var lowest: int = values.min() if values != null else 1
	if threshold >= highest:
		_fail(
			"reroll threshold %d covers every face of this die, so it would never settle" % threshold,
			start,
		)
		return {}
	if threshold < lowest:
		_fail(
			"reroll threshold %d is below every face of this die, so it would do nothing" % threshold,
			start,
		)
		return {}
	return {"threshold": threshold, "once": once}


func _read_die() -> Dictionary:
	var character := _peek()
	if character == "%":
		_pos += 1
		return {"sides": 100}
	if character == "{":
		return _read_named_die()
	if character == "" or not _is_digit(character):
		_fail('expected a die size or {name} after "d"', _pos)
		return {}
	var start := _pos
	var sides := _read_integer("die size")
	if not _error.is_empty():
		return {}
	if sides < 2:
		_fail('d%d has no faces to roll; for a constant use a modifier such as "+%d"' % [sides, sides], start)
		return {}
	if sides > MAX_DIE_FACES:
		_fail("die size exceeds %d faces" % MAX_DIE_FACES, start)
		return {}
	return {"sides": sides}


func _read_named_die() -> Dictionary:
	var start := _pos
	_pos += 1
	var die_name := ""
	while not _at_end() and _peek() != "}":
		die_name += _source[_pos]
		_pos += 1
	if _at_end():
		_fail('unterminated die name; expected "}"', start)
		return {}
	_pos += 1
	if die_name.length() == 0:
		_fail("die name is empty", start)
		return {}

	var definition: Dictionary = _registry.get(die_name.to_lower(), {})
	if _has_registry and definition.is_empty():
		_fail('unknown die "%s"' % die_name, start)
		return {}
	if definition.is_empty():
		return {"sides": 0, "id": die_name}
	return {"sides": definition["faces"].size(), "id": definition["id"]}


func _read_selection(dice_count: int) -> Dictionary:
	var character := _peek()
	if character == "" or not _is_letter(character):
		return {}
	var start := _pos
	var mode := _source.substr(_pos, 2).to_lower()
	if mode not in SELECTION_MODES:
		_fail('unknown roll modifier "%s"; supported modifiers are kh, kl, dh, dl' % mode, start)
		return {}
	_pos += 2
	var count := 1
	var next := _peek()
	if next != "" and _is_digit(next):
		var count_start := _pos
		count = _read_integer("keep/drop count")
		if not _error.is_empty():
			return {}
		if count < 1:
			_fail("keep/drop count must be at least 1", count_start)
			return {}
		if count > dice_count:
			_fail(
				"keep/drop count %d exceeds the %d dice in the group" % [count, dice_count],
				count_start,
			)
			return {}
	return {"mode": mode, "count": count}


func _read_integer(label: String) -> int:
	var start := _pos
	var digits := ""
	while not _at_end():
		var character := _peek()
		if not _is_digit(character):
			break
		digits += character
		_pos += 1
	if digits.length() == 0:
		_fail("expected a %s" % label, start)
		return 0
	if digits.length() > 7:
		_fail("%s is too large" % label, start)
		return 0
	return digits.to_int()
