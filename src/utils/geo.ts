/**
 * Geolocation & Geofencing utilities for Smart Attendance
 */

export const DEFAULT_GEOFENCE_RADIUS_METERS = 30;
export const MAX_GPS_ACCURACY_THRESHOLD_METERS = 50;

/**
 * Calculates great-circle distance between two points in meters using the Haversine formula.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats a distance in meters into human-readable text.
 */
export function formatDistance(meters: number): string {
  if (meters < 1) {
    return '< 1 m';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Validates whether device GPS accuracy is acceptable for attendance check-in.
 * Acceptable range is <= 50 meters.
 */
export function isAccuracyAcceptable(accuracy: number | null | undefined): boolean {
  if (accuracy === null || accuracy === undefined || isNaN(accuracy)) {
    return true; // If device does not report accuracy metric, don't hard-block
  }
  return accuracy <= MAX_GPS_ACCURACY_THRESHOLD_METERS;
}
