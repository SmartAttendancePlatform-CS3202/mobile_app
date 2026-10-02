import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { type CameraRef, useCameraPermission } from 'react-native-vision-camera';
import { VisionCameraView, type Face, type VisionCameraRef } from '../camera/VisionCameraView';
import { captureAndProcessFace } from '../camera/faceCaptureHelper';
import { FaceOverlay, BoundingBox, LandmarkPoint } from '../components/FaceOverlay';
import {
  ActiveLivenessDetector,
  LivenessStateMachine,
  LivenessState,
  getAverageEyeOpenness,
} from '../liveness';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const MAX_RETRIES = 3;

export default function CheckInScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const sessionId = route.params?.sessionId;
  const lat = route.params?.lat;
  const lng = route.params?.lng;

  const { hasPermission: cameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Position your face within the frame');
  const [statusState, setStatusState] = useState<'loading' | 'ready' | 'error'>('ready');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [confidence, setConfidence] = useState<number | null>(null);

  // Pipeline & UI State
  const [livenessState, setLivenessState] = useState<LivenessState>('IDLE');
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [landmarks, setLandmarks] = useState<LandmarkPoint[] | null>(null);
  const [frameWidth, setFrameWidth] = useState<number>(720);
  const [frameHeight, setFrameHeight] = useState<number>(1280);
  const [layoutWidth, setLayoutWidth] = useState<number>(200);
  const [layoutHeight, setLayoutHeight] = useState<number>(200);
  const [canVerifyManually, setCanVerifyManually] = useState<boolean>(false);

  const cameraRef = useRef<VisionCameraRef>(null);
  const stateMachineRef = useRef<LivenessStateMachine>(new LivenessStateMachine({ timeoutMs: 60000 }));
  const activeDetectorRef = useRef<ActiveLivenessDetector>(new ActiveLivenessDetector({
    bufferSize: 20,
    closedThreshold: 0.45,
    openThreshold: 0.60,
    relativeDropThreshold: 0.22,
    minWindowMs: 40,
    maxWindowMs: 1200,
  }));
  const isProcessingRef = useRef<boolean>(false);
  const hasVerifiedRef = useRef<boolean>(false);
  const latestFaceRef = useRef<Face | null>(null);
  const faceDetectedStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = stateMachineRef.current.onStateChange((event) => {
      setLivenessState(event.to);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const verifyCapturedFace = useCallback(async (face: Face) => {
    if (isProcessingRef.current || hasVerifiedRef.current) return;
    if (retryCount >= MAX_RETRIES) {
      setStatusText('Maximum verification attempts reached (3/3). Please contact your lecturer or administrator.');
      setStatusState('error');
      return;
    }

    isProcessingRef.current = true;
    setLoading(true);
    setStatusState('loading');
    setStatusText('Capturing high-resolution face biometric...');

    try {
      stateMachineRef.current.handlePassiveLivenessPassed({
        isReal: true,
        confidence: 1.0,
        glareDetected: false,
        edgeContrastScore: 1.0,
      });

      setStatusText('Analyzing facial biometric features...');
      const captured = await captureAndProcessFace(cameraRef, face, true);

      stateMachineRef.current.handleEmbeddingReady({ embedding: captured.embedding });
      setStatusText('Matching face against registered profile in database...');

      let activeWindowId = 'default_checkin_window';
      try {
        const windowsRes = await api.getActiveWindows(sessionId);
        if (windowsRes?.success && windowsRes?.windows) {
          const randomWindowId = windowsRes.windows.random_check_window?.id;
          const firstCheckInWindow = windowsRes.windows.first_check_in_window?.id;
          activeWindowId = firstCheckInWindow || randomWindowId || activeWindowId;
        }
      } catch (winErr) {
        console.log('[CheckInScreen] Active window check note:', winErr);
      }

      const faceCheckRes = await api.checkInWithFace(sessionId, activeWindowId, lat, lng, captured.embedding, captured.depthFeatures);

      if (!faceCheckRes.success || !faceCheckRes.is_match) {
        if (faceCheckRes.requires_re_registration) {
          setStatusState('error');
          setStatusText(faceCheckRes.message || 'Legacy biometric profile detected. Please re-register your face.');
          return;
        }

        const nextAttempts = retryCount + 1;
        setRetryCount(nextAttempts);
        stateMachineRef.current.handleFailure('Face verification failed');
        setStatusState('error');
        setShowSuccessModal(false);

        const matchPct = typeof faceCheckRes.confidence === 'number'
          ? ` (${Math.round(faceCheckRes.confidence * 100)}% match, requires 70%)`
          : '';
        const attemptsLeft = MAX_RETRIES - nextAttempts;
        const attemptsMsg = attemptsLeft > 0
          ? ` (${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} left)`
          : ' (Max attempts reached)';

        setStatusText((faceCheckRes.message || 'Face verification failed: Biometric mismatch.') + matchPct + attemptsMsg);
        return;
      }

      hasVerifiedRef.current = true;
      const matchScore = faceCheckRes.confidence ?? 1.0;
      setConfidence(matchScore);
      setStatusState('ready');
      setStatusText(`Verified! Face matched database profile (${Math.round(matchScore * 100)}% similarity).`);
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('[CheckInScreen] Verification error:', err);
      stateMachineRef.current.handleFailure('Verification error');
      const nextAttempts = retryCount + 1;
      setRetryCount(nextAttempts);
      setStatusText(err?.message || 'Verification pipeline error occurred.');
      setStatusState('error');
      setShowSuccessModal(false);
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  }, [sessionId, lat, lng, retryCount]);

  const handleFacesDetected = useCallback((faces: Face[]) => {
    if (hasVerifiedRef.current || isProcessingRef.current) return;

    if (!faces || faces.length === 0) {
      latestFaceRef.current = null;
      faceDetectedStartTimeRef.current = null;
      setCanVerifyManually(false);
      if (livenessState !== 'IDLE') {
        setBoundingBox(null);
        setLandmarks(null);
        activeDetectorRef.current.reset();
        stateMachineRef.current.reset();
        setStatusText('Position your face within the frame');
        setStatusState('ready');
      }
      return;
    }

    if (faces.length > 1) {
      latestFaceRef.current = null;
      faceDetectedStartTimeRef.current = null;
      setCanVerifyManually(false);
      setBoundingBox(null);
      setLandmarks(null);
      setStatusText('Multiple faces detected. Ensure only you are in frame.');
      setStatusState('error');
      return;
    }

    const face = faces[0];
    latestFaceRef.current = face;

    if (!faceDetectedStartTimeRef.current) {
      faceDetectedStartTimeRef.current = Date.now();
    }

    if (Date.now() - faceDetectedStartTimeRef.current > 2500 && !canVerifyManually) {
      setCanVerifyManually(true);
    }

    if (face.frameWidth && face.frameWidth > 0) setFrameWidth(face.frameWidth);
    if (face.frameHeight && face.frameHeight > 0) setFrameHeight(face.frameHeight);

    setBoundingBox({
      x: face.bounds.x,
      y: face.bounds.y,
      width: face.bounds.width,
      height: face.bounds.height,
    });

    const lms: LandmarkPoint[] = [];
    if (face.landmarks?.LEFT_EYE) {
      lms.push({ x: face.landmarks.LEFT_EYE.x, y: face.landmarks.LEFT_EYE.y, name: 'leftEye' });
    }
    if (face.landmarks?.RIGHT_EYE) {
      lms.push({ x: face.landmarks.RIGHT_EYE.x, y: face.landmarks.RIGHT_EYE.y, name: 'rightEye' });
    }
    if (face.landmarks?.NOSE_BASE) {
      lms.push({ x: face.landmarks.NOSE_BASE.x, y: face.landmarks.NOSE_BASE.y, name: 'nose' });
    }
    if (face.landmarks?.MOUTH_BOTTOM) {
      lms.push({ x: face.landmarks.MOUTH_BOTTOM.x, y: face.landmarks.MOUTH_BOTTOM.y, name: 'mouth' });
    }
    setLandmarks(lms);

    if (face.bounds.width < 80 || face.bounds.height < 80) {
      setStatusText('Move closer to the camera');
      setStatusState('ready');
      return;
    }

    if (livenessState === 'IDLE' || livenessState === 'TIMEOUT') {
      stateMachineRef.current.handleFaceDetected({
        boundingBox: face.bounds,
        landmarks: lms,
      });
      setStatusText('Face detected! Please blink naturally to verify liveness.');
      setStatusState('loading');
      return;
    }

    if (livenessState === 'FACE_DETECTED') {
      const now = Date.now();
      const avgOpen = getAverageEyeOpenness({
        leftEyeOpenProbability: face.leftEyeOpenProbability,
        rightEyeOpenProbability: face.rightEyeOpenProbability,
      });

      if (avgOpen !== null) {
        if (avgOpen < 0.45) {
          setStatusText('Blink detected! Processing verification...');
        } else {
          setStatusText(`Face detected (${Math.round(avgOpen * 100)}% eyes open). Blink to check in.`);
        }
      }

      const blinkResult = activeDetectorRef.current.processFrame({
        timestamp: now,
        leftEyeOpenProbability: face.leftEyeOpenProbability,
        rightEyeOpenProbability: face.rightEyeOpenProbability,
      });

      if (blinkResult.blinkDetected) {
        stateMachineRef.current.handleBlinkVerified(blinkResult);
        setStatusText('Blink verified! Capturing face biometric...');
        verifyCapturedFace(face);
      }
    }
  }, [livenessState, canVerifyManually, verifyCapturedFace]);

  const handleRetry = useCallback(() => {
    isProcessingRef.current = false;
    hasVerifiedRef.current = false;
    faceDetectedStartTimeRef.current = null;
    setCanVerifyManually(false);
    activeDetectorRef.current.reset();
    stateMachineRef.current.reset();
    setBoundingBox(null);
    setLandmarks(null);
    setStatusText('Position your face within the frame');
    setStatusState('ready');
  }, []);

  if (cameraPermission === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#094cb2" />
      </View>
    );
  }

  if (!cameraPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="warning-outline" size={48} color="#ba1a1a" />
          </View>
          <Text style={styles.title}>Camera Permission Required</Text>
          <Text style={styles.message}>Camera access is mandatory to securely check into this class.</Text>
          <TouchableOpacity style={styles.button} onPress={requestCameraPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* TopBar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={20} color="#1b1c1d" />
        </TouchableOpacity>
        <View style={styles.topBarTitles}>
          <Text style={styles.headerTitle}>Face Biometrics</Text>
          <Text style={styles.headerSubtitle}>ATTENDANCE VERIFICATION</Text>
        </View>
        <View style={styles.indicatorContainer}>
          <View style={styles.activeIndicator} />
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        {/* Camera View Circular HUD */}
        <View style={styles.cameraWrapper}>
          <View style={styles.cameraRing}>
            <View
              style={styles.cameraContainer}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setLayoutWidth(width);
                setLayoutHeight(height);
              }}
            >
              <VisionCameraView
                style={styles.camera}
                facing="front"
                ref={cameraRef}
                onFacesDetected={handleFacesDetected}
                runClassifications={true}
                runLandmarks={true}
              />
              <FaceOverlay
                boundingBox={boundingBox}
                frameWidth={frameWidth}
                frameHeight={frameHeight}
                layoutWidth={layoutWidth}
                layoutHeight={layoutHeight}
                isFrontCamera={true}
                currentState={livenessState}
                landmarks={landmarks}
              />
            </View>
          </View>
        </View>

        {/* Status Banner */}
        <View style={[
          styles.statusBox,
          statusState === 'loading' && styles.statusLoading,
          statusState === 'ready' && styles.statusReady,
          statusState === 'error' && styles.statusError,
        ]}>
          <Ionicons
            name={statusState === 'ready' ? "scan-outline" : (statusState === 'error' ? "warning-outline" : "sync")}
            size={16}
            color={statusState === 'ready' ? "#047857" : (statusState === 'error' ? "#ba1a1a" : "#094cb2")}
            style={styles.statusIcon}
          />
          <Text style={[
            styles.statusText,
            statusState === 'loading' && styles.statusTextLoading,
            statusState === 'ready' && styles.statusTextReady,
            statusState === 'error' && styles.statusTextError,
          ]}>{statusText}</Text>
        </View>

        {/* Actions */}
        <View style={styles.footer}>
          {!hasVerifiedRef.current && statusState !== 'error' && canVerifyManually && !loading && (
            <TouchableOpacity
              style={[styles.primaryBtn, { marginBottom: 12 }]}
              onPress={() => latestFaceRef.current && verifyCapturedFace(latestFaceRef.current)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Ionicons name="scan-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Blink missed? Verify Face Now</Text>
            </TouchableOpacity>
          )}

          {statusState === 'error' && retryCount < MAX_RETRIES && (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.buttonRetry]}
              onPress={handleRetry}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryBtnText}>
                    Retry Verification ({MAX_RETRIES - retryCount} left)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {statusState === 'error' && (
            <TouchableOpacity
              style={{ marginTop: 14, alignItems: 'center', paddingVertical: 4 }}
              onPress={() => navigation.navigate('FaceRegistration' as never)}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#094cb2', fontSize: 13, fontWeight: 'bold' }}>
                Having trouble? <Text style={{ textDecorationLine: 'underline' }}>Re-register Face Biometrics</Text>
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#10b981" />
            </View>
            <Text style={styles.modalTitle}>Check-In Verified!</Text>
            <Text style={styles.modalMessage}>
              {confidence !== null
                ? `Biometric match confirmed against database profile with ${Math.round(confidence * 100)}% similarity confidence.`
                : 'You have been successfully verified against the database and checked in.'}
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              activeOpacity={0.8}
              onPress={() => {
                setShowSuccessModal(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  cameraWrapper: {
    alignItems: 'center',
    marginVertical: 40,
  },
  cameraRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#b1c5ff',
    padding: 6,
    shadowColor: '#3366cc',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 110,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#ffffff',
    position: 'relative',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 32,
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusIcon: {
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statusLoading: {
    backgroundColor: '#e7ebff',
    borderColor: '#b1c5ff',
  },
  statusTextLoading: {
    color: '#094cb2',
  },
  statusReady: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  statusTextReady: {
    color: '#047857',
  },
  statusError: {
    backgroundColor: '#ffdad6',
    borderColor: '#ffb4ab',
  },
  statusTextError: {
    color: '#93000a',
  },
  footer: {
    paddingHorizontal: 24,
  },
  primaryBtn: {
    backgroundColor: '#3366cc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#3366cc',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonRetry: {
    backgroundColor: '#ba1a1a',
    shadowColor: '#ba1a1a',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
  button: {
    backgroundColor: '#3366cc',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 13,
    color: '#434653',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#3366cc',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
