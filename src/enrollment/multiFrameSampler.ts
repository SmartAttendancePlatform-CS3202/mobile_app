/**
 * Multi-Frame Burst Sampler
 * Evaluates frame sharpness (Laplacian variance) and illumination balance,
 * selecting the optimal frame from a burst capture for biometric embedding.
 */

export interface FrameQualityMetrics {
  sharpness: number;        // Laplacian variance (higher = sharper, >80 recommended)
  meanBrightness: number;   // 0 - 255 (ideal ~100-160)
  contrast: number;         // Standard deviation of luminance (>25 recommended)
  overallQuality: number;   // 0.0 - 1.0 composite score
  isAcceptable: boolean;
  rejectionReason?: string;
}

export interface CandidateFrame<T = any> {
  data: T;
  metrics: FrameQualityMetrics;
}

export class MultiFrameSampler {
  private readonly minSharpness: number;
  private readonly minBrightness: number;
  private readonly maxBrightness: number;
  private readonly minContrast: number;

  constructor(options?: {
    minSharpness?: number;
    minBrightness?: number;
    maxBrightness?: number;
    minContrast?: number;
  }) {
    this.minSharpness = options?.minSharpness ?? 60;
    this.minBrightness = options?.minBrightness ?? 35;
    this.maxBrightness = options?.maxBrightness ?? 235;
    this.minContrast = options?.minContrast ?? 20;
  }

  /**
   * Computes quality metrics for a grayscale pixel buffer (or luminance buffer).
   */
  public evaluateGrayscaleBuffer(
    pixels: Uint8Array | number[],
    width: number,
    height: number
  ): FrameQualityMetrics {
    const totalPixels = width * height;
    if (totalPixels === 0 || pixels.length < totalPixels) {
      return {
        sharpness: 0,
        meanBrightness: 0,
        contrast: 0,
        overallQuality: 0,
        isAcceptable: false,
        rejectionReason: 'INVALID_BUFFER_DIMENSIONS',
      };
    }

    // 1. Mean Brightness & Variance (Contrast)
    let sum = 0;
    for (let i = 0; i < totalPixels; i++) {
      sum += pixels[i];
    }
    const meanBrightness = sum / totalPixels;

    let varSum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const diff = pixels[i] - meanBrightness;
      varSum += diff * diff;
    }
    const contrast = Math.sqrt(varSum / totalPixels);

    // 2. Sharpness via discrete Laplacian kernel approximation [0, 1, 0; 1, -4, 1; 0, 1, 0]
    let laplacianSum = 0;
    let laplacianSqSum = 0;
    let laplacianCount = 0;

    // Sub-sample by stride 2 for larger images, stride 1 for compact buffers
    const stride = width <= 100 ? 1 : 2;
    for (let y = 1; y < height - 1; y += stride) {
      const rowOffset = y * width;
      const prevRow = (y - 1) * width;
      const nextRow = (y + 1) * width;

      for (let x = 1; x < width - 1; x += stride) {
        const center = pixels[rowOffset + x];
        const lap =
          pixels[prevRow + x] +
          pixels[nextRow + x] +
          pixels[rowOffset + x - 1] +
          pixels[rowOffset + x + 1] -
          4 * center;

        laplacianSum += lap;
        laplacianSqSum += lap * lap;
        laplacianCount++;
      }
    }

    const lapMean = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
    const sharpness =
      laplacianCount > 0
        ? Math.max(0, laplacianSqSum / laplacianCount - lapMean * lapMean)
        : 0;

    // 3. Acceptance & Scoring (Illumination first, then sharpness)
    let isAcceptable = true;
    let rejectionReason: string | undefined = undefined;

    if (meanBrightness < this.minBrightness) {
      isAcceptable = false;
      rejectionReason = `TOO_DARK: brightness ${Math.round(meanBrightness)} < ${this.minBrightness}`;
    } else if (meanBrightness > this.maxBrightness) {
      isAcceptable = false;
      rejectionReason = `TOO_BRIGHT: brightness ${Math.round(meanBrightness)} > ${this.maxBrightness}`;
    } else if (contrast < this.minContrast) {
      isAcceptable = false;
      rejectionReason = `LOW_CONTRAST: contrast ${Math.round(contrast)} < ${this.minContrast}`;
    } else if (sharpness < this.minSharpness) {
      isAcceptable = false;
      rejectionReason = `BLURRY_FRAME: sharpness ${Math.round(sharpness)} < ${this.minSharpness}`;
    }

    // Composite quality score [0.0 - 1.0]
    const normSharpness = Math.min(1.0, sharpness / 300);
    const normContrast = Math.min(1.0, contrast / 70);
    const brightnessDist = Math.abs(meanBrightness - 128) / 128; // 0 is ideal
    const normBrightness = Math.max(0, 1.0 - brightnessDist);

    const overallQuality =
      0.5 * normSharpness + 0.3 * normContrast + 0.2 * normBrightness;

    return {
      sharpness: Math.round(sharpness * 100) / 100,
      meanBrightness: Math.round(meanBrightness * 100) / 100,
      contrast: Math.round(contrast * 100) / 100,
      overallQuality: Math.round(overallQuality * 1000) / 1000,
      isAcceptable,
      rejectionReason,
    };
  }

  /**
   * Selects the best frame from a candidate burst.
   */
  public selectBestFrame<T>(candidates: CandidateFrame<T>[]): CandidateFrame<T> | null {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    const acceptable = candidates.filter((c) => c.metrics.isAcceptable);
    const pool = acceptable.length > 0 ? acceptable : candidates;

    return pool.reduce((best, curr) =>
      curr.metrics.overallQuality > best.metrics.overallQuality ? curr : best
    );
  }
}
