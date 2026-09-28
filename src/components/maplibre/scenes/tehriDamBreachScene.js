/**
 * Scene config for the tehri-dam-breach scenario's MapLibreEngine
 * rendering — the second scene wired into the shared engine alongside
 * securityAttackScene.js. Same shape as that file; every value here is
 * new (not extracted from anything), sized for a ~180km river corridor
 * (New Tehri \u2192 Devprayag \u2192 Rishikesh \u2192 Haridwar \u2192 Roorkee \u2192
 * Muzaffarnagar \u2192 Meerut) instead of one Central Delhi city block.
 */
import { DAM_LANDMARK_IDS, DAM_LANDMARKS } from '../../../data/damCorridorLandmarks';
import {
  DAM_SHELTERS,
  DAM_INACCESSIBLE_SHELTER_ID,
} from '../../../data/damCorridorShelters';
import { FLOOD_PILLARS } from '../../../data/floodPopulationPillars';

// Roughly the geographic mean of the scenario's baseline buildings
// (src/scenarios/tehri-dam-breach.json spans lat 28.70\u201330.38, lng
// 77.10\u201378.60) \u2014 used the same dual-purpose way securityAttackScene's
// fallbackCenter is: initial wide-establishing camera center, and the
// last-resort fallback if this scenario is ever passed in with no
// buildings at all.
const fallbackCenter = { lat: 29.55, lng: 77.95 };

// The scenario's own timeline keyframes (see tehri-dam-breach.json)
// already carry explicit redRadiusKm/yellowRadiusKm/greenRadiusKm on
// every keyframe, so these defaultRadii are only ever used for the
// bare baseline state (before any keyframe is scrubbed to) \u2014 sized to
// roughly match the scenario's own T+0 keyframe scale (2/5/9km) rather
// than security-attack's much smaller ~300m blast-radius scale, since
// a dam-breach flood front is a fundamentally larger-scale event than
// a point explosion.
const defaultRadii = { red: 3, yellow: 8, green: 15 };

// Fix (person-reported): the colored red/yellow/green impact-zone
// circles were snapping to a different location every few keyframes
// ("disappears at T+5", "shifts far away at T+10"). Root cause: this
// scenario's own JSON authors impactPoint as a genuinely TRAVELING
// point \u2014 T+0 at the dam itself, then marching ~180km downstream
// (Devprayag \u2192 Haridwar \u2192 Meerut) across the timeline, to simulate
// the flood front advancing. That authoring is intentional and
// correct. The bug was in the renderer: animateRiskZones (in
// MapLibreEngine.jsx) already smoothly eases the RADIUS (km) between
// keyframes, but was never built to also ease the CENTER coordinate
// \u2014 it just snapped the circle's center straight to each new
// keyframe's impactPoint the instant a keyframe changed, while the
// radius was still mid-animation. For security-attack (a fixed point
// every keyframe) that mismatch is invisible; for this scene's moving
// point it produces exactly the "teleporting, disappearing" look
// reported.
//
// Per explicit person request \u2014 "the center of the impact radius
// should be stuck", pinned at the dam, not traveling \u2014 this scene now
// opts in to a pinned center via pinImpactZoneCenter below, instead of
// having animateRiskZones grow a real center-lerp path (which was
// considered and rejected: the person explicitly asked for the circle
// to stay put at the dam, not to travel-but-smoothly). This coordinate
// is the real, verified Tehri Dam location (Wikipedia: 30.37778\u00b0N,
// 78.48056\u00b0E), which also matches this scenario's own T+0 impactPoint
// almost exactly \u2014 so nothing about the T+0 visual changes; only T+5
// onward now keeps the circle anchored here instead of following the
// flood front.
//
// This flag ONLY affects the rendered impact-zone circle's center in
// animateRiskZones. It deliberately does NOT touch impactCenter itself
// (still resolved from each keyframe's real, traveling impactPoint
// everywhere else it's used \u2014 camera flyTo, building/road risk
// candidate resolution), since the flood front physically DOES keep
// moving downstream and the camera work / building risk should still
// follow it for realism. Only the circle's own drawn center is pinned.
const pinImpactZoneCenter = { lat: 30.3778, lng: 78.4806 };

// Flood-front polygon path (revised again per explicit person spec:
// "do not draw a straight line between checkpoints \u2014 insert 4\u20135
// intermediate breakpoints between every pair so the path visibly
// zigzags, and make the zigzag irregular/random-looking, not a neat
// symmetrical alternation, the whole way down the corridor"). [lng,
// lat] pairs, in downstream order. The named real-place waypoints from
// the previous revision (Tehri Dam, Devprayag, Rishikesh, Raiwala,
// Haridwar, Roorkee, Landhaura, Muzaffarnagar, Meerut/NCR \u2014 see the
// per-point confidence notes below, unchanged from before) are still
// present at their same verified coordinates; what's new is 4\u20135
// unnamed intermediate points inserted into EVERY segment between them,
// each offset perpendicular to that segment by an irregular
// (non-alternating, non-fixed-magnitude) amount so the line reads as
// organic river wandering instead of a ruler-straight jump. These
// intermediate points are NOT real surveyed river-channel coordinates
// (this codebase has no live tile access to trace the actual channel
// \u2014 same "flag what isn't verified" standard as the rest of this file)
// \u2014 they're a deliberately-irregular perturbation of the straight-line
// midpoint grid between two verified real places, generated once
// (fixed values, not regenerated at runtime) so the shape is stable
// across renders. Confidence per NAMED point (unchanged from the prior
// revision):
//   - Tehri Dam, Devprayag, Ram Jhula Rishikesh, Har Ki Pauri
//     Haridwar, IIT Roorkee: same verified coordinates already used
//     in damCorridorLandmarks.js.
//   - Raiwala (the Rishikesh\u2013Haridwar stretch immediately adjacent to
//     Dehradun, honestly: the Ganga itself passes just EAST of
//     Dehradun city through this stretch, not through the city
//     center \u2014 flagged here rather than implying the river runs
//     through downtown Dehradun) and Muzaffarnagar are real,
//     reasonably well-known town coordinates, not freshly re-verified
//     against a live map this pass (Muzaffarnagar\u2019s specifically was:
//     29.4675\u00b0N, 77.7050\u00b0E).
//   - Landhaura (between Roorkee and Muzaffarnagar) is an
//     approximate interpolated midpoint, not a verified coordinate \u2014
//     included only to keep the corridor's shape smooth through that
//     stretch, same "approximate, flagged as such" standard the rest
//     of this file already uses for its corridorPattern regex.
// T+0/T+10/T+15/T+30's own impactPoints (used elsewhere for the
// impact-zone circles' pinned center and for camera flyTo) are
// UNCHANGED by this \u2014 this array only feeds the flood polygon's shape/
// distance-along-path math in MapLibreEngine.jsx's animateFloodZone.
//
// ZIGZAG-START REVISION (person request: "change where the zigzag
// starts"): every segment between two named anchors below now stays
// EXACTLY on the straight line connecting them for the first ~40% of
// that segment's length, and only starts perpendicular-wandering after
// that point \u2014 ramped in gradually (0 at the 40% mark, full amplitude
// by the segment's end) rather than switching on abruptly. Previously
// the wander was present across a segment's entire length from the
// anchor onward, so the flood front visibly started "wobbling" the
// instant it left a named place; this reads as the front travelling
// cleanly out of Tehri Dam/Devprayag/Rishikesh/etc. before the river's
// own natural meander becomes visible, closer to how an actual channel
// looks leaving a fixed point. Regenerated with the same 4\u20135
// intermediate-breakpoints-per-segment count and the same low
// amplitude as the prior "lower zigzag frequency" pass (~1km-scale max
// perpendicular offset, not the original ~40%-of-segment-length
// wander) \u2014 this revision only moves WHERE along each segment that
// wander is allowed to begin, it does not re-widen it. Generated with
// a small deterministic per-segment lerp+jitter helper (fixed seeds
// per segment, not re-randomized on every load, so the shape stays
// stable across renders \u2014 same reasoning as the previous revision's
// own "generated once, not at runtime" note). Corridor total length
// \u2248209.7km (previously \u2248213.7km) and Haridwar's own resolved
// distance-along-path fraction is \u22480.384 (previously 0.385) \u2014 close
// enough that MapLibreEngine.jsx's HARIDWAR_PROGRESS = 0.385
// terrain-boundary constant still lines up correctly and did not need
// updating alongside this.
//
// SATPULI DETOUR (person request: "from Devprayag the flood suddenly
// moves surprisingly towards the west \u2014 I want it to move more down,
// toward Satpuli, and land down [afterward]"). Devprayag\u2192Rishikesh
// previously ran almost due west at a near-constant latitude
// (30.1462\u2192{30.146\u2026 30.139\u2026 30.137\u2026 30.135}\u219230.1280 \u2014 barely a 2km
// latitude drop over the whole ~27km segment), which read as an abrupt
// west-only turn right after Devprayag with no southward travel at
// all. That segment is now replaced with a deliberate south-then-west
// bow through Satpuli (verified coordinates \u2014 see the inline comment
// on that point above) before rejoining the corridor toward Rishikesh.
// Flagged explicitly: Satpuli sits on the Nayar (East) river, a
// tributary that joins the Ganges further downstream at Byasghat/
// Vyasi \u2014 NOT on the Bhagirathi/Ganges mainstem the flood front is
// actually following through Devprayag\u2192Rishikesh\u2192Haridwar. This
// detour is therefore an intentional ARTISTIC reroute anchored on a
// real, verified place per the person's explicit direction, not a
// claim that the actual dam-breach floodwater would physically reach
// Satpuli \u2014 same "flag what's schematic vs. verified" standard this
// file already applies to Landhaura's approximate interpolated
// midpoint. This is a large, deliberate 4-breakpoint detour (not the
// small-amplitude organic wander used elsewhere in floodPath), so it's
// left as clean hand-placed points rather than run through the
// zigzag-wander treatment \u2014 easiest to hand-tune further from here.
// This ~45km detour meaningfully lengthens the corridor (\u2248254.8km
// total, up from \u2248209.7km) and pushes Haridwar's own resolved
// distance-along-path fraction from \u22480.384 to \u22480.493 \u2014 UNLIKE the
// zigzag-start revision above, this drift is too large to ignore, so
// MapLibreEngine.jsx's HARIDWAR_PROGRESS constant has been updated
// alongside this change (see that file's own comment at
// HARIDWAR_PROGRESS for the matching note) to keep the hills/plains
// width-curve boundary lined up with where Haridwar actually now sits
// on the corridor.
const floodPath = [
  [78.4806, 30.3778], // Tehri Dam
  [78.4903, 30.3392],
  [78.4800, 30.3006],
  [78.4899, 30.2621],
  [78.5610, 30.2242],
  [78.5778, 30.1841],
  [78.5988, 30.1462], // Devprayag (Bhagirathi\u2013Alaknanda confluence) \u2014 hotspot, see floodHotspots below
  [78.6520, 30.1430], // begins the southward swing toward Satpuli \u2014 see note below
  [78.6612, 30.1280], // Satpuli, Pauri Garhwal \u2014 verified: Wikipedia gives 29\u00b055\u203200\u2033N 78\u00b042\u203200\u2033E (29.91667, 78.70000); latlong.net/elevationmap.net agree closely (29.917/29.918, 78.710/78.711). Used 29.9170/78.7101.
  [78.5212, 30.0780], // swings back northwest, "landing down" off the Satpuli detour
  [78.4212, 30.1300], // rejoins the corridor approaching Rishikesh
  [78.3212, 30.1280], // Ram Jhula, Rishikesh \u2014 hotspot, see floodHotspots below
  [78.3123, 30.1212],
  [78.3033, 30.1143],
  [78.2944, 30.1074],
  [78.2849, 30.1013],
  [78.2778, 30.0920],
  [78.2676, 30.0869], // Raiwala \u2014 Rishikesh\u2013Haridwar stretch adjacent to Dehradun
  [78.2469, 30.0587],
  [78.2262, 30.0304],
  [78.2055, 30.0022],
  [78.1851, 29.9737],
  [78.1642, 29.9457], // Har Ki Pauri, Haridwar
  [78.1193, 29.9323],
  [78.0745, 29.9190],
  [78.0296, 29.9058],
  [77.9850, 29.8915],
  [77.9395, 29.8803],
  [77.8951, 29.8656], // IIT Roorkee
  [77.8821, 29.8425],
  [77.8691, 29.8194],
  [77.8571, 29.7956],
  [77.8404, 29.7746],
  [77.8300, 29.7500], // Landhaura \u2014 approximate interpolated midpoint
  [77.8092, 29.7029],
  [77.7883, 29.6558],
  [77.7672, 29.6089],
  [77.7449, 29.5624],
  [77.7278, 29.5137],
  [77.7050, 29.4675], // Muzaffarnagar
  [77.7053, 29.3709],
  [77.7056, 29.2743],
  [77.7051, 29.1777],
  [77.7065, 29.0811],
  [77.7064, 28.9845], // Meerut / NCR approach (scenario's own T+30 keyframe point)
];

// Hotspot metadata (new): the two real physical "pooling" points along
// this corridor per explicit person spec \u2014 Devprayag (where the
// Bhagirathi and Alaknanda physically converge \u2014 a real confluence,
// so floodwater genuinely pools/widens there, not just passes through)
// and Ram Jhula/Rishikesh (a secondary, smaller widening \u2014 "kind of
// huge, not very huge", i.e. visibly wider than the ribbon but clearly
// smaller than Devprayag's). `atKm` is this point's distance along
// floodPath from the dam (computed via turf.length on the slice up to
// that point \u2014 see MapLibreEngine.jsx's floodHotspotsRef for how these
// are resolved to actual along-path distance at runtime rather than
// hardcoding a km value here that would silently drift out of sync if
// floodPath is ever re-authored again). `radiusMultiplier` scales the
// LOCAL ribbon width at that point in the corridor (targetWidthKm in
// animateFloodZone, itself now a hills\u2192plains terrain curve, not a
// flat value \u2014 see that function's own width-model comment) into
// this hotspot's own circular buffer radius, unioned in once the flood
// front reaches it. Retuned alongside that width-curve rework so
// Devprayag still lands as visibly the single widest point on the
// whole corridor (real river confluence \u2014 Bhagirathi + Alaknanda
// physically meet here) even though the plains stretch further
// downstream now also widens substantially on its own; Rishikesh
// stays a clearly smaller secondary bulge, per explicit "Devprayag's
// should be clearly bigger than Rishikesh's, but Rishikesh's should
// still read as a hotspot, not just ribbon width."
const floodHotspots = [
  {
    label: 'Devprayag confluence',
    lng: 78.5988,
    lat: 30.1462,
    radiusMultiplier: 4.5,
    spanKm: 3.5,
  },
  {
    label: 'Ram Jhula, Rishikesh',
    lng: 78.3212,
    lat: 30.1280,
    radiusMultiplier: 2.2,
    spanKm: 2.5,
  },
];

// =====================================================================
// CAMERA KEYFRAMES — the ONE place to tune Tehri's timeline camera.
// One entry per timeline keyframe, in order: index 0 = T+0, 1 = T+5,
// 2 = T+10, 3 = T+15, 4 = T+30. Every time the timeline lands on a
// keyframe, the camera glides to that entry's values.
//
//   zoom        HIGHER = closer, LOWER = further out.
//               (16.5 ~ street level, 10 ~ ~60km wide, 8 ~ ~250km wide)
//   followFront 0 = centre on the dam (fixed circle centre),
//               1 = centre on the flood front's current position,
//               0.5 = halfway between. Use it to slide the camera
//               DOWNSTREAM along the river as the flood advances.
//   rightKm     Shift the camera RIGHT on screen (+) or LEFT (-), in km.
//   upKm        Shift the camera UP on screen (+) or DOWN (-), in km.
//   pitch       Optional tilt 0-85 (0 = top-down). null = leave as is.
//               T+5..T+30 are set to 55 (population pillars read
//               clearly at this tilt). To revert to the old behaviour
//               set those four entries back to `null`.
//   bearing     Optional rotation in degrees. null = leave as is.
//   durationMs  How long the glide takes (smaller = faster).
//
// rightKm/upKm are relative to the screen, so "right" stays right even
// after you rotate the map.
// =====================================================================
const cameraKeyframes = [
  // T+0  — unchanged: tight on the dam.
  { zoom: 16.5, followFront: 0,   rightKm: 0,  upKm: 0, pitch: null, bearing: null, durationMs: 1600 },
  // T+5  — pull WAY back, nudge right so the whole flood circle fits.
  { zoom: 10.9, followFront: 0,   rightKm: 2,  upKm: 0, pitch: 55, bearing: null, durationMs: 1800 },
  // T+10 — even further out, slide toward the front (Devprayag \u2192 Rishikesh), still a bit right.
  { zoom: 9.9,  followFront: 0.5, rightKm: 10, upKm: 0, pitch: 55, bearing: null, durationMs: 1800 },
  // T+15 — keeps pulling back so it never zooms IN after T+10 (front nears Haridwar).
  { zoom: 8.7,  followFront: 0.5, rightKm: 0,  upKm: 0, pitch: 55, bearing: null, durationMs: 1800 },
  // T+30 — widest shot, framing the whole dam \u2192 Meerut corridor.
  { zoom: 8.2,  followFront: 0.5, rightKm: 0,  upKm: 0, pitch: 55, bearing: null, durationMs: 1800 },
];

export const tehriDamBreachScene = {
  id: 'tehri-dam-breach',
  label: 'Dam Breach \u2014 Tehri Dam Catastrophic Failure',
  fallbackCenter,
  defaultRadii,
  pinImpactZoneCenter,
  cameraKeyframes,
  floodPath,
  floodHotspots,
  // Population-entrapment pillars (Task N+5) — Tehri only; the Delhi
  // scene config deliberately has no such field. Tuning constants live
  // in components/maplibre/populationPillars.js.
  populationPillars: FLOOD_PILLARS,
  landmarks: DAM_LANDMARKS,
  landmarkIds: DAM_LANDMARK_IDS,
  shelters: DAM_SHELTERS,
  inaccessibleShelterId: DAM_INACCESSIBLE_SHELTER_ID,
  // Best-effort real-road-name guess for this corridor's own "named
  // corridor force-jams" beat (this scene's equivalent of
  // securityAttackScene's Kartavya-Path override) \u2014 matches likely OSM
  // name tags near Haridwar's Ganga-adjacent approach roads. UNLIKE
  // securityAttackScene's KARTAVYA_PATH_NAME_PATTERN (verified against
  // Central Secretariat's own real, documented "Kartavya Path" address
  // field), this pattern has NOT been empirically checked against a
  // live map/tile query from this authoring environment \u2014 flagged
  // explicitly per this codebase's own "no live browser access, don't
  // report unverified things as verified" standard (see
  // mapEngineCore.js's ROADS_SOURCE_LAYER comment for the same caveat
  // applied to the original scene). If it happens to match zero real
  // road features, the override simply never fires \u2014 a silent no-op,
  // not a crash \u2014 same tolerant-of-a-miss behavior the corridor-match
  // code already has.
  corridorPattern: /haridwar|har ki pauri|ganga/i,
  corridorLabel: 'Haridwar Ganga-approach corridor',
  // T+15 is this scenario's own "surge-plains" phase (see
  // tehri-dam-breach.json) \u2014 Haridwar's Har Ki Pauri inundated, Roorkee's
  // canal system overwhelmed \u2014 the natural point for this scene's named-
  // corridor override to activate, same T+15 beat security-attack uses
  // for its own unrelated reason (its "attack" phase).
  forcedJamActivationLabel: 'T+15',
  blockedShelterLabel: '\u26d4 Blocked \u2014 Haridwar approach roads submerged',
  // Same role as securityAttackScene's Rajiv Chowk: the shelter the
  // first "Shelters in range" query flies to. AIIMS Rishikesh is the
  // corridor's first shelter downstream of the dam.
  firstFocusShelterId: 'aiims-rishikesh',
};

export default tehriDamBreachScene;