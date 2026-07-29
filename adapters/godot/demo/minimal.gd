extends Node3D
## The minimal DiceForge setup: this script, a camera, and a light.

const Forge := preload("res://addons/diceforge/dice_forge.gd")
const Presenter := preload("res://addons/diceforge/presenter_3d.gd")


func _ready() -> void:
	var forge := Forge.seeded("first-roll")
	var presenter := Presenter.new()
	add_child(presenter)
	presenter.configure(ProjectSettings.globalize_path("res://").path_join(
		"../../packages/assets-forge/forge"
	), "blue")
	var record = forge.roll("2d20kh1+3")
	presenter.present(record)
	print("rolled %s -> total %d" % [record["expression"], record["total"]])

	# --- demo harness only: capture the frame and exit ---
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(
		ProjectSettings.globalize_path("res://").path_join("screenshots/minimal.png")
	)
	get_tree().quit()
