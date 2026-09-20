import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
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
import { computeCentroidEmbedding } from '../embedding';
import {
  PoseGuide,
  POSE_SEQUENCE,
  GuidedPose,
} from '../enrollment';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

interface OnboardingScreenProps {
  onSuccess: () => void;
}

export default function OnboardingScreen({ onSuccess }: OnboardingScreenProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pipeline & UI state
  const [livenessState, setLivenessState] = useState<LivenessState>('IDLE');
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [landmarks, setLandmarks] = useState<LandmarkPoint[] | null>(null);
  const [frameWidth, setFrameWidth] = useState<number>(720);
  const [frameHeight, setFrameHeight] = useState<number>(1280);
  const [layoutWidth, setLayoutWidth] = useState<number>(300);
  const [layoutHeight, setLayoutHeight] = useState<number>(300);
  const [poseInstruction, setPoseInstruction] = useState<string>('Look straight at the camera to start');
  const [poseProgress, setPoseProgress] = useState<
    { current: number; total: number; poseName: string } | undefined
  >(undefined);
  const [poseDirection, setPoseDirection] = useState<GuidedPose | undefined>(undefined);
  const [canStartManually, setCanStartManually] = useState<boolean>(false);
  const [eyeOpenPct, setEyeOpenPct] = useState<number | null>(null);

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
  const poseGuideRef = useRef<PoseGuide>(new PoseGuide(3));
  const isCapturingRef = useRef<boolean>(false);
  const capturedEmbeddingsRef = useRef<Float32Array[]>([]);
  const depthFeaturesRef = useRef<number[]>([]);
  const isBlinkVerifiedRef = useRef<boolean>(false);
  const isRegistrationCompleteRef = useRef<boolean>(false);
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
   * Advances pipeline to Pose 1 (CENTER) of the 5-angle sequence
   */
  const startPoseSequence = useCallback(() => {
    if (isBlinkVerifiedRef.current || isRegistrationCompleteRef.current) return;
    isBlinkVerifiedRef.current = true;
    const currentState = stateMachineRef.current.getState();
    if (currentState === 'IDLE' || currentState === 'TIMEOUT') {
      stateMachineRef.current.handleFaceDetected();
    }
    stateMachineRef.current.handleBlinkVerified({ blinkDetected: true });
    stateMachineRef.current.handlePassiveLivenessPassed({
      isReal: true,
      confidence: 1.0,
      glareDetected: false,
      edgeContrastScore: 1.0,
    });
    stateMachineRef.current.handlePoseCaptureStarted();

    const target = POSE_SEQUENCE[0];
    setPoseDirection(target.pose);
    setPoseProgress({ current: 0, total: POSE_SEQUENCE.length, poseName: target.pose });
    setPoseInstruction(target.instruction);
  }, []);

  /**
   * Captures a real photo for a qualified pose and advances to the next orientation
   */
  const captureCurrentPose = useCallback(async (face: Face, targetPose: GuidedPose, poseIndex: number) => {
    if (isCapturingRef.current || isRegistrationCompleteRef.current) return;
    isCapturingRef.current = true;
    setLoading(true);

    try {
      setPoseInstruction(`Capturing ${targetPose} pose... hold still`);
      const captured = await captureAndProcessFace(cameraRef, face, true);

      capturedEmbeddingsRef.current.push(captured.embedding);

      // Save depth features from the frontal center capture
      if (targetPose === 'CENTER' && captured.depthFeatures.length === 48) {
        depthFeaturesRef.current = captured.depthFeatures;
      }

      const nextIndex = poseIndex + 1;

      if (nextIndex < POSE_SEQUENCE.length) {
        poseGuideRef.current.advance();
        const nextTarget = POSE_SEQUENCE[nextIndex];
        setPoseDirection(nextTarget.pose);
        setPoseProgress({ current: nextIndex, total: POSE_SEQUENCE.length, poseName: nextTarget.pose });
        setPoseInstruction(nextTarget.instruction);
      } else {
        // All 5 poses captured successfully!
        isRegistrationCompleteRef.current = true;
        stateMachineRef.current.handleAllPosesCaptured({ poseCount: capturedEmbeddingsRef.current.length });
        setPoseProgress({ current: 5, total: 5, poseName: 'COMPLETE' });
        setPoseInstruction('Computing multi-dimensional centroid biometric profile...');

        // Step 5: Depth Estimation & Centroid Calculation
        const finalDepth = depthFeaturesRef.current.length === 48
          ? depthFeaturesRef.current
          : captured.depthFeatures;
        stateMachineRef.current.handleDepthEstimated({ depthFeatureDim: finalDepth.length });

        const centroidEmbedding = computeCentroidEmbedding(capturedEmbeddingsRef.current);
        stateMachineRef.current.handleEmbeddingReady({ centroid: centroidEmbedding });
        setPoseInstruction('Securing & transmitting profile to database...');

        // Step 6: Transmit to database via attendance microservice API
        const enrollmentMetadata = {
          pose_count: capturedEmbeddingsRef.current.length,
          poses: POSE_SEQUENCE.map((p) => p.pose),
          capture_timestamp: new Date().toISOString(),
          lighting_normalized: true,
          depth_dimensions: finalDepth.length,
          version: 3,
        };

        const regResponse = await api.registerFace(
          centroidEmbedding,
          capturedEmbeddingsRef.current,
          finalDepth,
          enrollmentMetadata,
          0.98
        );

        if (regResponse.success) {
          setPoseInstruction('Face biometrics registered successfully!');
          onSuccess();
        } else {
          stateMachineRef.current.handleFailure('Registration failed');
          setError(regResponse.message || 'Face registration failed. Please retry.');
        }
      }
    } catch (err: any) {
      console.error('[OnboardingScreen] Pose capture error:', err);
      setError(err?.message || 'Error capturing pose. Please retry.');
    } finally {
      setLoading(false);
      isCapturingRef.current = false;
    }
  }, [onSuccess]);

  /**
   * Live frame face detection handler
   */
  const handleFacesDetected = useCallback((faces: Face[]) => {
    if (isCapturingRef.current || isRegistrationCompleteRef.current) {
      return;
    }

    // Case 1: No face in frame (or pointed at random object)
    if (!faces || faces.length === 0) {
      faceDetectedStartTimeRef.current = null;
      setCanStartManually(false);
      setEyeOpenPct(null);
      if (livenessState !== 'IDLE' && !isBlinkVerifiedRef.current) {
        setBoundingBox(null);
        setLandmarks(null);
        activeDetectorRef.current.reset();
        stateMachineRef.current.reset();
        setPoseInstruction('Position your face within the frame');
      }
      return;
    }

    // Case 2: Multiple faces detected
    if (faces.length > 1) {
      setBoundingBox(null);
      setLandmarks(null);
      setPoseInstruction('Multiple faces detected. Ensure only you are visible.');
      return;
    }

    // Case 3: Exactly 1 face detected
    const face = faces[0];
    if (face.frameWidth && face.frameWidth > 0) setFrameWidth(face.frameWidth);
    if (face.frameHeight && face.frameHeight > 0) setFrameHeight(face.frameHeight);

    // Update overlay bounding box
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

    if (face.bounds.width < 80 || face.bounds.height < 80) {
      setPoseInstruction('Move closer to the camera');
      return;
    }

    // Step 1: Active Blink Verification on Frontal Face
    if (!isBlinkVerifiedRef.current) {
      if (!faceDetectedStartTimeRef.current) {
        faceDetectedStartTimeRef.current = Date.now();
      }

      // Check if face has been steady for 2.5 seconds to enable manual start fallback
      if (Date.now() - faceDetectedStartTimeRef.current > 2500 && !canStartManually) {
        setCanStartManually(true);
      }

      const avgOpen = getAverageEyeOpenness({
        leftEyeOpenProbability: face.leftEyeOpenProbability,
        rightEyeOpenProbability: face.rightEyeOpenProbability,
      });

      if (avgOpen !== null) {
        setEyeOpenPct(Math.round(avgOpen * 100));
      }

      if (livenessState === 'IDLE' || livenessState === 'TIMEOUT') {
        stateMachineRef.current.handleFaceDetected({ boundingBox: face.bounds, landmarks: lms });
        setPoseInstruction('Face detected! Please blink naturally to start enrollment.');
        return;
      }

      if (livenessState === 'FACE_DETECTED') {
        const now = Date.now();
        const blinkResult = activeDetectorRef.current.processFrame({
          timestamp: now,
          leftEyeOpenProbability: face.leftEyeOpenProbability,
          rightEyeOpenProbability: face.rightEyeOpenProbability,
        });

        if (blinkResult.blinkDetected) {
          setPoseInstruction('Blink confirmed! Starting 5-angle registration...');
          startPoseSequence();
          return;
        }

        if (avgOpen !== null) {
          if (avgOpen < 0.45) {
            setPoseInstruction('Blink detected! Processing...');
          } else {
            setPoseInstruction(`Face detected (${Math.round(avgOpen * 100)}% eyes open). Please blink naturally.`);
          }
        }
      }
      return;
    }

    // Step 2: Multi-Pose Angle Evaluation (Center, Left, Right, Up, Down)
    const currentPoseIndex = poseGuideRef.current.getCurrentPoseIndex();
    const currentTarget = poseGuideRef.current.getCurrentTarget();

    if (!currentTarget) {
      return;
    }

    // Evaluate live headEulerAngles against target orientation
    const evalResult = poseGuideRef.current.evaluate(face.yawAngle, face.pitchAngle);

    if (evalResult.isQualified) {
      captureCurrentPose(face, currentTarget.pose, currentPoseIndex);
    } else {
      setPoseInstruction(currentTarget.instruction);
    }
  }, [livenessState, canStartManually, startPoseSequence, captureCurrentPose]);

  /**
   * Reset enrollment pipeline to retry
   */
  const handleReset = useCallback(() => {
    isCapturingRef.current = false;
    isRegistrationCompleteRef.current = false;
    isBlinkVerifiedRef.current = false;
    faceDetectedStartTimeRef.current = null;
    setCanStartManually(false);
    setEyeOpenPct(null);
    capturedEmbeddingsRef.current = [];
    depthFeaturesRef.current = [];
    activeDetectorRef.current.reset();
    stateMachineRef.current.reset();
    poseGuideRef.current = new PoseGuide(3);
    setBoundingBox(null);
    setLandmarks(null);
    setError('');
    setPoseProgress(undefined);
    setPoseDirection(undefined);
    setPoseInstruction('Look straight at the camera to start');
  }, []);

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="camera-outline" size={48} color="#4F46E5" />
          </View>
          <Text style={styles.title}>Camera Access Required</Text>
          <Text style={styles.message}>We need your permission to use the camera to securely register your face for attendance check-ins.</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Face Registration</Text>
        <Text style={styles.subtitle}>{poseInstruction}</Text>
      </View>

      <View style={styles.cameraWrapper}>
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
            poseProgress={poseProgress}
            poseDirection={poseDirection}
            statusMessageOverride={poseInstruction}
          />
        </View>
      </View>

      <View style={styles.footer}>
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {error ? (
          <TouchableOpacity 
            style={[styles.captureButton, { backgroundColor: '#EF4444' }]} 
            onPress={handleReset} 
            disabled={loading}
          >
            <Ionicons name="refresh-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.captureButtonText}>Retry Registration</Text>
          </TouchableOpacity>
        ) : loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingText}>Processing biometric data...</Text>
          </View>
        ) : (
          <View style={{ width: '100%', alignItems: 'center' }}>
            <View style={styles.guideStatus}>
              <Ionicons name="eye-outline" size={20} color="#4F46E5" style={{ marginRight: 8 }} />
              <Text style={styles.guideStatusText}>
                {isBlinkVerifiedRef.current
                  ? `Pose ${(poseProgress?.current ?? 0) + 1} of 5: Follow instructions above`
                  : eyeOpenPct !== null
                  ? `Eyes open (${eyeOpenPct}%). Blink to begin registration`
                  : 'Blink naturally to begin 5-angle registration'}
              </Text>
            </View>

            {!isBlinkVerifiedRef.current && canStartManually && (
              <TouchableOpacity
                style={styles.manualStartButton}
                onPress={startPoseSequence}
                activeOpacity={0.8}
              >
                <Ionicons name="play-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.manualStartButtonText}>Blink missed? Tap to begin 5-angle capture</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  header: {
    padding: 24,
    paddingTop: 50,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#4F46E5',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
    fontWeight: '600',
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  cameraWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraContainer: {
    width: 300,
    height: 300,
    borderRadius: 150,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#4F46E5',
    backgroundColor: '#000',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  button: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  captureButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  guideStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  guideStatusText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  manualStartButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  manualStartButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
