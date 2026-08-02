import {
  preprocessFaceTo112x112,
  l2Normalize,
  normalizePixel,
  generateFaceEmbedding,
  ImageBuffer,
} from '../faceEmbedding';

import {
  convertEmbeddingToJsonArray,
  createFaceVerificationPayload,
  serializeEmbeddingPayload,
  sendFaceVerificationRequest,
} from '../embeddingApi';

export function runEmbeddingTests(): { passed: number; failed: number } {
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

  console.log('--- Starting 192D Face Embedding & API Module Tests ---');

  // Test 1: 112x112 Face Input Normalization (pixel - 127.5) / 128.0
  {
    // Test direct pixel normalization values
    assert(Math.abs(normalizePixel(0) - (-127.5 / 128.0)) < 1e-6, 'Normalization: Pixel 0 maps to -0.99609375');
    assert(Math.abs(normalizePixel(255) - (127.5 / 128.0)) < 1e-6, 'Normalization: Pixel 255 maps to 0.99609375');
    assert(Math.abs(normalizePixel(127.5) - 0.0) < 1e-6, 'Normalization: Midpoint pixel 127.5 maps to 0.0');

    // Create 112x112 RGBA image buffer (112 * 112 * 4 bytes)
    const width = 112;
    const height = 112;
    const data = new Uint8Array(width * height * 4);

    // Fill with sample pixel pattern
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 255;   // R
      data[i * 4 + 1] = 0; // G
      data[i * 4 + 2] = 128; // B
      data[i * 4 + 3] = 255; // A
    }

    const imgBuffer: ImageBuffer = { data, width, height, channels: 4 };
    const tensor = preprocessFaceTo112x112(imgBuffer);

    assert(tensor instanceof Float32Array, 'Normalization: Preprocessed output is Float32Array');
    assert(tensor.length === 1 * 112 * 112 * 3, 'Normalization: Output tensor shape is [1, 112, 112, 3] (37632 elements)');

    // Verify first pixel R, G, B normalized values
    const normR = tensor[0];
    const normG = tensor[1];
    const normB = tensor[2];

    assert(Math.abs(normR - (255 - 127.5) / 128.0) < 1e-4, 'Normalization: Red channel (255) correctly normalized');
    assert(Math.abs(normG - (0 - 127.5) / 128.0) < 1e-4, 'Normalization: Green channel (0) correctly normalized');
    assert(Math.abs(normB - (128 - 127.5) / 128.0) < 1e-4, 'Normalization: Blue channel (128) correctly normalized');

    // Verify all tensor values remain strictly in [-1.0, 1.0]
    let allInRange = true;
    for (let i = 0; i < tensor.length; i++) {
      if (tensor[i] < -1.0 || tensor[i] > 1.0) {
        allInRange = false;
        break;
      }
    }
    assert(allInRange, 'Normalization: All tensor elements are bounded within [-1.0, 1.0]');
  }

  // Test 2: L2 Vector Unit Length Normalization (norm == 1.0)
  {
    const rawVector = new Float32Array(192);
    for (let i = 0; i < 192; i++) {
      rawVector[i] = (i + 1) * 0.5; // Arbitrary non-unit values
    }

    const normalized = l2Normalize(rawVector);

    assert(normalized.length === 192, 'L2 Normalization: Output vector maintains 192D length');

    let sumSquares = 0;
    for (let i = 0; i < normalized.length; i++) {
      sumSquares += normalized[i] * normalized[i];
    }
    const magnitude = Math.sqrt(sumSquares);

    assert(Math.abs(magnitude - 1.0) < 1e-5, `L2 Normalization: Vector magnitude is unit length (norm == 1.0, actual = ${magnitude.toFixed(6)})`);

    // Edge case: zero vector
    const zeroVector = new Float32Array(192);
    const normalizedZero = l2Normalize(zeroVector);
    assert(normalizedZero.length === 192 && !isNaN(normalizedZero[0]), 'L2 Normalization: Zero vector handled safely without NaN');
  }

  // Test 3: Array.from() JSON Array Formatting
  {
    const testEmbedding = new Float32Array(192);
    for (let i = 0; i < 192; i++) {
      testEmbedding[i] = (i - 96) / 100;
    }

    const jsonArray = convertEmbeddingToJsonArray(testEmbedding);
    assert(Array.isArray(jsonArray), 'JSON Formatting: convertEmbeddingToJsonArray returns standard JS Array');
    assert(jsonArray.length === 192, 'JSON Formatting: Array length matches 192D embedding');
    assert(typeof jsonArray[0] === 'number', 'JSON Formatting: Array elements are primitive numbers');

    const payload = createFaceVerificationPayload(testEmbedding, 1600000000000);
    assert(Array.isArray(payload.faceEmbedding), 'JSON Formatting: Payload faceEmbedding field is JS Array');
    assert(payload.timestamp === 1600000000000, 'JSON Formatting: Payload timestamp preserved');

    const jsonString = serializeEmbeddingPayload(testEmbedding, 1600000000000);
    assert(jsonString.startsWith('{"faceEmbedding":['), 'JSON Formatting: Serialized JSON starts with array notation [');
    
    const parsed = JSON.parse(jsonString);
    assert(Array.isArray(parsed.faceEmbedding), 'JSON Formatting: JSON.parse reconstructs valid JS array');
    assert(parsed.faceEmbedding.length === 192, 'JSON Formatting: Parsed array has exact length 192');
    assert(Math.abs(parsed.faceEmbedding[0] - testEmbedding[0]) < 1e-5, 'JSON Formatting: Values match original Float32Array');
  }

  // Test 4: HTTPS POST Serialization & Mock Response
  {
    const testEmbedding = new Float32Array(192);
    for (let i = 0; i < 192; i++) {
      testEmbedding[i] = Math.sin(i);
    }
    const unitEmbedding = l2Normalize(testEmbedding);

    // Run async POST request
    sendFaceVerificationRequest(unitEmbedding).then((response) => {
      assert(response.success === true, 'HTTPS POST: Response success flag is true');
      assert(response.statusCode === 200, 'HTTPS POST: Response statusCode is 200');
      assert(response.message === 'Face verification payload transmitted successfully', 'HTTPS POST: Expected response message received');
      assert(response.vectorLength === 192, 'HTTPS POST: Response reports vectorLength 192');
    });
  }

  // Test 5: End-to-End Async Embedding Generation
  {
    const dummyImage = new Uint8Array(112 * 112 * 4);
    for (let i = 0; i < dummyImage.length; i++) {
      dummyImage[i] = (i * 7) % 256;
    }

    generateFaceEmbedding({ data: dummyImage, width: 112, height: 112, channels: 4 }).then((vector) => {
      assert(vector instanceof Float32Array, 'E2E Generator: Returns Float32Array vector');
      assert(vector.length === 192, 'E2E Generator: Output vector dimension is 192');

      let sumSq = 0;
      for (let i = 0; i < vector.length; i++) {
        sumSq += vector[i] * vector[i];
      }
      const norm = Math.sqrt(sumSq);
      assert(Math.abs(norm - 1.0) < 1e-5, 'E2E Generator: Output vector is L2 normalized to unit length 1.0');
    });
  }

  console.log(`--- 192D Embedding Tests Summary: ${passed} Passed, ${failed} Failed ---`);
  return { passed, failed };
}
