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

export const tehriDamBreachScene = {
  id: 'tehri-dam-breach',
  label: 'Dam Breach \u2014 Tehri Dam Catastrophic Failure',
  fallbackCenter,
  defaultRadii,
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