class_name DiceForgePresenter3D
extends Node3D
## Presents an already-resolved DiceForge record with the forge models.
##
## The same doctrine as every DiceForge presenter (ADR-0007, rule 5): the
## record is the authority, and this node only shows it. Each die is posed by
## the calibrated rotation that brings its recorded value to the top — the
## rotations come from the asset set's own manifest, the same numbers that
## drive the web renderer, so a face that reads correctly there reads
## correctly here.
##
##     var presenter := DiceForgePresenter3D.new()
##     add_child(presenter)
##     presenter.configure("path/to/assets-forge/forge", "red")
##     presenter.present(forge.roll("4d6dl1"))
##
## First slice: settled poses for d4-d20 dice and the coin. Percentile pairs,
## custom dice and motion are future work; `present` returns false when a
## record needs something this cannot yet show, so a caller can fall back.

const DIE_SPACING := 3.2
const DROPPED_DARKEN := 0.45
## Authored tumble timings (ADR-0007's approach, not simulated physics: the
## engine exposes no manual physics stepping — measured, see TASKS — so motion
## is designed to end on the calibrated pose rather than corrected into it).
##
## The arc is tuned against real gravity rather than by vibe: honest gravity at
## forge-die scale would land a die in ~90 ms — unreadably fast — and the first
## cut fell twenty times slower than real, which read as dice on the moon. This
## is ~4x slow motion of the real thing: a 220 ms fall, bounces sized by a
## restitution of about 0.35, and tumble that stays energetic until just
## before rest.
const ROLL_SECONDS := 0.8
const ROLL_STAGGER := 0.07
const DROP_HEIGHT := 6.5
const REVEAL_SECONDS := 0.35

const DROPPED_SCALE := 0.82
## Story pacing: how long a rerolled or exploding value is readable before its
## consequence plays, and how long each consequence takes.
const STORY_HOLD := 0.4
const RETOSS_SECONDS := 0.55
const RETOSS_HEIGHT := 3.4
const POP_SECONDS := 0.3
const SPAWN_SECONDS := 0.5
const SPAWN_HEIGHT := 4.5
## Scatter mode's collision-free spacing between resting dice, in die widths of
## the resting area's Poisson-style sampling.
const SCATTER_MIN_DISTANCE := 2.5

## When true, dice come to rest strewn about the stage with random headings,
## like a real throw, instead of on the tidy reading grid — spots are sampled
## collision-free, so no two dice overlap at rest. Set it before presenting.
## Flights cross and jostle visually, but this is authored motion: true
## rigid-body contact between dice waits on engine physics stepping (TASKS).
var scatter := false

var _assets_dir := ""
var _color := "ivory"
var _manifest: Dictionary = {}
var _models: Dictionary = {}
var _textures: Dictionary = {}
## Bumped by every presentation; a running animation that no longer matches it
## has been superseded and stands down without touching freed dice.
var _run_id := 0
var _animating_run := -1


## Points the presenter at a forge asset directory (the contents of
## `@diceforge-sdk/assets-forge`'s `forge/` folder) and a colour variant.
##
## Both arguments are optional. With no directory, the presenter looks for
## assets bundled beside its own script (`assets/forge/`, the Asset Library
## layout) — found relative to the script, so a relocated addon folder still
## finds its own dice.
func configure(assets_dir: String = "", color: String = "ivory") -> bool:
	if assets_dir == "":
		assets_dir = (get_script() as Script).resource_path.get_base_dir().path_join(
			"assets/forge"
		)
	_assets_dir = assets_dir
	if color != _color:
		# Textures are cached per name; a colour change invalidates them all.
		_textures = {}
	_color = color
	var text := _read_text(assets_dir.path_join("face-rotations.json"))
	if text == "":
		push_error("DiceForge: cannot open %s/face-rotations.json" % assets_dir)
		return false
	var parsed = JSON.parse_string(text)
	if parsed == null or not parsed is Dictionary:
		push_error("DiceForge: face-rotations.json did not parse")
		return false
	_manifest = parsed
	return true


static func _read_text(path: String) -> String:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	var text := file.get_as_text()
	file.close()
	return text


## The story a group's dice tell, reconstructed from rolled order (ADR-0016):
## one lineage per original die — the values it showed and lost to rerolls,
## then past its kept value, each explosion that replaced it with a successor.
## `final` is the die left standing at the end of the story; every value along
## the way still counted exactly as the record says.
static func roll_lineages(record: Dictionary) -> Array:
	var lineages: Array = []
	if record.get("kind", "") != "roll":
		return lineages
	for group in record["groups"]:
		var sides := int(group["sides"])
		var current: Dictionary = {}
		for die in group["dice"]:
			var source: String = die.get("source", "")
			var gone: bool = die.get("rerolled", false)
			var entry := {"value": int(die["value"]), "kept": bool(die["kept"])}
			if source == "explosion":
				# The die that showed its highest face is destroyed on stage;
				# this entry is the die it became.
				current["steps"].append({"value": current["final"]["value"], "action": "explode"})
				current["final"] = entry
			elif source == "reroll":
				if gone:
					current["steps"].append({"value": entry["value"], "action": "reroll"})
				else:
					current["final"] = entry
			else:
				if not current.is_empty():
					lineages.append(current)
				current = {"sides": sides, "steps": [], "final": entry}
				if gone:
					current["steps"].append({"value": entry["value"], "action": "reroll"})
					current["final"] = {}
		if not current.is_empty():
			lineages.append(current)
	return lineages


## Calibrated rotation bringing `value` to the top of a die of `sides`.
func _rotation_for(sides: int, value: int) -> Quaternion:
	var q: Array = _manifest["d%d" % sides]["rotations"][value - 1]
	return Quaternion(q[0], q[1], q[2], q[3])


## Shows a resolved record, settled. Returns false — with nothing drawn — when
## the record needs a model this slice does not have. Presenting supersedes any
## animation still in flight, which simply stands down.
func present(record: Dictionary) -> bool:
	return _lay_out(record, true, null)


func _lay_out(record: Dictionary, dim_dropped: bool, rng: RandomNumberGenerator) -> bool:
	_run_id += 1
	if record.has("error"):
		return false
	for child in get_children():
		# Removed now, not merely queued: the caller may count or replace the
		# presented dice in the same frame, and a deferred free would leave the
		# last roll standing in the tally.
		remove_child(child)
		child.queue_free()
	if record.get("kind", "") == "coin-flip":
		return _present_coin(record)
	if record.get("kind", "") != "roll":
		return false

	for group in record["groups"]:
		if group.has("die") or not _manifest.has("d%d" % int(group["sides"])):
			return false  # custom or unmodelled dice: future work
	# One die on stage per lineage: rerolled values and exploded predecessors
	# are the animated story's business; the settled stage shows what remains.
	var dice: Array = []
	for lineage in roll_lineages(record):
		dice.append({
			"sides": lineage["sides"],
			"value": lineage["final"]["value"],
			"kept": lineage["final"]["kept"],
		})

	if scatter and rng == null:
		rng = RandomNumberGenerator.new()
		rng.randomize()
	var slots := _slots(dice.size(), rng)
	for index in dice.size():
		var die: Dictionary = dice[index]
		var posed := _build_die(die["sides"], die["value"])
		if posed == null:
			return false
		posed.set_meta("diceforge_kept", die["kept"])
		if scatter:
			# A random heading about the vertical is a real throw's rest pose,
			# and it cannot change which face is up — rotation about the world
			# up axis preserves every face's height, so face_up() and the
			# record agree exactly as on the grid.
			posed.quaternion = Quaternion(Vector3.UP, rng.randf_range(0.0, TAU)) * posed.quaternion
		if dim_dropped and not die["kept"]:
			posed.scale = Vector3.ONE * DROPPED_SCALE
			_darken(posed)
		posed.position = slots[index]
		add_child(posed)
	return true


## Resting spots: the tidy reading grid, or — in scatter mode — collision-free
## random spots in an area sized to the roll, rejection-sampled so no two dice
## overlap at rest. A spot that cannot be placed after many tries falls back to
## its grid position rather than stacking.
func _slots(count: int, rng: RandomNumberGenerator) -> Array:
	var columns := ceili(sqrt(float(count)))
	var rows := ceili(float(count) / float(columns))
	var slots: Array = []
	for index in count:
		var column := index % columns
		@warning_ignore("integer_division")
		var row := index / columns
		slots.append(Vector3(
			(column - (columns - 1) / 2.0) * DIE_SPACING,
			0.0,
			(row - (rows - 1) / 2.0) * DIE_SPACING,
		))
	if not scatter or rng == null:
		return slots
	var half := maxf(2.2, 0.62 * DIE_SPACING * sqrt(float(count)))
	var placed: Array = []
	for index in count:
		var spot: Vector3 = slots[index]
		for attempt in 40:
			var candidate := Vector3(rng.randf_range(-half, half), 0.0, rng.randf_range(-half, half))
			var clear := true
			for other in placed:
				if candidate.distance_to(other) < SCATTER_MIN_DISTANCE:
					clear = false
					break
			if clear:
				spot = candidate
				break
		placed.append(spot)
	return placed


func _present_coin(record: Dictionary) -> bool:
	if not _manifest.has("coin"):
		return false
	var entry: Dictionary = _manifest["coin"]
	var model := _instantiate("coin")
	if model == null:
		return false
	var face_index := 0 if record["outcome"] == "heads" else 1
	var q: Array = entry["rotations"][face_index]
	var wrapper := Node3D.new()
	wrapper.add_child(model)
	wrapper.quaternion = Quaternion(q[0], q[1], q[2], q[3])
	for slot in ["heads", "tails", "rim"]:
		_apply_texture(model, "coin_%s" % slot, slot)
	add_child(wrapper)
	return true


## True while `present_animated` is playing; `animation_finished` fires after.
signal animation_finished

func is_animating() -> bool:
	return _animating_run != -1


## Rolls the record in: dice drop, bounce and tumble, then settle on exactly
## the calibrated pose — an authored animation in ADR-0007's sense, designed to
## end on the recorded face, so nothing is simulated and nothing is corrected.
## Dropped dice dim once the roll has landed, the way the web presenter reveals
## them. `motion_seed` >= 0 makes the motion reproducible (screenshots, tests);
## the outcome needs no such help, it was decided before this ran.
##
## Await it like any coroutine:
##     await presenter.present_animated(record)
func present_animated(record: Dictionary, motion_seed: int = -1) -> bool:
	var rng := RandomNumberGenerator.new()
	if motion_seed >= 0:
		rng.seed = motion_seed
	else:
		rng.randomize()
	# Laid out undimmed: kept-ness is a reveal after landing, and pre-dimmed
	# dice would fly dark and then dim twice. The rng rides along so scatter
	# spots reproduce under a motion seed.
	if not _lay_out(record, false, rng):
		return false
	# This animation belongs to this presentation. A new present() bumps the
	# counter, and a superseded flight stands down at its next frame — which is
	# what makes "reroll while the dice are still rolling" a supported move
	# rather than an error against freed nodes.
	var run := _run_id

	# One flight per lineage: the initial throw lands the FIRST value the die
	# showed, and the segment timeline then plays its story — a rerolled value
	# holds, re-tosses, and lands its successor; an exploding value holds, pops
	# out of existence, and its successor drops onto the same spot. Every value
	# comes from the record; the story only decides when each one is visible.
	var lineages := roll_lineages(record)
	var flights: Array = []
	var children := get_children()
	var is_coin: bool = record.get("kind", "") == "coin-flip"
	var total := 0.0
	for index in children.size():
		var wrapper: Node3D = children[index]
		var target: Quaternion = wrapper.quaternion
		var sides := 0
		var steps: Array = []
		if not is_coin and index < lineages.size():
			sides = int(lineages[index]["sides"])
			steps = lineages[index]["steps"]
		# Scatter already turned the wrapper; the heading is everything the
		# final pose carries beyond the calibrated rotation.
		var yaw := Quaternion.IDENTITY
		if not is_coin and sides > 0:
			yaw = target * _rotation_for(sides, int(lineages[index]["final"]["value"])).inverse()

		var first_target := target
		if steps.size() > 0:
			first_target = yaw * _rotation_for(sides, int(steps[0]["value"]))

		var direction := rng.randf_range(0.0, TAU)
		var flight := {
			"wrapper": wrapper,
			"slot": wrapper.position,
			"kept": wrapper.get_meta("diceforge_kept", true),
			"delay": index * ROLL_STAGGER,
			"target_q": first_target,
			"start_q": Quaternion(
				Vector3(rng.randf_range(-1, 1), rng.randf_range(-1, 1), rng.randf_range(-1, 1)).normalized(),
				rng.randf_range(0.0, TAU)
			),
			"axis": Vector3(
				rng.randf_range(-1, 1), rng.randf_range(-0.3, 0.3), rng.randf_range(-1, 1)
			).normalized(),
			"rate": rng.randf_range(11.0, 17.0),
			"lateral": Vector3(cos(direction), 0.0, sin(direction)) * rng.randf_range(2.0, 3.2),
			"segments": [],
		}

		# The story timeline, in absolute seconds.
		var cursor: float = flight["delay"] + ROLL_SECONDS
		for step_index in steps.size():
			var step: Dictionary = steps[step_index]
			var shown: Quaternion = yaw * _rotation_for(sides, int(step["value"]))
			var next_value: int = (
				int(steps[step_index + 1]["value"]) if step_index + 1 < steps.size()
				else int(lineages[index]["final"]["value"])
			)
			var next_q: Quaternion = yaw * _rotation_for(sides, next_value)
			flight["segments"].append({
				"type": "hold", "from": cursor, "to": cursor + STORY_HOLD, "pose": shown,
			})
			cursor += STORY_HOLD
			if step["action"] == "reroll":
				flight["segments"].append({
					"type": "retoss", "from": cursor, "to": cursor + RETOSS_SECONDS,
					"pose": shown, "to_pose": next_q,
					"axis": Vector3(
						rng.randf_range(-1, 1), rng.randf_range(-0.3, 0.3), rng.randf_range(-1, 1)
					).normalized(),
					"rate": rng.randf_range(10.0, 15.0),
				})
				cursor += RETOSS_SECONDS
			else:
				flight["segments"].append({
					"type": "pop", "from": cursor, "to": cursor + POP_SECONDS, "pose": shown,
				})
				cursor += POP_SECONDS
				flight["segments"].append({
					"type": "spawn", "from": cursor, "to": cursor + SPAWN_SECONDS,
					"to_pose": next_q,
					"start_q": Quaternion(
						Vector3(rng.randf_range(-1, 1), rng.randf_range(-1, 1), rng.randf_range(-1, 1)).normalized(),
						rng.randf_range(0.0, TAU)
					),
					"axis": Vector3(
						rng.randf_range(-1, 1), rng.randf_range(-0.3, 0.3), rng.randf_range(-1, 1)
					).normalized(),
					"rate": rng.randf_range(9.0, 14.0),
				})
				cursor += SPAWN_SECONDS
		flight["final_q"] = (
			yaw * _rotation_for(sides, int(lineages[index]["final"]["value"])) if sides > 0 else target
		)
		flight["done_at"] = cursor
		total = maxf(total, cursor)
		flights.append(flight)

	# Airborne before the first frame draws, or the settled dice flash once.
	for flight in flights:
		_story_pose(flight, 0.0)

	_animating_run = run
	var elapsed := 0.0
	while elapsed < total:
		await get_tree().process_frame
		if run != _run_id:
			return _stand_down(run)
		elapsed += get_process_delta_time()
		for flight in flights:
			_story_pose(flight, elapsed)
	for flight in flights:
		_story_pose(flight, flight["done_at"] + 1.0)

	# The reveal: dice that were dropped dim and shrink now that the roll can
	# be read, mirroring the web presenter's timing.
	var dimmed := false
	for flight in flights:
		if not flight["kept"]:
			_darken(flight["wrapper"])
			dimmed = true
	if dimmed:
		elapsed = 0.0
		while elapsed < REVEAL_SECONDS:
			await get_tree().process_frame
			if run != _run_id:
				return _stand_down(run)
			elapsed += get_process_delta_time()
			var k := clampf(elapsed / REVEAL_SECONDS, 0.0, 1.0)
			for flight in flights:
				if not flight["kept"]:
					flight["wrapper"].scale = Vector3.ONE.lerp(Vector3.ONE * DROPPED_SCALE, k)
		for flight in flights:
			if not flight["kept"]:
				flight["wrapper"].scale = Vector3.ONE * DROPPED_SCALE
	_animating_run = -1
	animation_finished.emit()
	return true


## One lineage at one instant: the initial throw, then whatever segment of its
## story the clock has reached. Past the last segment the die rests on exactly
## its final calibrated pose — reached by construction, not by snap.
func _story_pose(flight: Dictionary, t: float) -> void:
	var wrapper: Node3D = flight["wrapper"]
	if not is_instance_valid(wrapper):
		return
	var local := t - float(flight["delay"])
	if local <= ROLL_SECONDS:
		_fly(flight, clampf(local / ROLL_SECONDS, 0.0, 1.0))
		return
	var slot: Vector3 = flight["slot"]
	for segment in flight["segments"]:
		if t < segment["from"] or t >= segment["to"]:
			continue
		var u: float = (t - segment["from"]) / (segment["to"] - segment["from"])
		match segment["type"]:
			"hold":
				wrapper.position = slot
				wrapper.scale = Vector3.ONE
				wrapper.quaternion = segment["pose"]
			"retoss":
				wrapper.position = Vector3(slot.x, RETOSS_HEIGHT * 4.0 * u * (1.0 - u), slot.z)
				wrapper.scale = Vector3.ONE
				var spun: Quaternion = (
					segment["pose"] * Quaternion(segment["axis"], segment["rate"] * RETOSS_SECONDS * u)
				)
				wrapper.quaternion = spun.slerp(segment["to_pose"], smoothstep(0.35, 0.95, u))
			"pop":
				wrapper.position = slot
				# Swell, spin up, and vanish: the die explodes.
				wrapper.scale = Vector3.ONE * maxf((1.0 + 0.45 * u) * (1.0 - u * u), 0.0001)
				wrapper.quaternion = segment["pose"] * Quaternion(Vector3.UP, 7.0 * u)
			"spawn":
				wrapper.scale = Vector3.ONE
				wrapper.position = Vector3(slot.x, SPAWN_HEIGHT * (1.0 - u) * (1.0 - u), slot.z)
				var tumbling: Quaternion = (
					segment["start_q"] * Quaternion(segment["axis"], segment["rate"] * SPAWN_SECONDS * u)
				)
				wrapper.quaternion = tumbling.slerp(segment["to_pose"], smoothstep(0.3, 0.95, u))
		return
	# Between segments, or done: rest on whatever the story has reached.
	wrapper.position = slot
	wrapper.scale = Vector3.ONE
	if t >= float(flight["done_at"]):
		wrapper.quaternion = flight["final_q"]
		return
	for segment in flight["segments"]:
		if t < segment["from"]:
			wrapper.quaternion = segment.get("pose", flight["final_q"])
			return
	wrapper.quaternion = flight["final_q"]


## A superseded animation exits quietly: newer dice are on stage, and the old
## flight must not touch them — or the freed nodes it used to own.
func _stand_down(run: int) -> bool:
	if _animating_run == run:
		_animating_run = -1
	animation_finished.emit()
	return false


## One die at one instant of its authored flight. At t = 1 the pose IS the
## calibrated target — reached by construction, not by snap.
func _fly(flight: Dictionary, t: float) -> void:
	var wrapper: Node3D = flight["wrapper"]
	if not is_instance_valid(wrapper):
		return
	var slot: Vector3 = flight["slot"]

	# Height: a fast fall, a real bounce, and a settle bounce — segment lengths
	# follow from the restitution, not taste alone.
	var y := 0.0
	if t < 0.3:
		var u := t / 0.3
		y = DROP_HEIGHT * (1.0 - u) * (1.0 - u)
	elif t < 0.48:
		var u := (t - 0.3) / 0.18
		y = 0.72 * 4.0 * u * (1.0 - u)
	elif t < 0.6:
		var u := (t - 0.48) / 0.12
		y = 0.16 * 4.0 * u * (1.0 - u)

	# Thrown in from the side, arriving with speed rather than drifting.
	var approach: Vector3 = flight["lateral"] * pow(1.0 - t, 2.4)
	wrapper.position = Vector3(slot.x + approach.x, y, slot.z + approach.z)

	# Free tumble through the bounces, locked to the exact calibrated pose only
	# just before rest — an early ease is what read as gentle.
	var free: Quaternion = flight["start_q"] * Quaternion(flight["axis"], flight["rate"] * ROLL_SECONDS * t)
	var settle := smoothstep(0.5, 0.96, t)
	wrapper.quaternion = free.slerp(flight["target_q"], settle)


## A die at its calibrated final pose, undimmed — the shared start point for
## both the posed and the animated presentations. The face the record holds is
## brought to the top by the calibrated rotation, never by choosing a face
## (rule 5: presentation shows, it does not decide).
func _build_die(sides: int, value: int) -> Node3D:
	var entry: Dictionary = _manifest.get("d%d" % sides, {})
	var model := _instantiate("d%d" % sides)
	if model == null or entry.is_empty():
		return null
	_apply_texture(model, "d%d" % sides, "")
	var q: Array = entry["rotations"][value - 1]
	var wrapper := Node3D.new()
	wrapper.add_child(model)
	wrapper.quaternion = Quaternion(q[0], q[1], q[2], q[3])
	return wrapper


## Which face the calibrated tables say is up in this pose — the mechanical
## check a demo can run against the record, so a screenshot is evidence rather
## than the only witness.
func face_up(sides: int, pose: Quaternion) -> int:
	var entry: Dictionary = _manifest.get("d%d" % sides, {})
	var best := 0
	var best_y := -INF
	for index in int(entry["faces"]):
		var q: Array = entry["rotations"][index]
		var rotation := Quaternion(q[0], q[1], q[2], q[3])
		# The rotation brings face index+1 to +Y, so its inverse says where
		# that face rests; the pose then says where it is now.
		var rest := rotation.inverse() * Vector3.UP
		var now := pose * rest
		if now.y > best_y:
			best_y = now.y
			best = index + 1
	return best


## Dropped dice stay legible but visibly out of the running.
func _darken(model: Node3D) -> void:
	for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		if mesh.mesh == null:
			continue
		for surface in mesh.mesh.get_surface_count():
			var material := mesh.get_active_material(surface)
			if material is BaseMaterial3D:
				var dimmed: BaseMaterial3D = material.duplicate()
				dimmed.albedo_color = material.albedo_color.darkened(DROPPED_DARKEN)
				mesh.set_surface_override_material(surface, dimmed)


func _instantiate(name_key: String) -> Node3D:
	if not _models.has(name_key):
		var path := _assets_dir.path_join("%s.glb" % name_key)
		if ResourceLoader.exists(path):
			# Inside the project the editor has imported the model; loading the
			# imported resource is what makes exported games work untouched.
			var packed: PackedScene = load(path)
			_models[name_key] = packed.instantiate()
		else:
			var doc := GLTFDocument.new()
			var state := GLTFState.new()
			if doc.append_from_file(path, state) != OK:
				push_error("DiceForge: cannot load %s" % path)
				return null
			_models[name_key] = doc.generate_scene(state)
	var source: Node3D = _models[name_key]
	var copy := source.duplicate() as Node3D
	_recenter(copy)
	return copy


## The calibrated rotations assume a model centred on the origin, exactly as
## the web loader normalizes (models.ts); the forge models are authored that
## way, and recentring is cheap insurance for anyone else's.
func _recenter(model: Node3D) -> void:
	var merged := AABB()
	var first := true
	for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		var aabb: AABB = mesh.transform * mesh.get_aabb()
		merged = aabb if first else merged.merge(aabb)
		first = false
	if not first:
		model.position = -merged.get_center()


func _apply_texture(model: Node3D, texture_name: String, material_suffix: String) -> void:
	var texture: Texture2D = _texture(texture_name)
	if texture == null:
		return
	for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		if mesh.mesh == null:
			continue
		for surface in mesh.mesh.get_surface_count():
			var material := mesh.get_active_material(surface)
			if material == null or not material is BaseMaterial3D:
				continue
			if material_suffix != "" and not material.resource_name.ends_with(material_suffix):
				continue
			var painted: BaseMaterial3D = material.duplicate()
			painted.albedo_texture = texture
			painted.albedo_color = Color.WHITE
			mesh.set_surface_override_material(surface, painted)


func _texture(texture_name: String) -> Texture2D:
	if _textures.has(texture_name):
		return _textures[texture_name]
	var path := _assets_dir.path_join("textures").path_join(_color).path_join("%s.png" % texture_name)
	var texture: Texture2D
	if ResourceLoader.exists(path):
		texture = load(path)
	else:
		var image := Image.load_from_file(path)
		if image == null:
			push_error("DiceForge: cannot load %s" % path)
			return null
		image.generate_mipmaps()
		texture = ImageTexture.create_from_image(image)
	_textures[texture_name] = texture
	return texture
