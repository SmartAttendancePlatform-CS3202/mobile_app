export interface FaceVerificationPayload {
  faceEmbedding: number[];
  timestamp: number;
}

export interface FaceVerificationResponse {
  success: boolean;
  statusCode: number;
  message: string;
  vectorLength: number;
}

/**
 * Converts a Float32Array embedding vector into a standard JSON-serializable array of numbers using Array.from().
 */
export function convertEmbeddingToJsonArray(embedding: Float32Array): number[] {
  return Array.from(embedding);
}

/**
 * Creates the face verification request payload object.
 */
export function createFaceVerificationPayload(
  embedding: Float32Array,
  timestamp: number = Date.now()
): FaceVerificationPayload {
  return {
    faceEmbedding: Array.from(embedding),
    timestamp,
  };
}

/**
 * Serializes the embedding payload into a standard JSON string.
 */
export function serializeEmbeddingPayload(
  embedding: Float32Array,
  timestamp: number = Date.now()
): string {
  const payload = createFaceVerificationPayload(embedding, timestamp);
  return JSON.stringify(payload);
}

/**
 * Transmits face verification embedding payload via mock HTTPS POST.
 * Uses Content-Type: application/json header and JSON body formatted with Array.from(embedding).
 */
export async function sendFaceVerificationRequest(
  embedding: Float32Array
): Promise<FaceVerificationResponse> {
  const timestamp = Date.now();
  const jsonArray = Array.from(embedding);
  const payload: FaceVerificationPayload = {
    faceEmbedding: jsonArray,
    timestamp,
  };

  const headers = {
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify(payload);

  console.log('[API] Transmitting mock HTTPS POST request:');
  console.log('[API] Headers:', headers);
  console.log('[API] Body size (bytes):', body.length);
  console.log('[API] Payload vector length:', jsonArray.length);

  // Simulate HTTPS network roundtrip delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  return {
    success: true,
    statusCode: 200,
    message: 'Face verification payload transmitted successfully',
    vectorLength: jsonArray.length,
  };
}
