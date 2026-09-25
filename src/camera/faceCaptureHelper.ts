import { RefObject } from 'react';
import type { Face } from 'react-native-vision-camera-face-detector';
import { loadImage, type Image } from 'react-native-nitro-image';
// Removed LightingNormalizer import to preserve true RGB color features for MobileFaceNet
import { DepthEstimator, FaceLandmarksInput } from '../enrollment/depthEstimation';
import { generateFaceEmbedding } from '../embedding';
import { getSimilarityTransform, CANONICAL_POINTS_160 } from '../utils/affineWarp';

export interface FaceCaptureResult {
  photoPath?: string;
  rgb: Uint8Array;
  normalizedRgb: Float32Array;
  embedding: Float32Array;
  depthFeatures: number[];
}

export interface CaptureCapableRef {
  capturePhoto?: () => Promise<Image>;
  takePhoto?: (options?: any) => Promise<{ path: string; width?: number; height?: number }>;
}

/**
 * Captures a real photo via VisionCamera, crops to face bounds with square geometry and front-camera mirroring,
 * applies canonical RGB float normalization, and extracts real 512D FaceNet embedding and 48D depth vector.
 */
export async function captureAndProcessFace(
  cameraRef: RefObject<CaptureCapableRef | null>,
  face?: Face | null,
  isFrontCamera: boolean = true
): Promise<FaceCaptureResult> {
  if (!cameraRef.current) {
    throw new Error('Camera reference is not initialized');
  }

  let img: Image;
  let photoPath: string | undefined;

  // 1. Capture real photo: prefer in-memory Nitro Image, fallback to photo file
  if (typeof cameraRef.current.capturePhoto === 'function') {
    try {
      img = await cameraRef.current.capturePhoto();
    } catch (firstErr: any) {
      console.warn('[faceCaptureHelper] capturePhoto initial attempt failed, retrying in 200ms:', firstErr?.message);
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (!cameraRef.current || typeof cameraRef.current.capturePhoto !== 'function') {
        throw firstErr;
      }
      img = await cameraRef.current.capturePhoto();
    }
  } else if (typeof cameraRef.current.takePhoto === 'function') {
    const photo = await cameraRef.current.takePhoto({
      flash: 'off',
      enableShutterSound: false,
    });
    if (!photo?.path) {
      throw new Error('Failed to capture photo from camera');
    }
    photoPath = photo.path;
    img = await loadImage({ filePath: photo.path });
  } else {
    throw new Error('Camera ref does not support photo capture');
  }

  const photoW = img.width;
  const photoH = img.height;

  // 2. Compute crop bounds scaled to photo resolution with front camera mirroring
  let startX = 0;
  let startY = 0;
  let endX = photoW;
  let endY = photoH;

  if (face?.bounds && face.bounds.width > 10 && face.bounds.height > 10) {
    const frameW = face.frameWidth || photoW;
    const frameH = face.frameHeight || photoH;

    const scaleX = photoW / frameW;
    const scaleY = photoH / frameH;

    const rawX = isFrontCamera
      ? photoW - (face.bounds.x * scaleX + face.bounds.width * scaleX)
      : face.bounds.x * scaleX;
    const rawY = face.bounds.y * scaleY;
    const rawW = face.bounds.width * scaleX;
    const rawH = face.bounds.height * scaleY;

    // Use a slightly larger bounding box to ensure landmarks are within bounds for affine warp
    const centerX = rawX + rawW / 2;
    const centerY = rawY + rawH / 2;
    const side = Math.max(rawW, rawH) * 1.50; // Increased to 1.5x for affine warp safety

    startX = Math.max(0, Math.floor(centerX - side / 2));
    startY = Math.max(0, Math.floor(centerY - side / 2));
    endX = Math.min(photoW, Math.ceil(centerX + side / 2));
    endY = Math.min(photoH, Math.ceil(centerY + side / 2));
  } else {
    const side = Math.min(photoW, photoH);
    startX = Math.floor((photoW - side) / 2);
    startY = Math.floor((photoH - side) / 2);
    endX = startX + side;
    endY = startY + side;
  }

  const cropW = Math.max(1, endX - startX);
  const cropH = Math.max(1, endY - startY);

  const cropped = img.crop(startX, startY, endX, endY);
  const rawPixelData = cropped.toRawPixelData();

  // 3. Collect 5-point facial landmarks and map to crop coordinates
  let hasLandmarks = false;
  let imgPoints: number[][] = [];
  if (face?.landmarks && face.bounds) {
    const frameW = face.frameWidth || photoW;
    const frameH = face.frameHeight || photoH;
    const scaleX = photoW / frameW;
    const scaleY = photoH / frameH;

    const mapPoint = (p?: { x: number; y: number }) => {
      if (!p) return undefined;
      const lx = isFrontCamera ? photoW - (p.x * scaleX) : p.x * scaleX;
      const ly = p.y * scaleY;
      return [lx - startX, ly - startY];
    };

    const le = mapPoint(face.landmarks.LEFT_EYE);
    const re = mapPoint(face.landmarks.RIGHT_EYE);
    const n = mapPoint(face.landmarks.NOSE_BASE);
    const lm = mapPoint(face.landmarks.MOUTH_LEFT);
    const rm = mapPoint(face.landmarks.MOUTH_RIGHT);
    
    if (le && re && n && lm && rm) {
      imgPoints = [le, re, n, lm, rm];
      hasLandmarks = true;
    }
  }

  // 4. Compute Umeyama Affine Transform Matrix
  let a = cropW / 160.0;
  let b = 0, tx = 0, ty = 0;
  
  if (hasLandmarks) {
    [a, b, tx, ty] = getSimilarityTransform(CANONICAL_POINTS_160, imgPoints);
  }

  // 5. Bilinear Interpolation mapped to canonical 160x160 Float32 tensor
  const TARGET_SIZE = 160;
  const rawBytes = new Uint8Array(rawPixelData.buffer);
  const isBgra = rawPixelData.pixelFormat === 'BGRA';
  
  const rgb = new Uint8Array(TARGET_SIZE * TARGET_SIZE * 3);
  const normalizedRgb = new Float32Array(TARGET_SIZE * TARGET_SIZE * 3);
  const gray = new Uint8Array(TARGET_SIZE * TARGET_SIZE);

  for (let y = 0; y < TARGET_SIZE; y++) {
    for (let x = 0; x < TARGET_SIZE; x++) {
      const srcX = a * x - b * y + tx;
      const srcY = b * x + a * y + ty;

      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = x0 + 1;
      const y1 = y0 + 1;

      const wx1 = srcX - x0;
      const wx0 = 1.0 - wx1;
      const wy1 = srcY - y0;
      const wy0 = 1.0 - wy1;

      const getPixel = (px: number, py: number) => {
        const cx = Math.max(0, Math.min(cropW - 1, px));
        const cy = Math.max(0, Math.min(cropH - 1, py));
        const idx = (cy * cropW + cx) * 4;
        return [
          isBgra ? rawBytes[idx + 2] : rawBytes[idx],
          rawBytes[idx + 1],
          isBgra ? rawBytes[idx] : rawBytes[idx + 2]
        ];
      };

      const p00 = getPixel(x0, y0);
      const p10 = getPixel(x1, y0);
      const p01 = getPixel(x0, y1);
      const p11 = getPixel(x1, y1);

      const r = p00[0]*wx0*wy0 + p10[0]*wx1*wy0 + p01[0]*wx0*wy1 + p11[0]*wx1*wy1;
      const g = p00[1]*wx0*wy0 + p10[1]*wx1*wy0 + p01[1]*wx0*wy1 + p11[1]*wx1*wy1;
      const b_c = p00[2]*wx0*wy0 + p10[2]*wx1*wy0 + p01[2]*wx0*wy1 + p11[2]*wx1*wy1;

      const destIdx = (y * TARGET_SIZE + x);
      const destIdx3 = destIdx * 3;

      rgb[destIdx3] = r;
      rgb[destIdx3 + 1] = g;
      rgb[destIdx3 + 2] = b_c;

      normalizedRgb[destIdx3] = (r - 127.5) / 128.0;
      normalizedRgb[destIdx3 + 1] = (g - 127.5) / 128.0;
      normalizedRgb[destIdx3 + 2] = (b_c - 127.5) / 128.0;

      gray[destIdx] = Math.round(0.299 * r + 0.587 * g + 0.114 * b_c);
    }
  }

  // 6. Extract real 512D FaceNet embedding
  const embedding = await generateFaceEmbedding(normalizedRgb);

  // 7. Extract real 48D depth & topology features (using luminance derived from natural RGB)
  // `gray` array is already computed in the bilinear interpolation loop above.
  
  // Landmarks are mapped directly to canonical 160x160 space via the affine transform
  const mappedLandmarks: FaceLandmarksInput | undefined = hasLandmarks ? {
    leftEye: { x: CANONICAL_POINTS_160[0][0], y: CANONICAL_POINTS_160[0][1] },
    rightEye: { x: CANONICAL_POINTS_160[1][0], y: CANONICAL_POINTS_160[1][1] },
    noseBase: { x: CANONICAL_POINTS_160[2][0], y: CANONICAL_POINTS_160[2][1] },
    leftMouth: { x: CANONICAL_POINTS_160[3][0], y: CANONICAL_POINTS_160[3][1] },
    rightMouth: { x: CANONICAL_POINTS_160[4][0], y: CANONICAL_POINTS_160[4][1] },
  } : undefined;

  const depthFeatures = DepthEstimator.extractDepthFeatures(gray, TARGET_SIZE, TARGET_SIZE, mappedLandmarks);

  return {
    photoPath,
    rgb,
    normalizedRgb,
    embedding,
    depthFeatures,
  };
}
