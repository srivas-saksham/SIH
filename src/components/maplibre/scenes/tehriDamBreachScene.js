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
const floodPath = [
  [78.4806, 30.3778], // Tehri Dam
  [78.5377, 30.3583],
  [78.4864, 30.2834],
  [78.5075, 30.2455],
  [78.5273, 30.2070],
  [78.6175, 30.2044],
  [78.5988, 30.1462], // Devprayag (Bhagirathi\u2013Alaknanda confluence) \u2014 hotspot, see floodHotspots below
  [78.5414, 30.1717],
  [78.4850, 30.1803],
  [78.4345, 30.1011],
  [78.3730, 30.1890],
  [78.3212, 30.1280], // Ram Jhula, Rishikesh \u2014 hotspot, see floodHotspots below
  [78.3200, 30.1110],
  [78.2971, 30.1225],
  [78.2900, 30.1132],
  [78.2799, 30.1078],
  [78.2819, 30.0868],
  [78.2676, 30.0869], // Raiwala \u2014 Rishikesh\u2013Haridwar stretch adjacent to Dehradun
  [78.2282, 30.0723],
  [78.2041, 30.0466],
  [78.2185, 29.9927],
  [78.2136, 29.9529],
  [78.1642, 29.9457], // Har Ki Pauri, Haridwar
  [78.1021, 29.9904],
  [78.0617, 29.9621],
  [78.0124, 29.9636],
  [77.9953, 29.8569],
  [77.9323, 29.9045],
  [77.8951, 29.8656], // IIT Roorkee
  [77.9005, 29.8321],
  [77.8880, 29.8087],
  [77.8791, 29.7833],
  [77.8661, 29.7601],
  [77.8300, 29.7500], // Landhaura \u2014 approximate interpolated midpoint
  [77.7801, 29.7158],
  [77.8357, 29.6349],
  [77.8193, 29.5858],
  [77.7829, 29.5456],
  [77.6694, 29.5395],
  [77.7050, 29.4675], // Muzaffarnagar
  [77.6151, 29.3706],
  [77.7884, 29.2745],
  [77.6249, 29.1775],
  [77.6111, 29.0808],
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

export const tehriDamBreachScene = {
  id: 'tehri-dam-breach',
  label: 'Dam Breach \u2014 Tehri Dam Catastrophic Failure',
  fallbackCenter,
  defaultRadii,
  pinImpactZoneCenter,
  floodPath,
  floodHotspots,
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
};

export default tehriDamBreachScene;