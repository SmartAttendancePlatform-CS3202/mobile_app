/**
 * Unit Test Suite for Multi-Dimensional Biometric Enrollment Modules
 */

import {
  PoseGuide,
  POSE_SEQUENCE,
  MultiFrameSampler,
  LightingNormalizer,
  DepthEstimator,
} from '../index';

// Pure math implementations matching faceEmbedding.ts for unit verification
function l2Normalize(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSquares += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return new Float32Array(vector.length);
  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = vector[i] / norm;
  }
  return normalized;
}

function computeCentroidEmbedding(embeddings: Float32Array[]): Float32Array {
  if (!embeddings || embeddings.length === 0) {
    throw new Error('[Embedding] Cannot compute centroid of empty embeddings array.');
  }
  const dim = embeddings[0].length;
  const centroid = new Float32Array(dim);
  for (let e = 0; e < embeddings.length; e++) {
    const vec = embeddings[e];
    for (let i = 0; i < dim; i++) {
      centroid[i] += vec[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }
  return l2Normalize(centroid);
}

export function runEnrollmentTests(): { passed: number; failed: number } {
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

  console.log('--- Starting Biometric Enrollment Tests ---');

  // 1. PoseGuide Tests
  {
    const guide = new PoseGuide(3); // Requires 3 stable frames
    assert(guide.getTotalPoses() === 5, 'PoseGuide: Total poses is 5');
    assert(guide.getCurrentTarget()?.pose === 'CENTER', 'PoseGuide: Starts with CENTER pose');

    // CENTER evaluation: out of tolerance
    const resOff = guide.evaluate(30, 0); // Yaw 30 is too far for center
    assert(!resOff.isQualified, 'PoseGuide: Rejects yaw outside tolerance');
    assert(resOff.stableFrameCount === 0, 'PoseGuide: Resets stable frames on tolerance breach');

    // CENTER evaluation: in tolerance (yaw 0, pitch 0)
    guide.evaluate(2, 1);
    guide.evaluate(1, 0);
    const resCenter = guide.evaluate(0, 0);
    assert(resCenter.isQualified, 'PoseGuide: Qualifies CENTER after 3 stable frames');

    guide.advance();
    assert(guide.getCurrentTarget()?.pose === 'LEFT', 'PoseGuide: Advances to LEFT pose');
    assert(guide.getCurrentPoseIndex() === 1, 'PoseGuide: Current index is 1');

    // LEFT evaluation: in tolerance (yaw -25, pitch 0)
    guide.evaluate(-24, 1);
    guide.evaluate(-25, 0);
    const resLeft = guide.evaluate(-26, 0);
    assert(resLeft.isQualified, 'PoseGuide: Qualifies LEFT after 3 stable frames');

    guide.advance(); // -> RIGHT
    guide.advance(); // -> UP
    guide.advance(); // -> DOWN
    guide.advance(); // -> COMPLETE
    assert(guide.isComplete(), 'PoseGuide: Reports complete after 5 poses');
    assert(guide.getCompletedPoses().length === 5, 'PoseGuide: Stored all 5 completed poses');
  }

  // 2. MultiFrameSampler Tests
  {
    const sampler = new MultiFrameSampler({ minSharpness: 50 });

    // Sharp checkerboard-like buffer (high Laplacian variance)
    const sharpBuffer = new Uint8Array(50 * 50);
    for (let i = 0; i < sharpBuffer.length; i++) {
      sharpBuffer[i] = (Math.floor(i / 50) % 2 === i % 2) ? 200 : 50;
    }
    const sharpMetrics = sampler.evaluateGrayscaleBuffer(sharpBuffer, 50, 50);
    assert(sharpMetrics.sharpness > 50, 'MultiFrameSampler: Detects high sharpness on patterned buffer');
    assert(sharpMetrics.isAcceptable, 'MultiFrameSampler: Marks sharp balanced frame acceptable');

    // Blurry buffer (smooth gradient: good contrast, but low second derivative / sharpness)
    const blurryBuffer = new Uint8Array(50 * 50);
    for (let i = 0; i < blurryBuffer.length; i++) {
      blurryBuffer[i] = Math.round(50 + (i / 2500) * 150);
    }
    const blurryMetrics = sampler.evaluateGrayscaleBuffer(blurryBuffer, 50, 50);
    assert(blurryMetrics.sharpness < 50, 'MultiFrameSampler: Detects low sharpness on smooth buffer');
    assert(!blurryMetrics.isAcceptable, 'MultiFrameSampler: Rejects blurry buffer');
    assert(blurryMetrics.rejectionReason?.includes('BLURRY_FRAME') === true, 'MultiFrameSampler: Reports BLURRY_FRAME reason');

    // Extreme lighting: too dark buffer
    const darkBuffer = new Uint8Array(50 * 50).fill(10);
    const darkMetrics = sampler.evaluateGrayscaleBuffer(darkBuffer, 50, 50);
    assert(!darkMetrics.isAcceptable, 'MultiFrameSampler: Rejects too dark buffer');
    assert(darkMetrics.rejectionReason?.includes('TOO_DARK') === true, 'MultiFrameSampler: Reports TOO_DARK reason');

    // Frame selection
    const candidate1 = { data: 'frame1', metrics: blurryMetrics };
    const candidate2 = { data: 'frame2', metrics: sharpMetrics };
    const best = sampler.selectBestFrame([candidate1, candidate2]);
    assert(best?.data === 'frame2', 'MultiFrameSampler: Selects frame with highest overall quality');
  }

  // 3. LightingNormalizer Tests
  {
    // Grayscale luminance extraction
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]); // R, G, B
    const gray = LightingNormalizer.rgbToGrayscale(rgb, 3);
    assert(gray.length === 3, 'LightingNormalizer: Converts 3 RGB pixels to 3 Grayscale bytes');
    assert(gray[0] === Math.round(0.299 * 255), 'LightingNormalizer: Red channel weighted to 0.299');
    assert(gray[1] === Math.round(0.587 * 255), 'LightingNormalizer: Green channel weighted to 0.587');
    assert(gray[2] === Math.round(0.114 * 255), 'LightingNormalizer: Blue channel weighted to 0.114');

    // CLAHE contrast equalization output
    const testFaceGray = new Uint8Array(32 * 32);
    for (let i = 0; i < testFaceGray.length; i++) {
      testFaceGray[i] = (i % 32) * 8; // Linear gradient
    }
    const claheOutput = LightingNormalizer.applyClahe(testFaceGray, 32, 32, 4, 2.5);
    assert(claheOutput.length === testFaceGray.length, 'LightingNormalizer: CLAHE output preserves dimensions');

    // normalizeRgbFace produces 112*112*3 Float32Array in [-1.0, 1.0]
    const dummyFaceRgb = new Uint8Array(112 * 112 * 3).fill(120);
    const normalized = LightingNormalizer.normalizeRgbFace(dummyFaceRgb, 112, 112);
    assert(normalized.length === 112 * 112 * 3, 'LightingNormalizer: Output tensor length is 112*112*3');
    assert(normalized[0] >= -1.0 && normalized[0] <= 1.0, 'LightingNormalizer: Output values in [-1.0, 1.0]');
  }

  // 4. DepthEstimator Tests
  {
    const grayFace = new Uint8Array(112 * 112);
    for (let i = 0; i < grayFace.length; i++) {
      grayFace[i] = Math.round(128 + Math.sin(i * 0.1) * 50);
    }

    const depthVec = DepthEstimator.extractDepthFeatures(grayFace, 112, 112, {
      leftEye: { x: 35, y: 40 },
      rightEye: { x: 77, y: 40 },
      noseBase: { x: 56, y: 65 },
      bottomMouth: { x: 56, y: 88 },
    });

    assert(depthVec.length === 48, 'DepthEstimator: Produces exactly 48-dimensional feature vector');

    // Verify L2 unit norm
    let sumSq = 0;
    for (let i = 0; i < depthVec.length; i++) {
      sumSq += depthVec[i] * depthVec[i];
    }
    assert(Math.abs(Math.sqrt(sumSq) - 1.0) < 0.05, 'DepthEstimator: Feature vector is unit normalized');
  }

  // 5. Centroid Embedding Tests
  {
    const v1 = l2Normalize(new Float32Array(192).fill(1.0));
    const v2 = l2Normalize(new Float32Array(192).fill(0.8));
    const v3 = l2Normalize(new Float32Array(192).fill(1.2));

    const centroid = computeCentroidEmbedding([v1, v2, v3]);
    assert(centroid.length === 192, 'Centroid: Dimension is 192');

    let sumSq = 0;
    for (let i = 0; i < centroid.length; i++) {
      sumSq += centroid[i] * centroid[i];
    }
    assert(Math.abs(Math.sqrt(sumSq) - 1.0) < 1e-4, 'Centroid: Centroid vector is unit normalized');
  }

  console.log(`--- Biometric Enrollment Tests Completed: ${passed} passed, ${failed} failed ---`);
  return { passed, failed };
}
