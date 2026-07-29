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
const ROLL_SECONDS := 0.85
const ROLL_STAGGER := 0.07
const DROP_HEIGHT := 5.5
const REVEAL_SECONDS := 0.35

const DROPPED_SCALE := 0.82

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


## Shows a resolved record, settled. Returns false — with nothing drawn — when
## the record needs a model this slice does not have. Presenting supersedes any
## animation still in flight, which simply stands down.
func present(record: Dictionary) -> bool:
	return _lay_out(record, true)


func _lay_out(record: Dictionary, dim_dropped: bool) -> bool:
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

	var dice: Array = []
	for group in record["groups"]:
		if group.has("die") or not _manifest.has("d%d" % int(group["sides"])):
			return false  # custom or unmodelled dice: future work
		for die in group["dice"]:
			dice.append({"sides": int(group["sides"]), "value": int(die["value"]), "kept": die["kept"]})

	var columns := ceili(sqrt(float(dice.size())))
	var rows := ceili(float(dice.size()) / float(columns))
	for index in dice.size():
		var die: Dictionary = dice[index]
		var posed := _build_die(die["sides"], die["value"])
		if posed == null:
			return false
		posed.set_meta("diceforge_kept", die["kept"])
		if dim_dropped and not die["kept"]:
			posed.scale = Vector3.ONE * DROPPED_SCALE
			_darken(posed)
		var column := index % columns
		@warning_ignore("integer_division")
		var row := index / columns
		posed.position = Vector3(
			(column - (columns - 1) / 2.0) * DIE_SPACING,
			0.0,
			(row - (rows - 1) / 2.0) * DIE_SPACING,
		)
		add_child(posed)
	return true


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
	# Laid out undimmed: kept-ness is a reveal after landing, and pre-dimmed
	# dice would fly dark and then dim twice.
	if not _lay_out(record, false):
		return false
	# This animation belongs to this presentation. A new present() bumps the
	# counter, and a superseded flight stands down at its next frame — which is
	# what makes "reroll while the dice are still rolling" a supported move
	# rather than an error against freed nodes.
	var run := _run_id
	var rng := RandomNumberGenerator.new()
	if motion_seed >= 0:
		rng.seed = motion_seed
	else:
		rng.randomize()

	var flights: Array = []
	var index := 0
	for wrapper in get_children():
		var lateral := Vector3(rng.randf_range(-1.4, 1.4), 0.0, rng.randf_range(-1.4, 1.4))
		flights.append({
			"wrapper": wrapper,
			"target_q": wrapper.quaternion,
			"slot": wrapper.position,
			"start_q": Quaternion(
				Vector3(rng.randf_range(-1, 1), rng.randf_range(-1, 1), rng.randf_range(-1, 1)).normalized(),
				rng.randf_range(0.0, TAU)
			),
			"axis": Vector3(
				rng.randf_range(-1, 1), rng.randf_range(-0.3, 0.3), rng.randf_range(-1, 1)
			).normalized(),
			"rate": rng.randf_range(9.0, 14.0),
			"lateral": lateral,
			"delay": index * ROLL_STAGGER,
			"kept": wrapper.get_meta("diceforge_kept", true),
		})
		index += 1

	# Airborne before the first frame draws, or the settled dice flash once.
	for flight in flights:
		_fly(flight, 0.0)

	var total := ROLL_SECONDS + ROLL_STAGGER * maxi(flights.size() - 1, 0)
	_animating_run = run
	var elapsed := 0.0
	while elapsed < total:
		await get_tree().process_frame
		if run != _run_id:
			return _stand_down(run)
		elapsed += get_process_delta_time()
		for flight in flights:
			_fly(flight, clampf((elapsed - flight["delay"]) / ROLL_SECONDS, 0.0, 1.0))
	for flight in flights:
		_fly(flight, 1.0)

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

	# Height: a fall, a real bounce, and a settle bounce.
	var y := 0.0
	if t < 0.5:
		var u := t / 0.5
		y = DROP_HEIGHT * (1.0 - u) * (1.0 - u)
	elif t < 0.78:
		var u := (t - 0.5) / 0.28
		y = 1.1 * 4.0 * u * (1.0 - u)
	elif t < 0.94:
		var u := (t - 0.78) / 0.16
		y = 0.28 * 4.0 * u * (1.0 - u)

	var approach: Vector3 = flight["lateral"] * pow(1.0 - t, 1.5)
	wrapper.position = Vector3(slot.x + approach.x, y, slot.z + approach.z)

	# Free tumble early, eased into the exact calibrated pose by the end.
	var free: Quaternion = flight["start_q"] * Quaternion(flight["axis"], flight["rate"] * ROLL_SECONDS * t)
	var settle := smoothstep(0.42, 1.0, t)
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
