import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
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

const DEFAULT_VENUE: TargetVenue = {
  name: 'Seminar Room',
  building: 'Campus Lecture Venue',
  latitude: 6.7951,
  longitude: 79.9009,
  radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
};

export default function LocationCheckScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const sessionId = route.params?.sessionId;
  const sessionParam = route.params?.session;

  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [venue, setVenue] = useState<TargetVenue>(() => {
    if (sessionParam?.geofence) {
      return {
        name: sessionParam.venue || sessionParam.courseName || DEFAULT_VENUE.name,
        building: 'Campus Lecture Venue',
        latitude: sessionParam.geofence.latitude,
        longitude: sessionParam.geofence.longitude,
        radiusMeters: sessionParam.geofence.radiusMeters || sessionParam.geofence.radius_meters || DEFAULT_GEOFENCE_RADIUS_METERS,
      };
    }
    return {
      ...DEFAULT_VENUE,
      name: sessionParam?.venue || DEFAULT_VENUE.name,
    };
  });
  const [distance, setDistance] = useState<number | null>(null);
  const [inRange, setInRange] = useState(false);
  const [accuracyOk, setAccuracyOk] = useState(true);
  const [isChecked, setIsChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Initializing location...');

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const venueRef = useRef<TargetVenue>(venue);

  useEffect(() => {
    venueRef.current = venue;
    if (location) {
      evaluateLocation(location, venue);
    }
  }, [venue]);

  useEffect(() => {
    (async () => {
      let resolvedVenue: TargetVenue = { ...venueRef.current };

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
          radiusMeters: sessionParam.geofence.radiusMeters || sessionParam.geofence.radius_meters || DEFAULT_GEOFENCE_RADIUS_METERS,
        };
      }

      try {
        const winRes = await api.getActiveWindows(sessionId);
        if (winRes?.success && winRes?.windows?.venue_geofence) {
          const vg = winRes.windows.venue_geofence;
          resolvedVenue = {
            name: vg.venue_name || resolvedVenue.name,
            building: vg.building || resolvedVenue.building,
            latitude: vg.latitude || resolvedVenue.latitude,
            longitude: vg.longitude || resolvedVenue.longitude,
            radiusMeters: vg.radius_meters || vg.radiusMeters || resolvedVenue.radiusMeters,
          };
        }
      } catch (e) {
        // Use resolved venue fallback
      }

      setVenue(resolvedVenue);
    })();
  }, [sessionId, sessionParam]);

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
      setInRange(withinPerimeter);

      if (withinPerimeter) {
        setStatusText(`Location verified • GPS Active`);
      } else {
        setStatusText(`Outside geofence (${formatDistance(dist)} away)`);
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

      setStatusText('Acquiring high-precision GPS coordinates...');
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
    } catch (err) {
      setStatusText('Failed to stream GPS location');
    }
  }, [evaluateLocation]);

  useEffect(() => {
    (async () => {
      let { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      const granted = locStatus === 'granted';
      setLocationPermission(granted);

      if (granted) {
        startLocationWatching();
      } else {
        setStatusText('Location permission denied.');
      }
    })();

    return () => {
      if (watcherRef.current) {
        watcherRef.current.remove();
        watcherRef.current = null;
      }
    };
  }, [startLocationWatching]);

  const handleRefreshLocation = async () => {
    setLoading(true);
    setStatusText('Re-fetching GPS coordinates...');
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      evaluateLocation(loc, venue);
    } catch (err) {
      Alert.alert('Location Error', 'Unable to retrieve your current location.');
    } finally {
      setLoading(false);
    }
  };

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

      if (res.success && res.inside) {
        navigation.replace('CheckIn', {
          sessionId,
          session: sessionParam,
          lat: location!.coords.latitude,
          lng: location!.coords.longitude,
        });
      } else {
        Alert.alert(
          'Location Verification Failed',
          res.message ||
            `You are outside the ${venue.radiusMeters}m geofence perimeter.`
        );
      }
    } catch (err: any) {
      Alert.alert('Verification Error', err.message || 'An error occurred during location check.');
    } finally {
      setLoading(false);
    }
  };

  const requestLocationPermission = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(status === 'granted');
    if (status === 'granted') {
      startLocationWatching();
    }
  };

  if (locationPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#094cb2" />
      </View>
    );
  }

  if (!locationPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="location-outline" size={48} color="#ba1a1a" />
          </View>
          <Text style={styles.title}>Location Access Mandatory</Text>
          <Text style={styles.message}>
            Precise GPS location is strictly required to verify you are physically inside the lecture hall geofence.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestLocationPermission}>
            <Text style={styles.primaryBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const accuracyValue = location?.coords.accuracy ? Math.round(location.coords.accuracy) : null;

  return (
    <View style={styles.container}>
      {/* TopBar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={20} color="#1b1c1d" />
        </TouchableOpacity>
        <View style={styles.topBarTitles}>
          <Text style={styles.headerTitle}>Session Check-In</Text>
          <Text style={styles.headerSubtitle}>ATTENDANCE VERIFICATION</Text>
        </View>
        <View style={styles.indicatorContainer}>
          <View style={styles.activeIndicator} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Unified Venue & Proximity Card */}
        <View style={styles.venueSection}>
          <View style={styles.venueCard}>
            <View style={styles.venueTopRow}>
              <View style={styles.venueInfoLeft}>
                <View style={styles.venueIconWrapper}>
                  <Ionicons name="business-outline" size={20} color="#094cb2" />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.venueName} numberOfLines={1}>{venue.name}</Text>
                  <Text style={styles.venueDept} numberOfLines={1}>{venue.building}</Text>
                </View>
              </View>
              <View style={styles.venueInfoRight}>
                <View style={[styles.distancePill, inRange ? styles.distancePillSuccess : styles.distancePillWarn]}>
                  <Text style={[styles.distanceText, inRange ? styles.textSuccess : styles.textWarn]}>
                    {distance !== null ? `${formatDistance(distance)} Away` : '--'}
                  </Text>
                </View>
                <Text style={styles.accuracyText}>±{accuracyValue || '?'}m Accuracy</Text>
              </View>
            </View>
          </View>

          {/* Geofence sub-banner */}
          <View style={[styles.geofenceBanner, inRange ? styles.geofenceSuccess : styles.geofenceWarn]}>
            <View style={styles.geofenceLeft}>
              <View style={[styles.geofenceIcon, inRange ? styles.geofenceIconSuccess : styles.geofenceIconWarn]}>
                <Ionicons name={inRange ? "checkmark" : "warning"} size={14} color={inRange ? "#2e7d32" : "#92400e"} />
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.geofenceTitle}>
                    {inRange ? `Within ${venue.radiusMeters}m geofence` : `Outside ${venue.radiusMeters}m geofence`}
                  </Text>
                  {inRange && (
                    <View style={styles.inZonePill}>
                      <Text style={styles.inZoneText}>IN ZONE</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.geofenceSubtitle, inRange ? { color: '#2e7d32' } : { color: '#92400e' }]}>
                  {statusText}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.refreshBtn} onPress={handleRefreshLocation} disabled={loading}>
              <Ionicons name="refresh" size={12} color="#094cb2" />
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* Verification Consent Card */}
        <TouchableOpacity
          style={styles.consentCard}
          activeOpacity={0.8}
          onPress={() => inRange && setIsChecked(!isChecked)}
          disabled={!inRange}
        >
          <View style={[styles.checkbox, isChecked && styles.checkboxChecked, !inRange && { opacity: 0.5 }]}>
            {isChecked && <Ionicons name="checkmark" size={12} color="#ffffff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.consentTitle, !inRange && { color: '#737784' }]}>
              I confirm I am physically present in {venue.name}
            </Text>
            <Text style={styles.consentSubtitle}>
              Biometrics & location coordinates verified for attendance record.
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, (!location || !isChecked || !inRange || loading) && styles.primaryBtnDisabled]}
          onPress={handleVerifyLocation}
          disabled={!location || !isChecked || !inRange || loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="shield-checkmark-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Proceed to Face Verification</Text>
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
    backgroundColor: '#f0f2f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(195, 198, 213, 0.3)',
    zIndex: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f5f3f4',
    borderWidth: 1,
    borderColor: 'rgba(195, 198, 213, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitles: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1b1c1d',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(67, 70, 83, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  indicatorContainer: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#094cb2',
    borderWidth: 2,
    borderColor: '#d9e2ff',
  },
  scrollContent: {
    padding: 16,
    flexGrow: 1,
  },
  venueSection: {
    gap: 8,
    marginBottom: 20,
  },
  venueCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(195, 198, 213, 0.4)',
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  venueTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  venueInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  venueIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(177, 197, 255, 0.5)',
    borderWidth: 1,
    borderColor: '#b1c5ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  venueName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginBottom: 2,
  },
  venueDept: {
    fontSize: 11,
    color: '#434653',
  },
  venueInfoRight: {
    alignItems: 'flex-end',
  },
  distancePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  distancePillSuccess: {
    backgroundColor: '#e8f5e9',
  },
  distancePillWarn: {
    backgroundColor: '#fff3e0',
  },
  distanceText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  textSuccess: {
    color: '#1b5e20',
  },
  textWarn: {
    color: '#e65100',
  },
  accuracyText: {
    fontSize: 10,
    color: 'rgba(67, 70, 83, 0.8)',
  },
  geofenceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  geofenceSuccess: {
    backgroundColor: '#f2f8f4',
    borderColor: '#cbe4d2',
  },
  geofenceWarn: {
    backgroundColor: '#fff8e1',
    borderColor: '#ffe082',
  },
  geofenceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  geofenceIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  geofenceIconSuccess: {
    backgroundColor: '#dcf0e2',
  },
  geofenceIconWarn: {
    backgroundColor: '#ffecb3',
  },
  geofenceTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1b1c1d',
  },
  inZonePill: {
    backgroundColor: '#dcf0e2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  inZoneText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1b5e20',
  },
  geofenceSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(195, 198, 213, 0.5)',
    marginLeft: 8,
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#094cb2',
    marginLeft: 4,
  },
  consentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(195, 198, 213, 0.4)',
    marginBottom: 4,
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#c3c6d5',
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3366cc',
    borderColor: '#3366cc',
  },
  consentTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginBottom: 4,
  },
  consentSubtitle: {
    fontSize: 10,
    color: '#434653',
    lineHeight: 14,
  },
  footer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(195, 198, 213, 0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -3 },
  },
  primaryBtn: {
    backgroundColor: '#3366cc',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3366cc',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  primaryBtnDisabled: {
    backgroundColor: '#c3c6d5',
    shadowOpacity: 0,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
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
    backgroundColor: '#ffdad6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#434653',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
});
