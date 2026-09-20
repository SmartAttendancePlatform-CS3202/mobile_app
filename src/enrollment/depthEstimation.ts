/**
 * Pseudo-Depth & Topological Mesh Estimation Module
 * Produces a 48-dimensional biometric depth feature vector combining:
 * 1. 32-D Facial Surface Topology Grid (8 rows x 4 cols elevation profile)
 * 2. 16-D Geometric Contour & Landmark Invariant Proportions
 */

export interface FaceLandmarkPoint {
  x: number;
  y: number;
}

export interface FaceLandmarksInput {
  leftEye?: FaceLandmarkPoint;
  rightEye?: FaceLandmarkPoint;
  noseBase?: FaceLandmarkPoint;
  bottomMouth?: FaceLandmarkPoint;
  leftMouth?: FaceLandmarkPoint;
  rightMouth?: FaceLandmarkPoint;
  leftEar?: FaceLandmarkPoint;
  rightEar?: FaceLandmarkPoint;
  contourPoints?: FaceLandmarkPoint[];
}

export class DepthEstimator {
  public static readonly TOTAL_DEPTH_DIM = 48;
  public static readonly GRID_DIM = 32;       // 8 rows x 4 cols
  public static readonly GEOMETRIC_DIM = 16;  // 16 anatomical proportions

  /**
   * Generates the full 48-D depth feature vector.
   * @param faceGrayscale Grayscale face image buffer (cropped face)
   * @param width Image width (e.g. 112)
   * @param height Image height (e.g. 112)
   * @param landmarks Detected facial landmarks
   */
  public static extractDepthFeatures(
    faceGrayscale: Uint8Array,
    width: number,
    height: number,
    landmarks?: FaceLandmarksInput
  ): number[] {
    const gridFeatures = DepthEstimator.extractTopologyGrid(faceGrayscale, width, height);
    const geometricFeatures = DepthEstimator.extractGeometricRatios(landmarks, width, height);

    const combined = [...gridFeatures, ...geometricFeatures];

    // L2 normalize the 48D vector
    let sumSq = 0;
    for (let i = 0; i < combined.length; i++) {
      sumSq += combined[i] * combined[i];
    }
    const norm = Math.sqrt(sumSq) || 1.0;

    return combined.map((v) => Math.round((v / norm) * 10000) / 10000);
  }

  /**
   * Partitions the face into an 8x4 grid to compute relative topological elevation.
   * Returns 32 features representing surface height gradients.
   */
  public static extractTopologyGrid(
    gray: Uint8Array,
    width: number,
    height: number
  ): number[] {
    const rows = 8;
    const cols = 4;
    const cellW = Math.floor(width / cols);
    const cellH = Math.floor(height / rows);

    // Compute global face mean
    let globalSum = 0;
    const total = width * height;
    for (let i = 0; i < total; i++) {
      globalSum += gray[i];
    }
    const globalMean = total > 0 ? globalSum / total : 128;

    const grid = new Array<number>(rows * cols);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const startX = c * cellW;
        const endX = c === cols - 1 ? width : (c + 1) * cellW;
        const startY = r * cellH;
        const endY = r === rows - 1 ? height : (r + 1) * cellH;

        let cellSum = 0;
        const cellPixels = (endX - startX) * (endY - startY);

        for (let y = startY; y < endY; y++) {
          const rowOffset = y * width;
          for (let x = startX; x < endX; x++) {
            cellSum += gray[rowOffset + x];
          }
        }

        const cellMean = cellPixels > 0 ? cellSum / cellPixels : globalMean;
        // Relative topological contrast deviation from face mean
        grid[r * cols + c] = (cellMean - globalMean) / 128.0;
      }
    }

    return grid;
  }

  /**
   * Computes 16 pose-invariant anatomical distance and angle ratios.
   */
  public static extractGeometricRatios(
    landmarks?: FaceLandmarksInput,
    width: number = 112,
    height: number = 112
  ): number[] {
    const features = new Array<number>(DepthEstimator.GEOMETRIC_DIM).fill(0.0);

    const lEye = landmarks?.leftEye ?? { x: width * 0.35, y: height * 0.38 };
    const rEye = landmarks?.rightEye ?? { x: width * 0.65, y: height * 0.38 };
    const nose = landmarks?.noseBase ?? { x: width * 0.50, y: height * 0.58 };
    const mouth = landmarks?.bottomMouth ?? { x: width * 0.50, y: height * 0.78 };
    const lMouth = landmarks?.leftMouth ?? { x: width * 0.38, y: height * 0.75 };
    const rMouth = landmarks?.rightMouth ?? { x: width * 0.62, y: height * 0.75 };

    const dist = (p1: FaceLandmarkPoint, p2: FaceLandmarkPoint) =>
      Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

    const interOcular = Math.max(1, dist(lEye, rEye));
    const eyeToNose = dist(lEye, nose) + dist(rEye, nose);
    const noseToMouth = dist(nose, mouth);
    const mouthWidth = dist(lMouth, rMouth);
    const faceHeight = dist({ x: (lEye.x + rEye.x) / 2, y: (lEye.y + rEye.y) / 2 }, mouth);

    // 16 Invariant Proportions
    features[0] = interOcular / width;
    features[1] = mouthWidth / interOcular;
    features[2] = noseToMouth / interOcular;
    features[3] = faceHeight / interOcular;
    features[4] = eyeToNose / (2 * interOcular);
    features[5] = dist(lEye, nose) / (dist(rEye, nose) || 1); // Symmetry ratio
    features[6] = dist(lMouth, mouth) / (dist(rMouth, mouth) || 1);
    features[7] = (nose.y - lEye.y) / height;
    features[8] = (mouth.y - nose.y) / height;
    features[9] = Math.abs(lEye.y - rEye.y) / interOcular; // Eye tilt invariant
    features[10] = Math.abs(lMouth.y - rMouth.y) / (mouthWidth || 1);
    features[11] = dist(lEye, lMouth) / (faceHeight || 1);
    features[12] = dist(rEye, rMouth) / (faceHeight || 1);
    features[13] = (interOcular + mouthWidth) / (2 * faceHeight || 1);
    features[14] = dist(nose, lMouth) / (interOcular || 1);
    features[15] = dist(nose, rMouth) / (interOcular || 1);

    return features;
  }
}
