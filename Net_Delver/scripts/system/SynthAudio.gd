extends Node

var cache: Dictionary = {}

## Menu blips route to the UI bus so the options screen can be turned down
## independently of the gunfire.
const UI_CUES := ["ui_move", "ui_press", "ui_back"]

func play(cue: String, pitch_scale := 1.0, volume_db := -8.0) -> void:
	var player := AudioStreamPlayer.new()
	player.stream = _get_stream(cue)
	player.pitch_scale = pitch_scale
	player.volume_db = volume_db
	player.bus = SaveManager.UI_BUS if cue in UI_CUES else SaveManager.SFX_BUS
	add_child(player)
	player.finished.connect(player.queue_free)
	player.play()

func _get_stream(cue: String) -> AudioStreamWAV:
	if cache.has(cue):
		return cache[cue]
	var settings := {
		"shot": [620.0, 0.09, 0.32],
		"heavy": [165.0, 0.22, 0.5],
		"hit": [110.0, 0.08, 0.7],
		"pickup": [420.0, 0.24, 0.28],
		"roll": [95.0, 0.12, 0.25],
		"enemy": [72.0, 0.28, 0.75],
		"victory": [330.0, 0.65, 0.2],
		"charge": [240.0, 0.34, 0.55],
		"weak": [880.0, 0.14, 0.45],
		"boss": [58.0, 0.95, 0.85],
		"ui_move": [540.0, 0.05, 0.15],
		"ui_press": [720.0, 0.09, 0.3],
		"ui_back": [300.0, 0.09, 0.3],
	}
	var data: Array = settings.get(cue, [220.0, 0.1, 0.3])
	var sample_rate := 22050
	var frame_count := int(sample_rate * float(data[1]))
	var bytes := PackedByteArray()
	bytes.resize(frame_count * 2)
	for frame in frame_count:
		var time := float(frame) / sample_rate
		var envelope := pow(1.0 - float(frame) / frame_count, 2.0)
		var wave := sin(TAU * float(data[0]) * time)
		wave += sin(TAU * float(data[0]) * 0.51 * time) * float(data[2])
		var sample := int(clamp(wave * envelope * 15000.0, -32767.0, 32767.0))
		bytes.encode_s16(frame * 2, sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.data = bytes
	cache[cue] = stream
	return stream
