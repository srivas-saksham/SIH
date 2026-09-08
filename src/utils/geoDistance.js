/**
 * Plain haversine great-circle distance in kilometers between two
 * {lat, lng} points. Used by the chat-authored analyst response /
 * timeline-briefing content (Section 6 of PROJECT_CONTEXT_V3.md) to
 * compute "distance from impact" and "nearest landmark" style copy from
 * real coordinate data already in the codebase (LANDMARKS, METRO_SHELTERS,
 * security-attack.json), rather than hardcoding distances as new copy.
 *
 * MapLibreView.jsx does its own equivalent distance math via turf
 * (turf.distance) for on-map badges — this is a dependency-free
 * equivalent for use in plain chat-copy generation in CommandShell/
 * ChatPanel, which doesn't otherwise need turf as a dependency.
 */
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}

export default haversineDistanceKm;