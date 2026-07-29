extends Node
## Reproduces a real integration report: the addon scripts living somewhere
## other than res://addons/diceforge. Internal preloads are script-relative,
## so a moved folder must keep working — this test builds the moved copy
## itself, stripping the `class_name` lines exactly as a project vendoring a
## second copy must (two copies of a class_name collide globally; that is the
## "hides a global script class" error).

const TARGET := "res://relocated"


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(TARGET))
	for file in DirAccess.get_files_at("res://addons/diceforge"):
		if not file.ends_with(".gd") or file == "plugin.gd":
			continue
		var text := FileAccess.get_file_as_string("res://addons/diceforge".path_join(file))
		var stripped := ""
		for line in text.split("
"):
			if not line.begins_with("class_name "):
				stripped += line + "
"
		var out := FileAccess.open(TARGET.path_join(file), FileAccess.WRITE)
		out.store_string(stripped)
		# Closed explicitly: the loop variable would otherwise keep the last
		# handle open and unflushed while load() below reads the file.
		out.close()

	var forge_script := load(TARGET.path_join("dice_forge.gd"))
	var forge = forge_script.seeded("table-42")
	var record = forge.roll("2d20kh1+3")
	# The conformance vectors pin this exact record: total 22.
	var ok: bool = not record.has("error") and int(record["total"]) == 22
	print("RELOCATION %s: total %s from %s" % [
		"PASS" if ok else "FAIL", str(record.get("total", "error")), TARGET
	])
	var report := FileAccess.open(
		ProjectSettings.globalize_path("res://").path_join("relocation-report.txt"),
		FileAccess.WRITE,
	)
	if report != null:
		report.store_string("RELOCATION %s
" % ("PASS" if ok else "FAIL"))
	get_tree().quit(0 if ok else 1)
