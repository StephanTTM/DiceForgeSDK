extends Node
## Asks the engine, rather than assuming: can a script step physics manually?
## The answer decides whether Godot motion can be ADR-0018 record-then-play
## (needs invisible pre-simulation) or must be an authored tumble (ADR-0007).

func _ready() -> void:
	var findings: Array[String] = []
	for method in ["space_step", "step", "simulate", "space_flush_queries"]:
		findings.append("PhysicsServer3D.%s: %s" % [
			method, ClassDB.class_has_method("PhysicsServer3D", method)
		])
	findings.append("Physics tick rate: %d" % Engine.physics_ticks_per_second)
	var out := FileAccess.open(
		ProjectSettings.globalize_path("res://").path_join("capability-report.txt"),
		FileAccess.WRITE,
	)
	out.store_string("
".join(findings) + "
")
	out.close()
	get_tree().quit()
