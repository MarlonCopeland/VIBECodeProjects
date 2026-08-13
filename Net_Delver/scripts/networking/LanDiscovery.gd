extends Node

# Local-network session discovery.
#
# Two Steam Decks on the same Wi-Fi should not have to read an IP off one
# screen and type it into the other's on-screen keyboard. The host emits a
# small UDP beacon on the limited broadcast address once a second; anyone
# sitting in the lobby listens for those beacons and shows what it hears.
#
# Only the host binds nothing and the client binds the discovery port, which
# matters more than it looks: it means a host and a client running on the same
# machine do not fight over the socket, so local two-window testing still works.
# It also means discovery needs no configuration, no router support, and no
# knowledge of the subnet mask (which Godot does not expose anyway).
#
# Beacons carry no personal data beyond the callsign the player typed, and are
# advisory only — joining still goes through the normal ENet handshake, and the
# host still enforces the party size.

signal sessions_changed(sessions: Array)

const DISCOVERY_PORT := 7778
const BEACON_INTERVAL := 1.0
## A session that has not been heard from in this long is assumed gone. Three
## missed beacons, so one dropped packet does not make the list flicker.
const SESSION_TIMEOUT := 3.5
const PROTOCOL := "net_delver"
const PROTOCOL_VERSION := 1

## How often a failed bind is retried. The port is only ever contended by
## another instance on the same machine (local two-window testing), and that
## instance releases it the moment it starts hosting.
const REBIND_INTERVAL := 1.5

var advertising := false
var listening := false

var _broadcaster: PacketPeerUDP
var _listener: PacketPeerUDP
var _beacon_timer := 0.0
var _want_listening := false
var _rebind_timer := 0.0
## address -> {"address", "name", "players", "max", "port", "last_seen"}
var _sessions: Dictionary = {}

func _process(delta: float) -> void:
	if advertising:
		_beacon_timer -= delta
		if _beacon_timer <= 0.0:
			_beacon_timer = BEACON_INTERVAL
			_send_beacon()
	if listening:
		_receive_beacons()
		_expire_sessions()
	elif _want_listening:
		_rebind_timer -= delta
		if _rebind_timer <= 0.0:
			_rebind_timer = REBIND_INTERVAL
			_bind_listener()

# ------------------------------------------------------------------ hosting

func start_advertising() -> void:
	if advertising:
		return
	_broadcaster = PacketPeerUDP.new()
	_broadcaster.set_broadcast_enabled(true)
	_broadcaster.set_dest_address("255.255.255.255", DISCOVERY_PORT)
	advertising = true
	_beacon_timer = 0.0

func stop_advertising() -> void:
	advertising = false
	if _broadcaster:
		_broadcaster.close()
	_broadcaster = null

func _send_beacon() -> void:
	if not _broadcaster:
		return
	var beacon := {
		"protocol": PROTOCOL,
		"version": PROTOCOL_VERSION,
		"name": NetworkManager.player_name,
		"players": NetworkManager.players.size(),
		"max": NetworkManager.MAX_PARTY_SIZE,
		"port": NetworkManager.PORT,
	}
	_broadcaster.put_packet(JSON.stringify(beacon).to_utf8_buffer())

# ------------------------------------------------------------------ browsing

func start_listening() -> bool:
	_want_listening = true
	if listening:
		return true
	return _bind_listener()

func _bind_listener() -> bool:
	_listener = PacketPeerUDP.new()
	if _listener.bind(DISCOVERY_PORT) != OK:
		# Another process on this machine already owns the port — usually a
		# second local test client. Manual IP entry still works, and _process
		# keeps retrying in case that process starts hosting and releases it.
		_listener = null
		return false
	_sessions.clear()
	listening = true
	sessions_changed.emit(sessions())
	return true

func stop_listening() -> void:
	_want_listening = false
	listening = false
	if _listener:
		_listener.close()
	_listener = null
	_sessions.clear()

func _receive_beacons() -> void:
	if not _listener:
		return
	var changed := false
	while _listener.get_available_packet_count() > 0:
		# Order matters: get_packet_ip() reports the sender of the *last packet
		# read*, so reading it first yields an empty string and the session
		# ends up unjoinable.
		var payload := _listener.get_packet().get_string_from_utf8()
		var address := _listener.get_packet_ip()
		if address.is_empty():
			continue
		var session := decode_beacon(payload, address)
		if session.is_empty():
			continue
		# A returning beacon only counts as a change when something visible
		# moved, otherwise the list would rebuild once a second forever.
		var previous: Dictionary = _sessions.get(address, {})
		if previous.get("name") != session.name or previous.get("players") != session.players:
			changed = true
		session["last_seen"] = Time.get_ticks_msec()
		_sessions[address] = session
	if changed:
		sessions_changed.emit(sessions())

## Parsed out so the wire format can be tested without opening a socket.
## Returns {} for anything that is not a beacon from a compatible build.
func decode_beacon(payload: String, address: String) -> Dictionary:
	# The instance parser returns an error code; JSON.parse_string() would log a
	# engine-level error for every stray packet on the port, which on a busy
	# network is a lot of noise for something we simply ignore.
	var json := JSON.new()
	if json.parse(payload) != OK or not (json.data is Dictionary):
		return {}
	var beacon: Dictionary = json.data
	if str(beacon.get("protocol", "")) != PROTOCOL:
		return {}
	if int(beacon.get("version", -1)) != PROTOCOL_VERSION:
		return {}
	return {
		"address": address,
		"name": str(beacon.get("name", "Delver")).left(18),
		"players": int(beacon.get("players", 0)),
		"max": int(beacon.get("max", NetworkManager.MAX_PARTY_SIZE)),
		"port": int(beacon.get("port", NetworkManager.PORT)),
	}

func _expire_sessions() -> void:
	var now := Time.get_ticks_msec()
	var stale: Array[String] = []
	for address in _sessions:
		if now - int(_sessions[address]["last_seen"]) > int(SESSION_TIMEOUT * 1000.0):
			stale.append(address)
	if stale.is_empty():
		return
	for address in stale:
		_sessions.erase(address)
	sessions_changed.emit(sessions())

## Discovered sessions, oldest-seen first so the list does not reorder under
## the player's cursor while they are reaching for it.
func sessions() -> Array:
	var list := _sessions.values()
	list.sort_custom(func(a, b): return str(a["address"]) < str(b["address"]))
	return list

func is_full(session: Dictionary) -> bool:
	return int(session.get("players", 0)) >= int(session.get("max", NetworkManager.MAX_PARTY_SIZE))
