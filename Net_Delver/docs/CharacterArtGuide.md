# Character art guide

How to build a Delver in Blender that drops straight into the game.

This describes a rig that is **already working in-engine**, not one we hope will
work. `scripts/player/DelverRig.gd` builds exactly this skeleton at runtime, the
animation system drives it, and the smoke test asserts it. Match the bone names
and rest positions below and your model inherits all of that.

---

## Read this first

**The Mega Man Legends look is the most beginner-friendly 3D character style
there is.** That is not encouragement, it is a fact about the workload:

- ~300–800 triangles per part. You can count them.
- Flat, faceted shading. No smooth normals to fight.
- No sculpting, no retopology, no normal maps, no PBR texturing.
- Flat colour or a single tiny texture atlas.

**And a robot skips the hardest beginner step entirely.** Volnutt-style armour
is hard-surface plates, so each piece is *rigidly parented* to one bone —
`Ctrl+P → Bone`. No weight painting, no vertex groups, no skinning. That is the
step that stops most people, and this character design does not need it.

If you later want soft deformation (a cloth scarf, a fabric joint), you can add
skinning to just that piece. Start rigid.

---

## The bone contract

20 bones. Names follow Godot's standard humanoid convention, which is what lets
you retarget Mixamo animations onto this skeleton later if you want them.

Build the armature with the **head of each bone** at these world positions. The
character faces **-Y in Blender** (which becomes -Z in Godot), origin at the
feet, total height 1.75m over a 0.32m head — 5.5 heads, Legends proportions.

| Bone | Parent | Offset from parent (X, Y, Z) | Height off floor |
| --- | --- | --- | ---: |
| `Hips` | — | (0, 0.92, 0) | 0.92 |
| `Spine` | Hips | (0, 0.16, 0) | 1.08 |
| `Chest` | Spine | (0, 0.18, 0) | 1.26 |
| `Neck` | Chest | (0, 0.17, 0) | 1.43 |
| `Head` | Neck | (0, 0.09, 0) | 1.52 |
| `LeftShoulder` | Chest | (−0.10, 0.12, 0) | 1.38 |
| `LeftUpperArm` | LeftShoulder | (−0.13, 0, 0) | 1.38 |
| `LeftLowerArm` | LeftUpperArm | (0, −0.25, 0) | 1.13 |
| `LeftHand` | LeftLowerArm | (0, −0.23, 0) | 0.90 |
| `RightShoulder` | Chest | (0.10, 0.12, 0) | 1.38 |
| `RightUpperArm` | RightShoulder | (0.13, 0, 0) | 1.38 |
| `RightLowerArm` | RightUpperArm | (0, −0.25, 0) | 1.13 |
| `RightHand` | RightLowerArm | (0, −0.23, 0) | 0.90 |
| **`Muzzle`** | RightHand | (0, −0.16, −0.06) | 0.74 |
| `LeftUpperLeg` | Hips | (−0.11, −0.06, 0) | 0.86 |
| `LeftLowerLeg` | LeftUpperLeg | (0, −0.42, 0) | 0.44 |
| `LeftFoot` | LeftLowerLeg | (0, −0.38, 0) | 0.06 |
| `RightUpperLeg` | Hips | (0.11, −0.06, 0) | 0.86 |
| `RightLowerLeg` | RightUpperLeg | (0, −0.42, 0) | 0.44 |
| `RightFoot` | RightLowerLeg | (0, −0.38, 0) | 0.06 |

**+X is the Delver's right.** The buster is on the right arm, because the
controller reads `global_basis.x` as right and the over-the-shoulder camera
defaults to the right shoulder.

Rest pose is a clean **A-pose with the arms down**. Do not bake the
weapon-ready stance into the rest — the game applies that as a pose, and
retargeting assumes a neutral rest.

### `Muzzle` is not decoration

Shots originate from this bone. It is the reason you can reskin, rescale, or
replace the buster without touching a line of firing code.

> **The gotcha that will cost you an afternoon:** a bone with no vertex weights
> is *stripped* by glTF export when **"Only Deform Bones"** is enabled. Either
> mark `Muzzle` as a deform bone, or turn that option off. It fails silently —
> the symptom is shots leaving from the character's feet.

---

## The narrow toolset

You need about six things out of Blender, not all of it:

| What | How |
| --- | --- |
| Box modelling | `E` extrude, `Ctrl+R` loop cut, `Ctrl+B` bevel |
| Symmetry | Mirror modifier on the X axis |
| Flat look | Object → Shade Flat (**not** Shade Smooth) |
| Armature | Add → Armature, then extrude bones in Edit Mode |
| Attaching parts | Select mesh, shift-select the bone in Pose Mode, `Ctrl+P → Bone` |
| Export | File → Export → glTF 2.0 (.glb) |

That is the entire list for this art style. Ignore sculpting, UV unwrapping
(until you want a texture), shader nodes, and physics.

---

## Building your first Delver

1. **Start from the armature**, not the mesh. Build the 20 bones above first, or
   import a `.glb` exported from the in-game proxy so the skeleton is already
   correct.
2. **Block out one half** of the body with cubes — torso, upper arm, lower arm,
   thigh, shin, boot, head. Use the Mirror modifier so the left side comes free.
3. **Model in slots from day one.** Five separate objects:
   `head`, `hair_helmet`, `torso`, `arms`, `legs`. This is the trap that costs
   the most rework — modelling one merged character and cutting it up later is
   far harder than keeping it split from the start. The customization system
   swaps these independently.
4. **Rigidly parent each part** to its bone. A thigh mesh goes on
   `LeftUpperLeg`, a boot on `LeftFoot`, the helmet on `Head`.
5. **Apply all transforms** — `Ctrl+A → All Transforms` — before exporting.
   This is the single most common cause of a character arriving in Godot at the
   wrong scale or lying on its side.

### Poly budget

| Slot | Triangles |
| --- | ---: |
| head | 150–300 |
| hair_helmet | 100–250 |
| torso | 200–400 |
| arms | 150–300 |
| legs | 200–400 |

Under 1,600 for a whole character. For reference, the PS1 originals ran around
500. You are not going to be short.

---

## Export settings

File → Export → glTF 2.0 (`.glb`):

- **Format:** glTF Binary (`.glb`) — one self-contained file
- **Include:** Selected Objects (your five slots + the armature)
- **Transform:** +Y Up ✔
- **Data → Mesh:** Apply Modifiers ✔
- **Data → Armature:** Export Deformation Bones Only ✘ *(see the Muzzle note)*
- **Exclude:** cameras, lights, punctual lights

Drop the `.glb` into `assets/models/`. Godot imports it automatically.

---

## Animation

Ten clips, all named in `scripts/player/DelverAnimSet.gd`:

`idle`, `run_fwd`, `run_back`, `strafe_left`, `strafe_right`, `jump`, `fall`,
`land`, `roll`, `roll_heavy`, `air_dash`

Three things worth knowing before you start:

**Hand-key it. Do not mocap it.** For this style, 8–12 poses per clip is both
*less* work than retargeting and more authentic — Legends animation is snappy
and posey, not smoothly interpolated. Mixamo remains a fallback since the
skeleton uses standard humanoid names, but hand-keying will look better.

**No walk cycles needed.** The locomotion blend space has idle at its centre and
the run set on its rim, so any speed between the two already interpolates into a
walk. Authoring walk clips would only duplicate what you get free.

**Committed-action clips have a fixed length.** `roll` must be exactly 0.46s and
`roll_heavy` exactly 0.62s, because those are the windows
`scripts/player/ActionTable.gd` grants invulnerability over. This is not a
convention you have to remember — `tests/SmokeTest.tscn` asserts it and fails if
a clip drifts. Change the gameplay timing in `ActionTable.gd` and re-time the
clip to match.

Root motion is **off**. Locomotion is code-driven, and the animator matches
playback speed to actual metres per second so the feet do not slide. Do not
author forward translation into the run cycles.

---

## Dropping it in

`DelverRig.build()` currently constructs the proxy in code. To use your model
instead, replace the body of that function with an instantiation of your
imported scene — the bone names and the `Rig` handles it returns (`skeleton`,
`buster_mesh`, `muzzle`, `charge_fx`) are the contract everything else depends
on. Nothing outside that file knows how the character was made.

Then run, in order:

```bash
godot --headless --path "C:\repo\VIBES\Net_Delver" "res://tests/SmokeTest.tscn"
```

Expect `NET_DELVER_SMOKE_TEST_OK`. It checks the muzzle sits somewhere
plausible, every clip the graph names exists, and each committed action's clip
length matches its gameplay window.

```bash
godot --path "C:\repo\VIBES\Net_Delver" "res://tests/AnimationShot.tscn"
```

Writes side-on renders of idle, three points through the run cycle, a free-run
turn, and an aimed strafe to `user://`. This is how you check the pose actually
reads, which no assertion can do.

```bash
godot --path "C:\repo\VIBES\Net_Delver" "res://tests/CameraShot.tscn"
```

Renders the three over-the-shoulder framings, so you can confirm your character
still composes correctly against the camera rig.

---

## Still to come

- **Retro fidelity toggles.** You asked to see both a clean low-poly homage and
  a faithful PS1 treatment (vertex snapping, affine warping, stepped 12fps
  animation) before choosing. That ships as a settings enum you flip in-game;
  it is not built yet.
- **Toon shader and palette lock.** See `docs/Roadmap.md` Phase 2. Note the
  correction recorded there about outlines: Mega Man Legends did *not* have
  them. They are a modern homage convention, and worth having as a toggle
  rather than as an assumption.
- **The customization system** that swaps these five slots at runtime —
  `docs/Roadmap.md` Phase 3.
