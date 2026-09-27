/**
 * Scene config for the security-attack scenario's MapLibreEngine
 * rendering. Every value here is UNCHANGED from what used to be a
 * hardcoded module-level constant inside the original monolithic
 * MapLibreView.jsx (see mapEngineCore.js's header for the full
 * modularization rationale) — this file exists purely to carry those
 * same values as data instead of hardcoding them into the shared
 * engine, so a second scene (see tehriDamBreachScene.js) can supply
 * its own different values through the exact same shape.
 */
import { LANDMARK_IDS, LANDMARKS } from '../../../data/delhiLandmarks';
import {
  METRO_SHELTERS,
  INACCESSIBLE_AFTER_KARTAVYA_JAM_SHELTER_ID,
} from '../../../data/delhiMetroShelters';

// Central Delhi centroid for the security-attack scenario's building
// cluster (mean of the 10 baseline building coordinates in
// src/scenarios/security-attack.json) — used as both the initial wide-
// establishing camera center and the last-resort fallback if a
// scenario is ever passed in with no buildings at all. Unchanged from
// the original FALLBACK_CENTER constant.
const fallbackCenter = { lat: 28.6134, lng: 77.2096 };

// ~300m "affected area" radius — unchanged from the original
// IMPACT_ZONE_RADIUS_KM constant, expanded the same way it always was
// (resolveActiveRadii's DEFAULT_RED/YELLOW/GREEN_RADIUS_KM: *0.4, *0.7,
// *1) into the three fallback bands used only when a scenario/keyframe
// defines no explicit radii of its own.
const impactZoneRadiusKm = 0.3;
const defaultRadii = {
  red: impactZoneRadiusKm * 0.4,
  yellow: impactZoneRadiusKm * 0.7,
  green: impactZoneRadiusKm,
};

export const securityAttackScene = {
  id: 'security-attack',
  label: 'Hostile Attack \u2014 Central Delhi',
  fallbackCenter,
  defaultRadii,
  landmarks: LANDMARKS,
  landmarkIds: LANDMARK_IDS,
  shelters: METRO_SHELTERS,
  inaccessibleShelterId: INACCESSIBLE_AFTER_KARTAVYA_JAM_SHELTER_ID,
  // Kartavya Path (and its former name, Rajpath) — matched by name so
  // the forced-jam override below finds the boulevard's real road
  // segment(s) without depending on any particular tile's feature id.
  // Unchanged from the original KARTAVYA_PATH_NAME_PATTERN constant.
  corridorPattern: /kartavya|rajpath/i,
  corridorLabel: 'Kartavya Path',
  // Unchanged from the original ROADS_ACTIVATION_LABEL constant — the
  // timeline label at which the named-corridor forced-jam override (and
  // the one shelter it makes inaccessible) activates.
  forcedJamActivationLabel: 'T+15',
  // Unchanged from the original hardcoded string in
  // renderShelterCardCanvas.
  blockedShelterLabel: '\u26d4 Blocked \u2014 Kartavya Path jammed',
};

export default securityAttackScene;