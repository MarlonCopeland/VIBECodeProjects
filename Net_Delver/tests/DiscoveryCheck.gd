extends Node

# Live socket check for LAN discovery: advertise and listen in one process and
# see whether the beacon actually comes back. Unit-testing decode_beacon proves
# the wire format; only this proves the socket setup.

func _ready() -> void:
	SaveManager.use_profile("user://net_delver_discovery.cfg")
	NetworkManager.player_name = "LoopbackHost"
	NetworkManager.players = {1: {"id": 1, "name": "LoopbackHost", "host": true}}

	var bound := LanDiscovery.start_listening()
	print("LISTENING=%s" % bound)
	LanDiscovery.start_advertising()
	print("ADVERTISING=%s" % LanDiscovery.advertising)

	for tick in 40:
		await get_tree().process_frame
		await get_tree().create_timer(0.1).timeout
		var sessions := LanDiscovery.sessions()
		if not sessions.is_empty():
			var address := str(sessions[0]["address"])
			print("DISCOVERED name=%s players=%d address=%s" % [
				sessions[0]["name"], int(sessions[0]["players"]), address])
			# An empty address decodes fine but is unjoinable, which is exactly
			# the failure this check exists to catch.
			if address.is_empty():
				printerr("DISCOVERY_FAILED: session has no address to join")
				get_tree().quit(1)
				return
			print("DISCOVERY_OK")
			get_tree().quit()
			return
	printerr("DISCOVERY_FAILED: no beacon received in 4s")
	get_tree().quit(1)
