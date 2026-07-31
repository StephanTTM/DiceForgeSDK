class_name DiceForgeSeededRandom
extends RefCounted
## Port of the core's seeded random source: cyrb128 seeding into xoshiro128**.
##
## The bit-for-bit contract (ADR-0005, ADR-0021): the same seed produces the
## same nextUint32() sequence as the TypeScript core, verified against the
## exported conformance vectors. Everything is kept masked to unsigned 32 bits;
## GDScript's 64-bit integers make that safe as long as every product is built
## from halves that cannot overflow.

const MASK := 0xFFFFFFFF

var _s0: int
var _s1: int
var _s2: int
var _s3: int
var _seed_text: String


static func create(seed_value) -> RefCounted:
	var source := new()
	source._seed_text = str(seed_value)
	var state := _hash_seed(source._seed_text)
	if (state[0] | state[1] | state[2] | state[3]) == 0:
		# xoshiro must never start at the all-zero state.
		state = [0x9E3779B9, 0x243F6A88, 0xB7E15162, 0x8AED2A6A]
	source._s0 = state[0]
	source._s1 = state[1]
	source._s2 = state[2]
	source._s3 = state[3]
	return source


func next_uint32() -> int:
	var result := _imul(_rotl(_imul(_s1, 5), 7), 9)
	var t := (_s1 << 9) & MASK
	_s2 = _s2 ^ _s0
	_s3 = _s3 ^ _s1
	_s1 = _s1 ^ _s2
	_s0 = _s0 ^ _s3
	_s2 = _s2 ^ t
	_s3 = _rotl(_s3, 11)
	return result


func provenance() -> Dictionary:
	return {"source": "seeded", "seed": _seed_text, "algorithm": "xoshiro128**"}


## JavaScript's Math.imul — the low 32 bits of a 32x32 multiply — computed from
## 16-bit halves so no intermediate product can overflow a signed 64-bit int:
## (2^32-1)^2 would, and GDScript wraps silently rather than telling anyone.
static func _imul(a: int, b: int) -> int:
	var a_lo := a & 0xFFFF
	var a_hi := (a >> 16) & 0xFFFF
	return (a_lo * b + ((a_hi * b) & 0xFFFF) * 0x10000) & MASK


static func _rotl(x: int, k: int) -> int:
	return ((x << k) | (x >> (32 - k))) & MASK


## cyrb128 over UTF-16 code units, exactly as JavaScript's charCodeAt walks a
## string. Godot strings are code points, so astral characters are split into
## surrogate pairs here rather than trusting any buffer's byte order.
static func _hash_seed(text: String) -> Array:
	var h1 := 1779033703
	var h2 := 3144134277
	var h3 := 1013904242
	var h4 := 2773480762
	var units: Array[int] = []
	for i in text.length():
		var cp := text.unicode_at(i)
		if cp >= 0x10000:
			var v := cp - 0x10000
			units.append(0xD800 + (v >> 10))
			units.append(0xDC00 + (v & 0x3FF))
		else:
			units.append(cp)
	for k in units:
		h1 = (h2 ^ _imul(h1 ^ k, 597399067)) & MASK
		h2 = (h3 ^ _imul(h2 ^ k, 2869860233)) & MASK
		h3 = (h4 ^ _imul(h3 ^ k, 951274213)) & MASK
		h4 = (h1 ^ _imul(h4 ^ k, 2716044179)) & MASK
	h1 = _imul(h3 ^ (h1 >> 18), 597399067)
	h2 = _imul(h4 ^ (h2 >> 22), 2869860233)
	h3 = _imul(h1 ^ (h3 >> 17), 951274213)
	h4 = _imul(h2 ^ (h4 >> 19), 2716044179)
	return [(h1 ^ h2 ^ h3 ^ h4) & MASK, (h2 ^ h1) & MASK, (h3 ^ h1) & MASK, (h4 ^ h1) & MASK]
