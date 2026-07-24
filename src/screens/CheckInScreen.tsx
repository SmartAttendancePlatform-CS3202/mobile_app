import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function CheckInScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const sessionId = route.params?.sessionId;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Initializing sensors...');
  const [statusState, setStatusState] = useState<'loading' | 'ready' | 'error'>('loading');
  
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    (async () => {
      setStatusText('Requesting location access...');
      setStatusState('loading');
      
      let { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locStatus === 'granted');
      
      if (locStatus === 'granted') {
        setStatusText('Fetching GPS coordinates...');
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
        setStatusText('Ready for identity verification');
        setStatusState('ready');
      } else {
        setStatusText('Location permission denied.');
        setStatusState('error');
      }
    })();
  }, []);

  if (!cameraPermission || locationPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!cameraPermission.granted || !locationPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="warning-outline" size={48} color="#EF4444" />
          </View>
          <Text style={styles.title}>Permissions Required</Text>
          <Text style={styles.message}>Camera and Location access are mandatory to securely check into this class.</Text>
          <TouchableOpacity style={styles.button} onPress={requestCameraPermission}>
            <Text style={styles.buttonText}>Grant Permissions</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleCheckIn = async () => {
    if (!cameraRef.current || !location) return;
    
    setLoading(true);
    setStatusText('Analyzing biometrics...');
    setStatusState('loading');
    
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true });
      if (photo) {
        const faceCode = api.generateFaceCodeFromPhoto(photo.uri);
        
        const response = await api.checkIn(
          sessionId, 
          location.coords.latitude, 
          location.coords.longitude, 
          faceCode
        );
        
        if (response.success) {
          Alert.alert('Success', 'You have been successfully checked in!', [
            { text: 'Awesome', onPress: () => navigation.goBack() }
          ]);
        } else {
          Alert.alert('Check-In Failed', response.message);
          setStatusText('Ready for identity verification');
          setStatusState('ready');
        }
      }
    } catch (err) {
      Alert.alert('Error', 'An error occurred during check-in. Please try again.');
      setStatusText('Ready for identity verification');
      setStatusState('ready');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Info Area */}
      <View style={styles.header}>
        <Text style={styles.title}>Session Check-In</Text>
        <Text style={styles.subtitle}>Ensure your face is clearly visible and you are physically in the classroom.</Text>
      </View>

      {/* Status Banner */}
      <View style={[
        styles.statusBox, 
        statusState === 'loading' && styles.statusLoading,
        statusState === 'ready' && styles.statusReady,
        statusState === 'error' && styles.statusError,
      ]}>
        <Ionicons 
          name={statusState === 'ready' ? "checkmark-circle" : (statusState === 'error' ? "alert-circle" : "sync")} 
          size={20} 
          color={statusState === 'ready' ? "#10B981" : (statusState === 'error' ? "#EF4444" : "#4F46E5")} 
          style={styles.statusIcon}
        />
        <Text style={[
          styles.statusText,
          statusState === 'loading' && styles.statusTextLoading,
          statusState === 'ready' && styles.statusTextReady,
          statusState === 'error' && styles.statusTextError,
        ]}>{statusText}</Text>
      </View>

      {/* Camera View */}
      <View style={styles.cameraWrapper}>
        <View style={[styles.cameraContainer, statusState === 'ready' && styles.cameraReady]}>
          <CameraView style={styles.camera} facing="front" ref={cameraRef} />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.verifyButton, (!location || loading) && styles.buttonDisabled]} 
          onPress={handleCheckIn} 
          disabled={!location || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="finger-print" size={24} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.verifyButtonText}>Verify & Check In</Text>
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
    padding: 24,
    paddingBottom: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusIcon: {
    marginRight: 8,
  },
  statusLoading: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  statusReady: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusTextLoading: {
    color: '#4F46E5',
  },
  statusTextReady: {
    color: '#10B981',
  },
  statusTextError: {
    color: '#EF4444',
  },
  cameraWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraContainer: {
    width: 280,
    height: 280,
    borderRadius: 140,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#D1D5DB', // default gray border
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  cameraReady: {
    borderColor: '#10B981', // glows green when ready
    shadowColor: '#10B981',
  },
  camera: {
    flex: 1,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  verifyButton: {
    backgroundColor: '#4F46E5', // Indigo
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
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
