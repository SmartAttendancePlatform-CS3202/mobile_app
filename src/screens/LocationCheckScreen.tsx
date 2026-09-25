import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  AppState,
  Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

import {
  calculateHaversineDistance,
  formatDistance,
  isAccuracyAcceptable,
  DEFAULT_GEOFENCE_RADIUS_METERS,
} from '../utils/geo';

interface TargetVenue {
  name: string;
  building?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

// University of Moratuwa CSE Seminar Room default center
const DEFAULT_VENUE: TargetVenue = {
  name: 'Seminar Room',
  building: 'CSE Department, UoM',
  latitude: 6.7951,
  longitude: 79.9009,
  radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS, // 30m
};

export default function LocationCheckScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const sessionId = route.params?.sessionId;
  const sessionParam = route.params?.session;


  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [venue, setVenue] = useState<TargetVenue>(DEFAULT_VENUE);
  const [distance, setDistance] = useState<number | null>(null);
  const [inRange, setInRange] = useState(false);
  const [accuracyOk, setAccuracyOk] = useState(true);
  const [isChecked, setIsChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Initializing location...');

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const venueRef = useRef<TargetVenue>(DEFAULT_VENUE);

  useEffect(() => {
    venueRef.current = venue;
  }, [venue]);

  // 1. Resolve venue coordinates on-demand from venue_id, parameters, or active windows
  useEffect(() => {
    (async () => {
      let resolvedVenue: TargetVenue = { ...DEFAULT_VENUE };

      // On-demand venue details resolution from database
      if (sessionParam?.venue_id) {
        try {
          const venueRes = await api.getVenueDetails(sessionParam.venue_id);
          if (venueRes?.success && venueRes?.venue) {
            resolvedVenue = {
              name: venueRes.venue.name || sessionParam.venue || DEFAULT_VENUE.name,
              building: venueRes.venue.building || 'Campus Lecture Venue',
              latitude: venueRes.venue.latitude,
              longitude: venueRes.venue.longitude,
              radiusMeters: venueRes.venue.radiusMeters || DEFAULT_GEOFENCE_RADIUS_METERS,
            };
          }
        } catch (vErr) {
          console.log('[LocationCheckScreen] On-demand venue resolve note:', vErr);
        }
      } else if (sessionParam?.geofence) {
        resolvedVenue = {
          name: sessionParam.venue || sessionParam.courseName || DEFAULT_VENUE.name,
          building: 'Campus Lecture Venue',
          latitude: sessionParam.geofence.latitude,
          longitude: sessionParam.geofence.longitude,
          radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS, // Strict 30m
        };
      }

      // Query active windows to check if backend provided dynamic lecture venue override
      try {
        const winRes = await api.getActiveWindows(sessionId);
        if (winRes?.success && winRes?.windows?.venue_geofence) {
          const vg = winRes.windows.venue_geofence;
          resolvedVenue = {
            name: vg.venue_name || resolvedVenue.name,
            building: vg.building || resolvedVenue.building,
            latitude: vg.latitude || resolvedVenue.latitude,
            longitude: vg.longitude || resolvedVenue.longitude,
            radiusMeters: vg.radius_meters || DEFAULT_GEOFENCE_RADIUS_METERS,
          };
        }
      } catch (e) {
        // Use resolved venue fallback
      }

      setVenue(resolvedVenue);
      venueRef.current = resolvedVenue;
      setLocation((currentLoc) => {
        if (currentLoc) {
          evaluateLocation(currentLoc, resolvedVenue);
        }
        return currentLoc;
      });
    })();
  }, [sessionId, sessionParam]);

  // 2. Continuous location updates with Location.watchPositionAsync
  const evaluateLocation = useCallback(
    (loc: Location.LocationObject, target: TargetVenue) => {
      setLocation(loc);

      const dist = calculateHaversineDistance(
        loc.coords.latitude,
        loc.coords.longitude,
        target.latitude,
        target.longitude
      );
      setDistance(dist);

      const accOk = isAccuracyAcceptable(loc.coords.accuracy);
      setAccuracyOk(accOk);

      const withinPerimeter = dist <= target.radiusMeters;
      // Do NOT block verification based on low location accuracy
      setInRange(withinPerimeter);

      if (withinPerimeter) {
        setStatusText(
          accOk
            ? `Within range (${formatDistance(dist)} from venue)`
            : `Within range (${formatDistance(dist)} from venue) • GPS accuracy: ±${Math.round(loc.coords.accuracy || 0)}m`
        );
      } else {
        setStatusText(`Outside geofence (${formatDistance(dist)} away, must be <= ${target.radiusMeters}m)`);
      }
    },
    []
  );

  const startLocationWatching = useCallback(async () => {
    try {
      if (watcherRef.current) {
        watcherRef.current.remove();
        watcherRef.current = null;
      }

      setStatusText('Acquiring GPS coordinates...');

      // 1. Instant check with last known position if available
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          evaluateLocation(lastKnown, venueRef.current);
        }
      } catch (e) {
        // Non-fatal
      }

      // 2. Stream real-time coordinates
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1500,
          distanceInterval: 1,
        },
        (newLoc) => {
          evaluateLocation(newLoc, venueRef.current);
        }
      );
      watcherRef.current = sub;
    } catch (err: any) {
      console.warn('[LocationCheckScreen] watchPositionAsync error:', err);
      setStatusText('Failed to acquire GPS location. Tap Refresh GPS.');
    }
  }, [evaluateLocation]);

  const checkAndRequestPermission = useCallback(
    async (isUserInitiated = false) => {
      try {
        // A. Check if device location services (GPS toggle in Android) is enabled
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (isUserInitiated) {
            try {
              await Location.enableNetworkProviderAsync();
            } catch (e) {
              Alert.alert(
                'Location Services Disabled',
                'Device GPS / Location is turned off. Please turn on Location in your device settings to continue.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => Linking.openSettings() },
                ]
              );
              setLocationPermission(false);
              return;
            }
          } else {
            setLocationPermission(false);
            setStatusText('Device Location (GPS) is turned off.');
            return;
          }
        }

        // B. Check current permission status
        const current = await Location.getForegroundPermissionsAsync();
        if (current.granted) {
          setLocationPermission(true);
          startLocationWatching();
          return;
        }

        // C. If Android refuses to ask again (canAskAgain is false) and user pressed button
        if (isUserInitiated && !current.canAskAgain) {
          Alert.alert(
            'Location Permission Required',
            'Location permission is blocked or was previously denied. Please open Settings and enable Location permission for this app.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
          setLocationPermission(false);
          return;
        }

        // D. Request permission from OS
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.granted) {
          setLocationPermission(true);
          startLocationWatching();
        } else {
          setLocationPermission(false);
          setStatusText('Location permission denied.');
          if (isUserInitiated) {
            Alert.alert(
              'Permission Denied',
              'Location permission is required to verify you are inside the lecture hall geofence. Please enable it in Settings.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            );
          }
        }
      } catch (err: any) {
        console.warn('[LocationCheckScreen] checkAndRequestPermission error:', err);
        setLocationPermission(false);
        if (isUserInitiated) {
          Alert.alert(
            'Location Error',
            'Could not request location permission. Please open Settings and grant Location permission manually.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
      }
    },
    [startLocationWatching]
  );

  useEffect(() => {
    checkAndRequestPermission(false);

    // Re-check automatically when user returns from Settings / other app
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const services = await Location.hasServicesEnabledAsync();
          if (services) {
            setLocationPermission(true);
            startLocationWatching();
          }
        }
      }
    });

    return () => {
      subscription.remove();
      if (watcherRef.current) {
        watcherRef.current.remove();
        watcherRef.current = null;
      }
    };
  }, [checkAndRequestPermission, startLocationWatching]);

  // 3. Manual GPS Refresh
  const handleRefreshLocation = async () => {
    setLoading(true);
    setStatusText('Re-fetching GPS coordinates...');
    try {
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        await Location.enableNetworkProviderAsync();
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      evaluateLocation(loc, venueRef.current);
    } catch (err: any) {
      Alert.alert(
        'Location Error',
        'Unable to retrieve your current location. Please ensure device GPS is enabled and location permission is granted.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  // 4. Verify Location with Backend & Proceed to Face Verification
  const handleVerifyLocation = async () => {
    if (!location || !isChecked || !inRange) return;

    setLoading(true);
    setStatusText('Validating coordinates with server...');

    try {
      const res = await api.verifyLocation(
        sessionId,
        location!.coords.latitude,
        location!.coords.longitude
      );

      const targetSessionId = res.lecture_session_id || sessionId;

      if (res.success && res.inside) {
        // Location confirmed by both client and backend! Proceed to Face Verification
        navigation.replace('CheckIn', {
          sessionId: targetSessionId,
          session: sessionParam,
          lat: location!.coords.latitude,
          lng: location!.coords.longitude,
        });
      } else if (inRange && (res.message?.includes('not yet active') || res.message?.includes('not found') || res.message?.includes('Lecture session'))) {
        // GPS verified that student is physically inside the lecture venue perimeter (inRange === true)
        Alert.alert(
          'Location Verified at Venue',
          'Your location is within the lecture hall geofence. The server lecture session record is initializing. Proceeding to face verification.',
          [
            {
              text: 'Continue',
              onPress: () => {
                navigation.replace('CheckIn', {
                  sessionId: targetSessionId,
                  session: sessionParam,
                  lat: location!.coords.latitude,
                  lng: location!.coords.longitude,
                });
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Location Verification Failed',
          res.message ||
            `You are outside the ${venue.radiusMeters}m geofence perimeter (${formatDistance(
              res.distance_meters || distance || 0
            )} away).`
        );
      }
    } catch (err: any) {
      Alert.alert('Verification Error', err.message || 'An error occurred during location check.');
    } finally {
      setLoading(false);
    }
  };

  if (locationPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!locationPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="location-outline" size={48} color="#EF4444" />
          </View>
          <Text style={styles.title}>Location Access Mandatory</Text>
          <Text style={styles.message}>
            GPS location is strictly required to verify you are physically inside the designated lecture hall geofence.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => checkAndRequestPermission(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondarySettingsButton}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
            <Text style={styles.secondarySettingsButtonText}>Open App Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const accuracyValue = location?.coords.accuracy ? Math.round(location.coords.accuracy) : null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {'Lecture Hall Proximity'}
          </Text>
          <Text style={styles.subtitle}>
            {`You must be within ${venue.radiusMeters} meters of the lecture hall to check in.`}
          </Text>
        </View>

        {/* Venue Target Card */}
        <View style={styles.venueCard}>
          <View style={styles.venueIconContainer}>
            <Ionicons name="business" size={24} color="#4F46E5" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.venueLabel}>Designated Venue</Text>
            <Text style={styles.venueName}>{venue.name}</Text>
            {venue.building ? <Text style={styles.venueBuilding}>{venue.building}</Text> : null}
            <View style={styles.perimeterRow}>
              <Ionicons name="shield-checkmark" size={14} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={styles.perimeterText}>
                {`Geofence Perimeter: ${venue.radiusMeters}m radius`}
              </Text>
            </View>
          </View>
        </View>

        {/* Live Proximity Banner */}
        <View
          style={[
            styles.proximityCard,
            inRange
              ? styles.proximityInRange
              : distance !== null
              ? styles.proximityOutOfRange
              : styles.proximityWarning,
          ]}
        >
          <View style={styles.proximityHeader}>
            <Ionicons
              name={
                inRange
                  ? 'checkmark-circle'
                  : distance !== null
                  ? 'close-circle'
                  : 'navigate-circle'
              }
              size={32}
              color={
                inRange
                  ? '#10B981'
                  : distance !== null
                  ? '#EF4444'
                  : '#6366F1'
              }
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.proximityTitle,
                  inRange
                    ? styles.textSuccess
                    : distance !== null
                    ? styles.textDanger
                    : styles.textWarning,
                ]}
              >
                {inRange
                  ? 'Within Lecture Hall'
                  : distance !== null
                  ? `${formatDistance(distance)} Away`
                  : 'Acquiring GPS...'}
              </Text>
              <Text style={styles.proximitySubtitle}>
                {inRange
                  ? `You are ${formatDistance(distance || 0)} from venue center (allowed: <= ${venue.radiusMeters}m).`
                  : distance !== null
                  ? `Outside ${venue.radiusMeters}m perimeter. Move closer to the classroom to check in.`
                  : 'Fetching satellite positioning...'}
              </Text>
            </View>
          </View>

          {/* GPS Accuracy Pill & Live Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metricBadge}>
              <Ionicons name="navigate-outline" size={14} color="#4B5563" style={{ marginRight: 4 }} />
              <Text style={styles.metricText}>
                {distance !== null ? `Distance: ${formatDistance(distance)}` : 'Distance: --'}
              </Text>
            </View>

            <View
              style={[
                styles.metricBadge,
                accuracyOk ? styles.metricBadgeGood : styles.metricBadgeWarn,
              ]}
            >
              <Ionicons
                name="radio-outline"
                size={14}
                color={accuracyOk ? '#059669' : '#D97706'}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.metricText,
                  accuracyOk ? { color: '#059669' } : { color: '#D97706' },
                ]}
              >
                {`Accuracy: ${accuracyValue !== null ? `±${accuracyValue}m` : '--'}`}
              </Text>
            </View>
          </View>

          {!accuracyOk && accuracyValue !== null && (
            <View style={styles.accuracyNoteRow}>
              <Ionicons name="information-circle-outline" size={14} color="#D97706" style={{ marginRight: 5 }} />
              <Text style={styles.accuracyNoteText}>
                Location accuracy is ±{accuracyValue}m (low GPS accuracy, verification allowed).
              </Text>
            </View>
          )}
        </View>

        {/* Refresh GPS Action */}
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefreshLocation}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
          <Text style={styles.refreshButtonText}>Refresh GPS Position</Text>
        </TouchableOpacity>

        {/* Status text */}
        <Text style={styles.statusHelperText}>
          {loading ? 'Validating location...' : statusText}
        </Text>

        {/* Presence Confirmation Checkbox */}
        <TouchableOpacity
          style={[styles.checkboxContainer, !inRange && styles.checkboxDisabled]}
          activeOpacity={0.7}
          onPress={() => inRange && setIsChecked(!isChecked)}
          disabled={!inRange}
        >
          <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
            {isChecked && <Ionicons name="checkmark" size={18} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.checkboxLabel, !inRange && { color: '#9CA3AF' }]}>
              {`I confirm I am physically present in ${venue.name}`}
            </Text>
            <Text style={styles.checkboxSubtext}>
              {'Location spoofing or proxy check-in attempts are logged for disciplinary review.'}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Footer Action */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.verifyButton,
            (!location || !isChecked || !inRange || loading) && styles.buttonDisabled,
          ]}
          onPress={handleVerifyLocation}
          disabled={!location || !isChecked || !inRange || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="camera-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.verifyButtonText}>
                {inRange
                  ? 'Proceed to Face Verification'
                  : distance !== null
                  ? `Must Be Within ${venue.radiusMeters}m of Venue`
                  : 'Acquiring GPS Location...'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 36,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  venueIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  venueLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  venueName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  venueBuilding: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 1,
  },
  perimeterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  perimeterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  proximityCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 14,
  },
  proximityInRange: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  proximityOutOfRange: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  proximityWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  proximityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  proximityTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  proximitySubtitle: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  textSuccess: {
    color: '#065F46',
  },
  textDanger: {
    color: '#991B1B',
  },
  textWarning: {
    color: '#92400E',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  metricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metricBadgeGood: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  metricBadgeWarn: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  metricText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  accuracyNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#FFFBEB',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  accuracyNoteText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '500',
    flex: 1,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    alignSelf: 'center',
    marginBottom: 8,
  },
  refreshButtonText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
  },
  statusHelperText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  checkboxDisabled: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
    marginBottom: 2,
  },
  checkboxSubtext: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 16,
  },
  footer: {
    padding: 20,
    paddingBottom: 32,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  verifyButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondarySettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  secondarySettingsButtonText: {
    color: '#4F46E5',
    fontSize: 15,
    fontWeight: '700',
  },
});
