import { loadTensorflowModel, TfliteModel } from 'react-native-fast-tflite';
import { Asset } from 'expo-asset';

export interface ImageBuffer {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels?: number;
}

export type ImageInput = ImageBuffer | Uint8Array | Uint8ClampedArray | Float32Array;

let modelInstance: TfliteModel | null = null;

/**
 * Loads the FaceNet 512D TFLite model using react-native-fast-tflite.
 * Resolves local file URI using expo-asset to ensure reliable Android APK loading.
 */
export async function loadFaceModel(): Promise<TfliteModel> {
  if (modelInstance) {
    return modelInstance;
  }

  try {
    const modelModule = require('../../assets/models/facenet_512.tflite');
    let modelSource: any = modelModule;

    try {
      const assets = await Asset.loadAsync(modelModule);
      if (assets && assets[0]) {
        const resolvedUri = assets[0].localUri || assets[0].uri;
        if (resolvedUri) {
          modelSource = { url: resolvedUri };
          console.log('[Embedding] Resolved FaceNet 512D asset URI:', resolvedUri);
        }
      }
    } catch (assetErr) {
      console.warn('[Embedding] expo-asset resolution fallback note:', assetErr);
    }

    modelInstance = await loadTensorflowModel(modelSource, []);
    console.log('[Embedding] FaceNet 512D TFLite model loaded successfully via native engine.');
    return modelInstance;
  } catch (error: any) {
    console.error('[Embedding] Native FaceNet 512D TFLite model load FAILED:', {
      message: error?.message,
      stack: error?.stack,
      nativeError: error,
    });

    throw new Error(
      `Face recognition neural network could not be loaded on this device: ${error?.message || 'Native TFLite initialization failure'}`
    );
  }
}

/**
 * Backwards-compatible alias for existing callers
 */
export const loadMobileFaceNetModel = loadFaceModel;

/**
 * Output embedding dimensionality (512D)
 */
export const EMBEDDING_DIM = 512;

/**
 * Native model input spatial resolution (160x160 for FaceNet)
 */
export const MODEL_INPUT_SIZE = 160;

/**
 * Normalizes a single pixel value to Float32 range [-1.0, 1.0] using (pixel - 127.5) / 128.0
 */
export function normalizePixel(pixel: number): number {
  return (pixel - 127.5) / 128.0;
}

/**
 * Preprocesses and resizes/aligns face image to target tensor shape [1, targetSize, targetSize, 3]
 * with Float32 normalization (pixel - 127.5) / 128.0. Defaults to 160x160 (76,800 floats).
 */
export function preprocessFaceToTensor(input: ImageInput, targetSize: number = MODEL_INPUT_SIZE): Float32Array {
  const CHANNELS = 3;
  const TOTAL_FLOATS = 1 * targetSize * targetSize * CHANNELS;
  const tensor = new Float32Array(TOTAL_FLOATS);

  if (input instanceof Float32Array) {
    if (input.length === TOTAL_FLOATS) {
      // If already correct length, verify whether it needs normalization or is pre-normalized
      let isRawPixel = false;
      for (let i = 0; i < Math.min(input.length, 20); i++) {
        if (input[i] > 1.0 || input[i] < -1.0) {
          isRawPixel = true;
          break;
        }
      }
      if (isRawPixel) {
        for (let i = 0; i < TOTAL_FLOATS; i++) {
          tensor[i] = normalizePixel(input[i]);
        }
      } else {
        tensor.set(input);
      }
      return tensor;
    }
  }

  let data: Uint8Array | Uint8ClampedArray | Float32Array;
  let srcWidth = targetSize;
  let srcHeight = targetSize;
  let srcChannels = CHANNELS;

  if ('data' in input && typeof input.width === 'number' && typeof input.height === 'number') {
    data = input.data;
    srcWidth = input.width;
    srcHeight = input.height;
    srcChannels = input.channels || 4;
  } else {
    data = input as Uint8Array | Uint8ClampedArray | Float32Array;
    if (data.length === targetSize * targetSize * 4) {
      srcChannels = 4;
    } else if (data.length === targetSize * targetSize * 3) {
      srcChannels = 3;
    } else if (data.length === 112 * 112 * 4) {
      srcWidth = 112;
      srcHeight = 112;
      srcChannels = 4;
    } else if (data.length === 112 * 112 * 3) {
      srcWidth = 112;
      srcHeight = 112;
      srcChannels = 3;
    }
  }

  // Nearest-neighbor / bilinear interpolation mapping to Float32 RGB tensor
  for (let y = 0; y < targetSize; y++) {
    const srcY = Math.floor((y / targetSize) * srcHeight);
    for (let x = 0; x < targetSize; x++) {
      const srcX = Math.floor((x / targetSize) * srcWidth);
      const srcIndex = (srcY * srcWidth + srcX) * srcChannels;
      const targetIndex = (y * targetSize + x) * CHANNELS;

      const r = data[srcIndex] ?? 0;
      const g = data[srcIndex + 1] ?? 0;
      const b = data[srcIndex + 2] ?? 0;

      tensor[targetIndex] = normalizePixel(r);
      tensor[targetIndex + 1] = normalizePixel(g);
      tensor[targetIndex + 2] = normalizePixel(b);
    }
  }

  return tensor;
}

/**
 * Backwards-compatible alias for 112x112 preprocessor
 */
export function preprocessFaceTo112x112(input: ImageInput): Float32Array {
  return preprocessFaceToTensor(input, 112);
}

/**
 * Calculates L2 unit normalization for a vector: v / sqrt(sum(v_i^2))
 */
export function l2Normalize(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSquares += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) {
    return new Float32Array(vector.length);
  }
  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = vector[i] / norm;
  }
  return normalized;
}

/**
 * Runs FaceNet inference asynchronously off the UI thread and returns 512D L2-normalized Float32Array.
 */
export async function generateFaceEmbedding(imageInput: ImageInput): Promise<Float32Array> {
  const model = await loadFaceModel();

  // 1. Face alignment / resize to 160x160 shape [1, 160, 160, 3] with Float32 normalization (pixel - 127.5) / 128.0
  const inputTensor = preprocessFaceToTensor(imageInput, MODEL_INPUT_SIZE);

  // 2. Run TFLite inference asynchronously off the UI thread
  const outputBuffers = await model.run([inputTensor.buffer as ArrayBuffer]);

  if (!outputBuffers || outputBuffers.length === 0) {
    throw new Error('[Embedding] Model inference returned no output buffers.');
  }

  const outputType = (model as any).outputs?.[0]?.dataType;
  let rawEmbedding: Float32Array;

  if (outputType === 'uint8' || outputType === 'int8') {
    const scale = (model as any).outputs[0].quantizationParams?.scale || 1.0;
    const zeroPoint = (model as any).outputs[0].quantizationParams?.zeroPoint || 0;
    const quantizedBuffer = outputType === 'uint8' 
        ? new Uint8Array(outputBuffers[0]) 
        : new Int8Array(outputBuffers[0]);
    
    rawEmbedding = new Float32Array(quantizedBuffer.length);
    for (let i = 0; i < quantizedBuffer.length; i++) {
      rawEmbedding[i] = (quantizedBuffer[i] - zeroPoint) * scale;
    }
  } else {
    rawEmbedding = new Float32Array(outputBuffers[0]);
  }

  // Ensure output vector length matches EMBEDDING_DIM (512)
  let vector: Float32Array;
  if (rawEmbedding.length === EMBEDDING_DIM) {
    vector = rawEmbedding;
  } else {
    vector = new Float32Array(EMBEDDING_DIM);
    vector.set(rawEmbedding.subarray(0, EMBEDDING_DIM));
  }

  // 3. Apply L2 unit normalization (v / sqrt(sum(v_i^2)))
  const normalizedVector = l2Normalize(vector);

  return normalizedVector;
}

/**
 * Computes the L2-normalized centroid embedding from multiple pose embeddings.
 */
export function computeCentroidEmbedding(embeddings: Float32Array[]): Float32Array {
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

/**
 * Generates embeddings for all guided poses and calculates their centroid.
 */
export async function generateMultiPoseEmbeddings(
  poseFrames: ImageInput[]
): Promise<{
  centroid: Float32Array;
  poseEmbeddings: Float32Array[];
}> {
  if (!poseFrames || poseFrames.length === 0) {
    throw new Error('[Embedding] poseFrames cannot be empty.');
  }

  const poseEmbeddings: Float32Array[] = [];

  for (let i = 0; i < poseFrames.length; i++) {
    const embedding = await generateFaceEmbedding(poseFrames[i]);
    poseEmbeddings.push(embedding);
  }

  const centroid = computeCentroidEmbedding(poseEmbeddings);

  return {
    centroid,
    poseEmbeddings,
  };
}

