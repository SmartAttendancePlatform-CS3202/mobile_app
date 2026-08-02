/**
 * Verification Test Suite for Liveness Pipeline Modules
 */

import {
  ActiveLivenessDetector,
  detectBlink,
  FrameEyeData,
} from '../activeLiveness';

import {
  cropFace,
  preprocessFaceImage,
  detectSpecularGlare,
  evaluateEdgeContrast,
  PassiveLivenessEvaluator,
  ImageBuffer,
  BoundingBox,
} from '../passiveLiveness';

import { LivenessStateMachine } from '../livenessStateMachine';

export function runLivenessTests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  console.log('--- Starting Liveness Module Tests ---');

  // Test 1: Active Liveness Blink Detection Sequence
  {
    const detector = new ActiveLivenessDetector({
      bufferSize: 15,
      closedThreshold: 0.30,
      openThreshold: 0.70,
      minWindowMs: 100,
      maxWindowMs: 600,
    });

    const now = Date.now();
    const frame1: FrameEyeData = { timestamp: now, leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 };
    const frame2: FrameEyeData = { timestamp: now + 50, leftEyeOpenProbability: 0.15, rightEyeOpenProbability: 0.20 };
    const frame3: FrameEyeData = { timestamp: now + 250, leftEyeOpenProbability: 0.85, rightEyeOpenProbability: 0.88 };

    const res1 = detector.processFrame(frame1);
    const res2 = detector.processFrame(frame2);
    const res3 = detector.processFrame(frame3);

    assert(!res1.blinkDetected, 'ActiveLiveness: Open eye initial frame does not trigger blink');
    assert(!res2.blinkDetected, 'ActiveLiveness: Closed eye frame does not trigger blink immediately');
    assert(res3.blinkDetected === true, 'ActiveLiveness: Eye opening after closed state triggers blink');
    assert(res3.timestamp === frame3.timestamp, 'ActiveLiveness: Correct timestamp reported');
  }

  // Test 2: Active Liveness Sliding Buffer Cap
  {
    const detector = new ActiveLivenessDetector({ bufferSize: 15 });
    const startTime = Date.now();
    for (let i = 0; i < 25; i++) {
      detector.processFrame({
        timestamp: startTime + i * 30,
        leftEyeOpenProbability: 0.8,
        rightEyeOpenProbability: 0.8,
      });
    }
    const buffer = detector.getBuffer();
    assert(buffer.length === 15, 'ActiveLiveness: Sliding buffer capped at 15 frames');
  }

  // Test 3: Passive Anti-Spoofing Image Preprocessing & Glare Detection
  {
    // Create mock 100x100 RGBA image
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill with normal skin tone
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 180;     // R
      data[i * 4 + 1] = 120; // G
      data[i * 4 + 2] = 100; // B
      data[i * 4 + 3] = 255; // A
    }

    const imgBuffer: ImageBuffer = { data, width, height, channels: 4 };
    const bbox: BoundingBox = { x: 20, y: 20, width: 40, height: 40 };

    // Test cropping
    const cropped = cropFace(imgBuffer, bbox, 1.5);
    assert(cropped.width === 60 && cropped.height === 60, 'PassiveLiveness: 1.5x crop expansion padding');

    // Test tensor preprocessing
    const tensor = preprocessFaceImage(cropped, 80, 80);
    assert(tensor.length === 1 * 80 * 80 * 3, 'PassiveLiveness: Float32 tensor shape 1x80x80x3');
    
    // Check Float32 normalization range [-1.0, 1.0]
    let inRange = true;
    for (let i = 0; i < tensor.length; i++) {
      if (tensor[i] < -1.0 || tensor[i] > 1.0) {
        inRange = false;
        break;
      }
    }
    assert(inRange, 'PassiveLiveness: Tensor normalized to [-1.0, 1.0]');

    // Test glare detection on normal image
    const glare1 = detectSpecularGlare(imgBuffer, 245, 0.03);
    assert(!glare1.glareDetected, 'PassiveLiveness: Glare not detected on normal image');

    // Introduce specular glare (> 245)
    for (let i = 0; i < 500; i++) {
      data[i * 4] = 250;
      data[i * 4 + 1] = 252;
      data[i * 4 + 2] = 255;
    }
    const glare2 = detectSpecularGlare(imgBuffer, 245, 0.03);
    assert(glare2.glareDetected === true, 'PassiveLiveness: Specular glare detected when > 245 pixels exceed threshold');

    // Test edge contrast calculation
    const edgeScore = evaluateEdgeContrast(imgBuffer);
    assert(edgeScore >= 0, 'PassiveLiveness: Edge contrast calculation computes numeric score');
  }

  // Test 4: Liveness State Machine Transitions
  {
    const sm = new LivenessStateMachine({ timeoutMs: 5000 });
    let lastEventState: string | null = null;
    sm.onStateChange((e) => {
      lastEventState = e.to;
    });

    assert(sm.getState() === 'IDLE', 'StateMachine: Initial state IDLE');

    const step1 = sm.handleFaceDetected();
    assert(step1 && sm.getState() === 'FACE_DETECTED', 'StateMachine: IDLE -> FACE_DETECTED');
    assert(lastEventState === 'FACE_DETECTED', 'StateMachine: Listener notified on transition');

    const step2 = sm.handleBlinkVerified();
    assert(step2 && sm.getState() === 'BLINK_VERIFIED', 'StateMachine: FACE_DETECTED -> BLINK_VERIFIED');

    const step3 = sm.handlePassiveLivenessPassed();
    assert(step3 && sm.getState() === 'PASSIVE_LIVENESS_PASSED', 'StateMachine: BLINK_VERIFIED -> PASSIVE_LIVENESS_PASSED');

    const step4 = sm.handleEmbeddingReady();
    assert(step4 && sm.getState() === 'EMBEDDING_READY', 'StateMachine: PASSIVE_LIVENESS_PASSED -> EMBEDDING_READY');

    const status = sm.getStatus();
    assert(status.isComplete === true, 'StateMachine: Status reports isComplete = true');

    // Test invalid transition attempt from EMBEDDING_READY to BLINK_VERIFIED
    const invalid = sm.transitionTo('BLINK_VERIFIED');
    assert(!invalid, 'StateMachine: Invalid transition rejected');
  }

  console.log(`--- Liveness Tests Summary: ${passed} Passed, ${failed} Failed ---`);
  return { passed, failed };
}
