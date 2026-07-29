extends Node3D
## Rolls seeded expressions through the GDScript engine, presents them with the
## forge models, mechanically checks every posed face against the record, and
## saves viewport captures — so progress is reviewable from a chat window while
## nobody is at the desk.

const Forge := preload("res://addons/diceforge/dice_forge.gd")
const Presenter := preload("res://addons/diceforge/presenter_3d.gd")

const SHOTS := [
	{"name": "set-every-shape", "seed": "table-42", "roll": "1d4+1d6+1d8+1d10+1d12+1d20", "color": "red"},
	{"name": "dropped-die", "seed": "table-42", "roll": "4d6dl1", "color": "blue"},
	{"name": "advantage-pair", "seed": "vectors", "roll": "2d20kh1", "color": "green"},
	{"name": "coin-heads", "seed": "table-42", "flip": true, "color": "yellow"},
	# The rolling motion, captured mid-air and after settling. Motion is seeded
	# so these frames reproduce; the outcome never needed the help.
	{"name": "rolling", "seed": "table-42", "roll": "4d6dl1", "color": "ivory", "animate": true},
]

var _report: Array[String] = []
var _failures := 0


func _ready() -> void:
	var assets := ProjectSettings.globalize_path("res://").path_join(
		"../../packages/assets-forge/forge"
	)
	var shots_dir := ProjectSettings.globalize_path("res://").path_join("screenshots")
	DirAccess.make_dir_recursive_absolute(shots_dir)

	var presenter := Presenter.new()
	add_child(presenter)

	for shot in SHOTS:
		if not presenter.configure(assets, shot["color"]):
			_fail("%s: assets did not configure" % shot["name"])
			continue
		var forge := Forge.seeded(shot["seed"])
		var record = forge.flip_coin() if shot.get("flip", false) else forge.roll(shot["roll"])
		if shot.get("animate", false):
			await _animated_shot(shot, presenter, record, shots_dir)
			continue
		if not presenter.present(record):
			_fail("%s: presenter declined the record" % shot["name"])
			continue
		_check_faces(shot["name"], presenter, record)
		_frame_camera(presenter)
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		image.save_png(shots_dir.path_join("%s.png" % shot["name"]))
		_report.append("SHOT %s: %s" % [shot["name"], _describe(record)])

	var summary := "DEMO %s: %d shots, %d failures" % [
		"PASS" if _failures == 0 else "FAIL", SHOTS.size(), _failures
	]
	print(summary)
	_report.append(summary)
	var out := FileAccess.open(
		ProjectSettings.globalize_path("res://").path_join("screenshots/report.txt"),
		FileAccess.WRITE,
	)
	if out != null:
		out.store_string("\n".join(_report) + "\n")
	get_tree().quit(0 if _failures == 0 else 1)


## Every wrapper's pose must bring exactly the recorded value up — the
## screenshot shows it, this proves it.
func _check_faces(shot_name: String, presenter: Node3D, record: Dictionary) -> void:
	if record.get("kind", "") != "roll":
		return
	var expected: Array = []
	for group in record["groups"]:
		for die in group["dice"]:
			expected.append({"sides": int(group["sides"]), "value": int(die["value"])})
	var wrappers := presenter.get_children()
	if wrappers.size() != expected.size():
		_fail("%s: %d dice posed for %d in the record" % [shot_name, wrappers.size(), expected.size()])
		return
	for index in expected.size():
		var up: int = presenter.face_up(expected[index]["sides"], wrappers[index].quaternion)
		if up != expected[index]["value"]:
			_fail(
				"%s: die %d shows %d, record says %d"
				% [shot_name, index, up, expected[index]["value"]]
			)


## Runs the tumble, captures it mid-air and settled, and only checks faces
## once the animation claims to be done — the settled pose must still equal
## the record exactly, or the ease-in lied.
##
## Godot 4.7 refuses fire-and-forget coroutines, so the mid-flight captures
## are armed as timer signals — the sanctioned async entry point — before the
## animation itself is awaited.
func _animated_shot(shot: Dictionary, presenter: Node3D, record: Dictionary, shots_dir: String) -> void:
	presenter.present(record)
	_frame_camera(presenter)
	get_tree().create_timer(0.22).timeout.connect(
		_snap.bind(shots_dir.path_join("%s-midair.png" % shot["name"]))
	)
	get_tree().create_timer(0.55).timeout.connect(
		_snap.bind(shots_dir.path_join("%s-bounce.png" % shot["name"]))
	)
	await presenter.present_animated(record, 7)
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(
		shots_dir.path_join("%s-settled.png" % shot["name"])
	)
	_check_faces(shot["name"], presenter, record)
	_report.append("SHOT %s (animated): %s" % [shot["name"], _describe(record)])


## Signal-invoked, so it may await; saves whatever is on screen right now.
func _snap(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)


func _fail(message: String) -> void:
	_failures += 1
	printerr("FAIL %s" % message)
	_report.append("FAIL %s" % message)


func _describe(record: Dictionary) -> String:
	if record.get("kind", "") == "coin-flip":
		return "coin: %s" % record["outcome"]
	var values: Array = []
	for group in record["groups"]:
		for die in group["dice"]:
			values.append("%d%s" % [int(die["value"]), "" if die["kept"] else "(dropped)"])
	return "%s = %s -> total %d" % [record["expression"], ", ".join(values), int(record["total"])]


## Fits the camera to however many dice the shot laid out.
func _frame_camera(presenter: Node3D) -> void:
	var camera: Camera3D = $Camera3D
	var extent := 2.0
	for wrapper in presenter.get_children():
		extent = maxf(extent, Vector2(wrapper.position.x, wrapper.position.z).length() + 2.4)
	# Steep enough that the top face dominates the read — at 58 degrees a d20's
	# camera-facing neighbour competes with the face that actually rolled.
	var elevation := deg_to_rad(68.0)
	var distance := extent / tan(deg_to_rad(camera.fov * 0.5))
	camera.position = Vector3(0, distance * sin(elevation), distance * cos(elevation))
	camera.look_at(Vector3.ZERO)
