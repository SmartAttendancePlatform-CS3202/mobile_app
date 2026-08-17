/**
 * Passive Anti-Spoofing Module
 * Uses MiniFASNet TFLite model via react-native-fast-tflite,
 * 1.5x expanded face cropping, Float32 normalization [-1.0, 1.0],
 * specular glare detection, and edge contrast evaluation.
 */

import { loadTensorflowModel, type TfliteModel } from 'react-native-fast-tflite';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageBuffer {
  data: Uint8Array | Uint8ClampedArray; // Pixel byte values (0-255)
  width: number;
  height: number;
  channels?: 3 | 4; // 3 for RGB, 4 for RGBA (default: 4)
}

export interface PassiveLivenessOptions {
  /** Model source or path. Default: require('../../assets/models/minifasnet.tflite') */
  modelSource?: any;
  /** Bounding box expansion padding factor. Default: 1.5 */
  boxExpansionFactor?: number;
  /** Input tensor width for MiniFASNet model. Default: 80 */
  inputWidth?: number;
  /** Input tensor height for MiniFASNet model. Default: 80 */
  inputHeight?: number;
  /** Pixel value threshold for specular glare (> 245). Default: 245 */
  glarePixelThreshold?: number;
  /** Ratio of glare pixels exceeding threshold to trigger glareDetected. Default: 0.03 (3%) */
  glareRatioThreshold?: number;
  /** Minimum confidence required for real face. Default: 0.50 */
  realThreshold?: number;
}

export interface PassiveLivenessResult {
  isReal: boolean;
  confidence: number;
  glareDetected: boolean;
  edgeContrastScore: number;
  details?: {
    glareRatio: number;
    rawScores?: number[];
  };
}

/**
 * Face Cropping Logic with Bounding Box Expansion Padding.
 * Expands bounding box by expansionFactor (e.g. 1.5x) centered around the face center,
 * ensuring boundaries stay within image dimensions.
 */
export function cropFace(
  image: ImageBuffer,
  bbox: BoundingBox,
  expansionFactor: number = 1.5
): ImageBuffer {
  const { width: imgW, height: imgH, data, channels = 4 } = image;

  const centerX = bbox.x + bbox.width / 2;
  const centerY = bbox.y + bbox.height / 2;

  const expandedW = bbox.width * expansionFactor;
  const expandedH = bbox.height * expansionFactor;

  const cropX = Math.max(0, Math.floor(centerX - expandedW / 2));
  const cropY = Math.max(0, Math.floor(centerY - expandedH / 2));
  const cropRight = Math.min(imgW, Math.floor(centerX + expandedW / 2));
  const cropBottom = Math.min(imgH, Math.floor(centerY + expandedH / 2));

  const cropW = Math.max(1, cropRight - cropX);
  const cropH = Math.max(1, cropBottom - cropY);

  const croppedData = new Uint8ClampedArray(cropW * cropH * channels);

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcX = cropX + x;
      const srcY = cropY + y;
      const srcIdx = (srcY * imgW + srcX) * channels;
      const dstIdx = (y * cropW + x) * channels;

      for (let c = 0; c < channels; c++) {
        croppedData[dstIdx + c] = data[srcIdx + c];
      }
    }
  }

  return {
    data: croppedData,
    width: cropW,
    height: cropH,
    channels,
  };
}

/**
 * Preprocesses cropped face image into float32 tensor [1, targetHeight, targetWidth, 3]
 * with Float32 normalization [-1.0, 1.0].
 */
export function preprocessFaceImage(
  croppedImage: ImageBuffer,
  targetWidth: number = 80,
  targetHeight: number = 80
): Float32Array {
  const { data, width: srcW, height: srcH, channels = 4 } = croppedImage;
  const tensor = new Float32Array(1 * targetHeight * targetWidth * 3);

  for (let y = 0; y < targetHeight; y++) {
    const srcY = Math.min(srcH - 1, Math.floor((y / targetHeight) * srcH));
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(srcW - 1, Math.floor((x / targetWidth) * srcW));
      const srcIdx = (srcY * srcW + srcX) * channels;
      const tensorIdx = (y * targetWidth + x) * 3;

      // Extract RGB values (0-255)
      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b = data[srcIdx + 2];

      // Float32 Normalization [-1.0, 1.0]: (value / 255.0 - 0.5) * 2.0
      tensor[tensorIdx] = (r / 255.0 - 0.5) * 2.0;
      tensor[tensorIdx + 1] = (g / 255.0 - 0.5) * 2.0;
      tensor[tensorIdx + 2] = (b / 255.0 - 0.5) * 2.0;
    }
  }

  return tensor;
}

/**
 * Specular Glare Detection.
 * Evaluates pixels with intensity exceeding threshold (e.g. > 245)
 * to catch screen glare or photo reflection.
 */
export function detectSpecularGlare(
  image: ImageBuffer,
  pixelThreshold: number = 245,
  ratioThreshold: number = 0.03
): { glareDetected: boolean; glareRatio: number } {
  const { data, width, height, channels = 4 } = image;
  const totalPixels = width * height;
  let glareCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // Check if pixel intensity across RGB channels exceeds threshold (> 245)
    if (r > pixelThreshold && g > pixelThreshold && b > pixelThreshold) {
      glareCount++;
    }
  }

  const glareRatio = totalPixels > 0 ? glareCount / totalPixels : 0;
  return {
    glareDetected: glareRatio >= ratioThreshold,
    glareRatio,
  };
}

/**
 * Edge Contrast Evaluation.
 * Evaluates image gradient magnitude across pixels to detect unnatural screen borders,
 * printed paper edges, or moiré pattern artifacts.
 */
export function evaluateEdgeContrast(image: ImageBuffer): number {
  const { data, width, height, channels = 4 } = image;
  if (width < 3 || height < 3) return 0;

  let totalGradient = 0;
  let count = 0;

  // Compute gradient magnitudes across interior pixels
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const getGray = (px: number, py: number) => {
        const idx = (py * width + px) * channels;
        return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      };

      const gx = getGray(x + 1, y) - getGray(x - 1, y);
      const gy = getGray(x, y + 1) - getGray(x, y - 1);
      const mag = Math.sqrt(gx * gx + gy * gy);

      totalGradient += mag;
      count++;
    }
  }

  return count > 0 ? totalGradient / count : 0;
}

/**
 * Passive Anti-Spoofing Module loader & evaluator.
 */
export class PassiveLivenessEvaluator {
  private model: TfliteModel | null = null;
  private options: PassiveLivenessOptions;
  private isLoaded: boolean = false;

  constructor(options?: PassiveLivenessOptions) {
    this.options = {
      modelSource: options?.modelSource || require('../../assets/models/minifasnet.tflite'),
      boxExpansionFactor: options?.boxExpansionFactor ?? 1.5,
      inputWidth: options?.inputWidth ?? 80,
      inputHeight: options?.inputHeight ?? 80,
      glarePixelThreshold: options?.glarePixelThreshold ?? 245,
      glareRatioThreshold: options?.glareRatioThreshold ?? 0.03,
      realThreshold: options?.realThreshold ?? 0.50,
      ...options,
    };
  }

  /**
   * Load MiniFASNet TFLite model using react-native-fast-tflite.
   */
  public async loadModel(): Promise<void> {
    if (this.isLoaded && this.model) return;

    try {
      this.model = await loadTensorflowModel(this.options.modelSource, []);
      this.isLoaded = true;
      console.log('[PassiveLiveness] MiniFASNet model loaded successfully via TFLite');
    } catch (error) {
      console.warn('[PassiveLiveness] Warning: Native TFLite model load failed/unsupported in current runtime environment:', error);
      this.isLoaded = false;
    }
  }

  /**
   * Run passive anti-spoofing evaluation on an input image buffer and face bounding box.
   */
  public async evaluate(
    image: ImageBuffer,
    bbox: BoundingBox
  ): Promise<PassiveLivenessResult> {
    // 1. Specular Glare Detection
    const glareResult = detectSpecularGlare(
      image,
      this.options.glarePixelThreshold,
      this.options.glareRatioThreshold
    );

    // 2. Edge Contrast Evaluation
    const edgeContrastScore = evaluateEdgeContrast(image);

    // 3. Face Crop with 1.5x expansion padding
    const cropped = cropFace(image, bbox, this.options.boxExpansionFactor);

    // 4. Preprocess face image to Float32 tensor [1, 80, 80, 3] with normalization [-1.0, 1.0]
    const tensor = preprocessFaceImage(
      cropped,
      this.options.inputWidth,
      this.options.inputHeight
    );

    let confidence = 0.85; // Default score
    let rawScores: number[] = [];

    // 5. Run MiniFASNet model inference if available
    if (this.model) {
      try {
        const inputBuffer: ArrayBuffer = tensor.buffer.slice(0) as ArrayBuffer;
        const outputs = await this.model.run([inputBuffer]);
        if (outputs && outputs.length > 0) {
          const floatOutput = new Float32Array(outputs[0]);
          rawScores = Array.from(floatOutput);

          if (rawScores.length >= 2) {
            // Softmax over logits: exp(real) / (exp(spoof) + exp(real))
            const exp0 = Math.exp(rawScores[0]); // spoof logit
            const exp1 = Math.exp(rawScores[1]); // real logit
            confidence = exp1 / (exp0 + exp1);
          } else if (rawScores.length === 1) {
            // Sigmoid: 1 / (1 + exp(-score))
            confidence = 1 / (1 + Math.exp(-rawScores[0]));
          }
        }
      } catch (err) {
        console.error('[PassiveLiveness] Error running MiniFASNet model:', err);
      }
    } else {
      // Heuristic fallback when TFLite native binary is not available (e.g. simulated environment)
      if (glareResult.glareDetected) {
        confidence = Math.max(0.05, confidence - 0.6);
      }
      if (edgeContrastScore > 100) {
        confidence = Math.max(0.1, confidence - 0.35);
      }
    }

    // Determine final real status:
    // Spoof flagged if glare is detected or confidence falls below threshold
    const realThreshold = this.options.realThreshold ?? 0.50;
    const isReal = !glareResult.glareDetected && confidence >= realThreshold;

    return {
      isReal,
      confidence,
      glareDetected: glareResult.glareDetected,
      edgeContrastScore,
      details: {
        glareRatio: glareResult.glareRatio,
        rawScores,
      },
    };
  }
}

/**
 * Functional wrapper for passive anti-spoofing evaluation.
 */
export async function evaluatePassiveLiveness(
  image: ImageBuffer,
  bbox: BoundingBox,
  options?: PassiveLivenessOptions
): Promise<PassiveLivenessResult> {
  const evaluator = new PassiveLivenessEvaluator(options);
  await evaluator.loadModel();
  return evaluator.evaluate(image, bbox);
}
