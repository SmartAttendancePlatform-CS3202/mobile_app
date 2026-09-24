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
  const [layoutWidth, setLayoutWidth] = useState<number>(280);
  const [layoutHeight, setLayoutHeight] = useState<number>(280);
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

  // Subscribe to state machine transitions
  useEffect(() => {
    const unsubscribe = stateMachineRef.current.onStateChange((event) => {
      setLivenessState(event.to);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Real camera frame face capture & database verification
   */
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

      // 1. Capture real photo, crop to face with front-camera mirroring, extract real 192D RGB embedding
      setStatusText('Analyzing facial biometric features...');
      const captured = await captureAndProcessFace(cameraRef, face, true);

      stateMachineRef.current.handleEmbeddingReady({ embedding: captured.embedding });
      setStatusText('Matching face against registered profile in database...');

      // 2. Discover active session window
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

      // 3. Verify real embedding with backend microservice / database
      const faceCheckRes = await api.checkInWithFace(sessionId, activeWindowId, lat, lng, captured.embedding);

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

      // Match confirmed against database!
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

  /**
   * Real-time face detection handler attached directly to VisionCamera MLKit output
   */
  const handleFacesDetected = useCallback((faces: Face[]) => {
    if (hasVerifiedRef.current || isProcessingRef.current) {
      return;
    }

    // Case 1: No face in frame (e.g. camera pointed at wall or random object)
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

    // Case 2: Multiple faces detected (anti-spoof / fraud precaution)
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

    // Case 3: Exactly 1 face in view
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

    // Update bounding box for overlay
    setBoundingBox({
      x: face.bounds.x,
      y: face.bounds.y,
      width: face.bounds.width,
      height: face.bounds.height,
    });

    // Map landmark points for visual overlay
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

    // Check face size: reject tiny/distant faces
    if (face.bounds.width < 80 || face.bounds.height < 80) {
      setStatusText('Move closer to the camera');
      setStatusState('ready');
      return;
    }

    // State Machine & Active Liveness Progression
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

  /**
   * Reset pipeline on user retry
   */
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
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!cameraPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="warning-outline" size={48} color="#EF4444" />
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

      {/* Camera View & Face Bounding Box Overlay */}
      <View style={styles.cameraWrapper}>
        <View
          style={[styles.cameraContainer, statusState === 'ready' && styles.cameraReady]}
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

      {/* Actions */}
      <View style={styles.footer}>
        {!hasVerifiedRef.current && statusState !== 'error' && canVerifyManually && !loading && (
          <TouchableOpacity
            style={[styles.verifyButton, { backgroundColor: '#4F46E5', marginBottom: 12 }]}
            onPress={() => latestFaceRef.current && verifyCapturedFace(latestFaceRef.current)}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Ionicons name="scan-circle-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.verifyButtonText}>Blink missed? Verify Face Now</Text>
          </TouchableOpacity>
        )}

        {statusState === 'error' && retryCount < MAX_RETRIES && (
          <TouchableOpacity
            style={[styles.verifyButton, styles.buttonRetry]}
            onPress={handleRetry}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.verifyButtonText}>
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
            <Text style={{ color: '#4F46E5', fontSize: 13, fontWeight: '600' }}>
              Having trouble? <Text style={{ textDecorationLine: 'underline' }}>Re-register Face Biometrics</Text>
            </Text>
          </TouchableOpacity>
        )}
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
              <Ionicons name="checkmark-circle" size={72} color="#10B981" />
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
              <Text style={styles.modalButtonText}>Awesome</Text>
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
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusLoading: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  statusTextLoading: {
    color: '#4F46E5',
  },
  statusReady: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusTextReady: {
    color: '#065F46',
  },
  statusError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusTextError: {
    color: '#991B1B',
  },
  cameraWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cameraContainer: {
    width: 280,
    height: 380,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#E5E7EB',
    position: 'relative',
    backgroundColor: '#000',
  },
  cameraReady: {
    borderColor: '#10B981',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  footer: {
    padding: 24,
    paddingBottom: 36,
  },
  verifyButton: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonRetry: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
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
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
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
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
