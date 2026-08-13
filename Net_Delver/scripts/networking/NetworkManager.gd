extends Node

const PORT := 7777
const MAX_PARTY_SIZE := 3

signal roster_changed(players: Dictionary)
signal connection_status_changed(message: String)
signal connected_to_lobby
signal lobby_closed

var players: Dictionary = {}
var player_name := "Delver"
var last_address := ""
var peer: ENetMultiplayerPeer

func _ready() -> void:
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)
	# Editing the loadout in the lobby has to reach the rest of the party, or
	# the host would seed the run from a stale kit. Equipment and armour colour
	# ride the same signal: every profile mutation emits stash_changed.
	SaveManager.stash_changed.connect(_on_profile_changed)

func _on_profile_changed() -> void:
	if players.is_empty() or not multiplayer.has_multiplayer_peer():
		return
	if multiplayer.is_server():
		if players.has(1):
			players[1]["kit"] = SaveManager.planned_kit()
			players[1]["equipment"] = SaveManager.equipment()
			players[1]["color"] = SaveManager.armor_color_index()
			_sync_roster.rpc(players)
	else:
		_update_loadout.rpc_id(1, SaveManager.planned_kit(), SaveManager.equipment(),
			SaveManager.armor_color_index())

@rpc("any_peer", "reliable")
func _update_loadout(kit: Dictionary, equipment: Dictionary, color: int) -> void:
	if not multiplayer.is_server():
		return
	var id := multiplayer.get_remote_sender_id()
	if players.has(id):
		players[id]["kit"] = _clean_kit(kit)
		players[id]["equipment"] = _clean_equipment(equipment)
		players[id]["color"] = clampi(color, 0, SaveManager.ARMOR_COLORS.size() - 1)
		_sync_roster.rpc(players)

func create_lobby(display_name: String) -> Error:
	close_lobby(false)
	player_name = _clean_name(display_name)
	peer = ENetMultiplayerPeer.new()
	var error := peer.create_server(PORT, MAX_PARTY_SIZE - 1)
	if error != OK:
		connection_status_changed.emit("Could not host on port %d." % PORT)
		return error
	multiplayer.multiplayer_peer = peer
	players = {1: {"id": 1, "name": player_name, "host": true, "kit": SaveManager.planned_kit(),
		"equipment": SaveManager.equipment(), "color": SaveManager.armor_color_index()}}
	# Announce on the local network so party members can join from the session
	# list instead of typing an address — the difference between "playable" and
	# "unplayable" on a handheld with no keyboard.
	LanDiscovery.start_advertising()
	connection_status_changed.emit("Lobby online. Visible to this network.")
	roster_changed.emit(players)
	connected_to_lobby.emit()
	return OK

func join_lobby(address: String, display_name: String) -> Error:
	close_lobby(false)
	player_name = _clean_name(display_name)
	peer = ENetMultiplayerPeer.new()
	var host := address.strip_edges()
	if host.is_empty():
		host = "127.0.0.1"
	var error := peer.create_client(host, PORT)
	if error != OK:
		connection_status_changed.emit("Could not start connection.")
		return error
	multiplayer.multiplayer_peer = peer
	last_address = host
	connection_status_changed.emit("Connecting to %s:%d..." % [host, PORT])
	return OK

func close_lobby(emit_signal := true) -> void:
	LanDiscovery.stop_advertising()
	if peer:
		peer.close()
	peer = null
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()
	players.clear()
	if emit_signal:
		roster_changed.emit(players)
		lobby_closed.emit()

func is_host() -> bool:
	return multiplayer.has_multiplayer_peer() and multiplayer.is_server()

func _clean_name(value: String) -> String:
	var cleaned := value.strip_edges().left(18)
	return cleaned if not cleaned.is_empty() else "Delver"

func _on_connected_to_server() -> void:
	connection_status_changed.emit("Connected. Synchronizing party...")
	# The loadout travels with the join so the whole party knows every kit
	# before the level exists. Seeding inventories from the roster avoids an
	# RPC that would otherwise land while clients are still loading the scene.
	_submit_player.rpc_id(1, player_name, SaveManager.planned_kit(),
		SaveManager.equipment(), SaveManager.armor_color_index())

func _on_connection_failed() -> void:
	connection_status_changed.emit("Connection failed. Check the host address.")
	close_lobby(false)

func _on_peer_connected(id: int) -> void:
	if multiplayer.is_server():
		connection_status_changed.emit("Peer %d connected." % id)

func _on_peer_disconnected(id: int) -> void:
	if multiplayer.is_server() and players.erase(id):
		_sync_roster.rpc(players)
		connection_status_changed.emit("A Delver left the party.")

func _on_server_disconnected() -> void:
	players.clear()
	connection_status_changed.emit("Host disconnected.")
	roster_changed.emit(players)
	lobby_closed.emit()

@rpc("any_peer", "reliable")
func _submit_player(display_name: String, kit: Dictionary, equipment: Dictionary, color: int) -> void:
	if not multiplayer.is_server():
		return
	var id := multiplayer.get_remote_sender_id()
	if players.size() >= MAX_PARTY_SIZE and not players.has(id):
		multiplayer.multiplayer_peer.disconnect_peer(id)
		return
	players[id] = {"id": id, "name": _clean_name(display_name), "host": false,
		"kit": _clean_kit(kit), "equipment": _clean_equipment(equipment),
		"color": clampi(color, 0, SaveManager.ARMOR_COLORS.size() - 1)}
	_sync_roster.rpc(players)

## A joining client declares its own loadout, so it gets sanity-checked rather
## than trusted: unknown ids are dropped and stacks are capped at the same
## limits the in-run inventory enforces.
func _clean_kit(kit: Dictionary) -> Dictionary:
	var cleaned := {}
	for item_id in kit:
		if not ItemDatabase.has(str(item_id)):
			continue
		var limit := ItemDatabase.max_stack(str(item_id))
		var amount := int(kit[item_id])
		if limit > 0:
			amount = mini(amount, limit)
		if amount > 0:
			cleaned[str(item_id)] = amount
	return cleaned

## Same policy for a declared loadout: only real gear, only in its own slot.
## The buster slot always resolves so the host can seed a weapon for everyone.
func _clean_equipment(equipment: Dictionary) -> Dictionary:
	var cleaned := {}
	for slot_id in equipment:
		var item_id := str(equipment[slot_id])
		if ItemDatabase.has(item_id) and ItemDatabase.is_gear(item_id) \
				and ItemDatabase.slot(item_id) == str(slot_id):
			cleaned[str(slot_id)] = item_id
	if not cleaned.has("buster"):
		cleaned["buster"] = ItemDatabase.BUSTER_STANDARD
	return cleaned

@rpc("authority", "call_local", "reliable")
func _sync_roster(server_players: Dictionary) -> void:
	players = server_players.duplicate(true)
	roster_changed.emit(players)
	connected_to_lobby.emit()
	connection_status_changed.emit("Party ready: %d/%d" % [players.size(), MAX_PARTY_SIZE])
