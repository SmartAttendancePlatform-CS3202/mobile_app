/**
 * Lighting Invariance Preprocessing Module
 * Software approximation of IR spectral reflectance invariance.
 * Strips ambient color dependency, equalizes harsh shadows/highlights via CLAHE-style
 * tile equalization, and standardizes luminance distributions.
 */

export class LightingNormalizer {
  /**
   * Converts interleaved RGB (or RGBA) buffer to grayscale luminance buffer.
   * ITU-R BT.601 formula: Y = 0.299*R + 0.587*G + 0.114*B
   */
  public static rgbToGrayscale(
    buffer: Uint8Array | number[],
    channels: 3 | 4 = 3
  ): Uint8Array {
    const pixelCount = Math.floor(buffer.length / channels);
    const gray = new Uint8Array(pixelCount);

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * channels;
      const r = buffer[idx];
      const g = buffer[idx + 1];
      const b = buffer[idx + 2];
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return gray;
  }

  /**
   * Applies Contrast Limited Adaptive Histogram Equalization (CLAHE) approximation.
   * Partitions the image into grid tiles, equalizes local histograms with clip limiting,
   * and bilinearly interpolates across tile boundaries to eliminate harsh shadows.
   */
  public static applyClahe(
    gray: Uint8Array,
    width: number,
    height: number,
    gridSize: number = 4,
    clipLimit: number = 2.5
  ): Uint8Array {
    const totalPixels = width * height;
    if (gray.length < totalPixels) {
      return gray;
    }

    const output = new Uint8Array(totalPixels);
    const tileW = Math.floor(width / gridSize);
    const tileH = Math.floor(height / gridSize);

    // Compute CDF for each tile
    const cdfs: Float32Array[][] = [];

    for (let gy = 0; gy < gridSize; gy++) {
      cdfs[gy] = [];
      for (let gx = 0; gx < gridSize; gx++) {
        const hist = new Int32Array(256);
        const startX = gx * tileW;
        const endX = gx === gridSize - 1 ? width : (gx + 1) * tileW;
        const startY = gy * tileH;
        const endY = gy === gridSize - 1 ? height : (gy + 1) * tileH;
        const tilePixelCount = (endX - startX) * (endY - startY);

        for (let y = startY; y < endY; y++) {
          const row = y * width;
          for (let x = startX; x < endX; x++) {
            hist[gray[row + x]]++;
          }
        }

        // Apply clip limit
        const clipThreshold = Math.max(1, Math.round((clipLimit * tilePixelCount) / 256));
        let excess = 0;
        for (let i = 0; i < 256; i++) {
          if (hist[i] > clipThreshold) {
            excess += hist[i] - clipThreshold;
            hist[i] = clipThreshold;
          }
        }

        const bonus = Math.floor(excess / 256);
        for (let i = 0; i < 256; i++) {
          hist[i] += bonus;
        }

        // Cumulative Distribution Function (CDF) normalized to [0, 255]
        const cdf = new Float32Array(256);
        let cumSum = 0;
        for (let i = 0; i < 256; i++) {
          cumSum += hist[i];
          cdf[i] = (cumSum / tilePixelCount) * 255.0;
        }
        cdfs[gy][gx] = cdf;
      }
    }

    // Bilinear interpolation between tile CDFs for every pixel
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const gyFloat = (y - tileH / 2) / tileH;
      const gy0 = Math.max(0, Math.min(gridSize - 1, Math.floor(gyFloat)));
      const gy1 = Math.max(0, Math.min(gridSize - 1, gy0 + 1));
      const yWeight = Math.max(0, Math.min(1, gyFloat - gy0));

      for (let x = 0; x < width; x++) {
        const gxFloat = (x - tileW / 2) / tileW;
        const gx0 = Math.max(0, Math.min(gridSize - 1, Math.floor(gxFloat)));
        const gx1 = Math.max(0, Math.min(gridSize - 1, gx0 + 1));
        const xWeight = Math.max(0, Math.min(1, gxFloat - gx0));

        const val = gray[row + x];

        const c00 = cdfs[gy0][gx0][val];
        const c10 = cdfs[gy0][gx1][val];
        const c01 = cdfs[gy1][gx0][val];
        const c11 = cdfs[gy1][gx1][val];

        const top = c00 * (1 - xWeight) + c10 * xWeight;
        const bottom = c01 * (1 - xWeight) + c11 * xWeight;
        const equalized = top * (1 - yWeight) + bottom * yWeight;

        output[row + x] = Math.max(0, Math.min(255, Math.round(equalized)));
      }
    }

    return output;
  }

  /**
   * Preprocesses RGB face buffer with lighting normalization for MobileFaceNet.
   * Returns normalized Float32Array shaped (112, 112, 3) in range [-1.0, 1.0].
   */
  public static normalizeRgbFace(
    rgb: Uint8Array,
    width: number,
    height: number
  ): Float32Array {
    const gray = LightingNormalizer.rgbToGrayscale(rgb, 3);
    const equalized = LightingNormalizer.applyClahe(gray, width, height, 4, 2.5);

    const totalPixels = width * height;
    const output = new Float32Array(totalPixels * 3);

    // Replicate normalized luminance into 3 channels to provide lighting-invariant representation
    for (let i = 0; i < totalPixels; i++) {
      const normVal = (equalized[i] - 127.5) / 128.0;
      const base = i * 3;
      output[base] = normVal;
      output[base + 1] = normVal;
      output[base + 2] = normVal;
    }

    return output;
  }
}
