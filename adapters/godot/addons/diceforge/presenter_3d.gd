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

var _assets_dir := ""
var _color := "ivory"
var _manifest: Dictionary = {}
var _models: Dictionary = {}
var _textures: Dictionary = {}


## Points the presenter at a forge asset directory (the contents of
## `@diceforge-sdk/assets-forge`'s `forge/` folder) and a colour variant.
func configure(assets_dir: String, color: String) -> bool:
	_assets_dir = assets_dir
	if color != _color:
		# Textures are cached per name; a colour change invalidates them all.
		_textures = {}
	_color = color
	var file := FileAccess.open(assets_dir.path_join("face-rotations.json"), FileAccess.READ)
	if file == null:
		push_error("DiceForge: cannot open %s/face-rotations.json" % assets_dir)
		return false
	var parsed = JSON.parse_string(file.get_as_text())
	if parsed == null or not parsed is Dictionary:
		push_error("DiceForge: face-rotations.json did not parse")
		return false
	_manifest = parsed
	return true


## Shows a resolved record. Returns false — with nothing drawn — when the
## record needs a model this slice does not have.
func present(record: Dictionary) -> bool:
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
		var posed := _pose_die(die["sides"], die["value"], die["kept"])
		if posed == null:
			return false
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


## The face the record holds, brought to the top by the calibrated rotation —
## never by choosing a face (rule 5: presentation shows, it does not decide).
func _pose_die(sides: int, value: int, kept: bool) -> Node3D:
	var entry: Dictionary = _manifest.get("d%d" % sides, {})
	var model := _instantiate("d%d" % sides)
	if model == null or entry.is_empty():
		return null
	_apply_texture(model, "d%d" % sides, "")
	var q: Array = entry["rotations"][value - 1]
	var wrapper := Node3D.new()
	wrapper.add_child(model)
	wrapper.quaternion = Quaternion(q[0], q[1], q[2], q[3])
	if not kept:
		wrapper.scale = Vector3.ONE * 0.82
		_darken(model)
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
		var doc := GLTFDocument.new()
		var state := GLTFState.new()
		var path := _assets_dir.path_join("%s.glb" % name_key)
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
	var texture := _texture(texture_name)
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


func _texture(texture_name: String) -> ImageTexture:
	if _textures.has(texture_name):
		return _textures[texture_name]
	var path := _assets_dir.path_join("textures").path_join(_color).path_join("%s.png" % texture_name)
	var image := Image.load_from_file(path)
	if image == null:
		push_error("DiceForge: cannot load %s" % path)
		return null
	image.generate_mipmaps()
	var texture := ImageTexture.create_from_image(image)
	_textures[texture_name] = texture
	return texture
