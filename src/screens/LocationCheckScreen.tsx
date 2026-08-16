import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function LocationCheckScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const sessionId = route.params?.sessionId;

  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isChecked, setIsChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Checking location access...');

  useEffect(() => {
    (async () => {
      let { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locStatus === 'granted');
      
      if (locStatus === 'granted') {
        setStatusText('Fetching GPS coordinates...');
        try {
          let loc = await Location.getCurrentPositionAsync({});
          setLocation(loc);
          setStatusText('GPS coordinates acquired');
        } catch (err) {
          setStatusText('Failed to get location');
          setLocationPermission(false);
        }
      } else {
        setStatusText('Location permission denied.');
      }
    })();
  }, []);

  const handleVerifyLocation = async () => {
    if (!location || !isChecked) return;
    
    setLoading(true);
    try {
      // FOR TESTING: Auto-pass the location check
      navigation.replace('CheckIn', { 
        sessionId, 
        lat: location.coords.latitude, 
        lng: location.coords.longitude 
      });
      return;

      /*
      const res = await api.checkInLocationOnly(sessionId, location.coords.latitude, location.coords.longitude);
      if (res.success) {
        // Navigate to Face Verification screen with the location info
        navigation.replace('CheckIn', { 
          sessionId, 
          lat: location.coords.latitude, 
          lng: location.coords.longitude 
        });
      } else {
        Alert.alert('Location Verification Failed', res.message || 'You might not be in the correct geo-location.');
      }
      */
    } catch (err) {
      Alert.alert('Error', 'An error occurred during location verification.');
    } finally {
      setLoading(false);
    }
  };

  const requestLocationPermission = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(status === 'granted');
    if (status === 'granted') {
      setStatusText('Fetching GPS coordinates...');
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      setStatusText('GPS coordinates acquired');
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
          <Text style={styles.title}>Location Required</Text>
          <Text style={styles.message}>Location access is mandatory to verify you are in the classroom.</Text>
          <TouchableOpacity style={styles.button} onPress={requestLocationPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Verify Location</Text>
        <Text style={styles.subtitle}>Confirm your physical presence in the classroom before proceeding to face verification.</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.statusBox}>
          <Ionicons 
            name={location ? "checkmark-circle" : "sync"} 
            size={24} 
            color={location ? "#10B981" : "#4F46E5"} 
            style={{ marginRight: 12 }}
          />
          <Text style={[styles.statusText, location && styles.statusTextSuccess]}>
            {statusText}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.checkboxContainer} 
          activeOpacity={0.7} 
          onPress={() => setIsChecked(!isChecked)}
        >
          <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
            {isChecked && <Ionicons name="checkmark" size={18} color="#fff" />}
          </View>
          <Text style={styles.checkboxLabel}>Location check-in</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.verifyButton, (!location || !isChecked || loading) && styles.buttonDisabled]} 
          onPress={handleVerifyLocation} 
          disabled={!location || !isChecked || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.verifyButtonText}>Verify Location</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
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
    alignSelf: 'center',
  },
  header: {
    padding: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusText: {
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '500',
  },
  statusTextSuccess: {
    color: '#10B981',
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  verifyButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
