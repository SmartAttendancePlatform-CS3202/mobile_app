import { RefObject } from 'react';
import type { Face } from 'react-native-vision-camera-face-detector';
import { loadImage, type Image } from 'react-native-nitro-image';
import { LightingNormalizer } from '../enrollment/lightingNormalization';
import { DepthEstimator, FaceLandmarksInput } from '../enrollment/depthEstimation';
import { generateFaceEmbedding } from '../embedding';

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
 * Captures a real photo via VisionCamera, crops to face bounds using NitroImage,
 * normalizes lighting, and extracts real 192D MobileFaceNet embedding and 48D depth vector.
 */
export async function captureAndProcessFace(
  cameraRef: RefObject<CaptureCapableRef | null>,
  face?: Face | null
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

  // 2. Compute crop bounds scaled to photo resolution
  let startX = 0;
  let startY = 0;
  let endX = photoW;
  let endY = photoH;

  if (face?.bounds && face.bounds.width > 10 && face.bounds.height > 10) {
    const frameW = face.frameWidth || photoW;
    const frameH = face.frameHeight || photoH;

    const scaleX = photoW / frameW;
    const scaleY = photoH / frameH;

    const rawX = face.bounds.x * scaleX;
    const rawY = face.bounds.y * scaleY;
    const rawW = face.bounds.width * scaleX;
    const rawH = face.bounds.height * scaleY;

    // Add a 15% margin around the face to preserve chin, forehead, and hair boundary
    const padX = rawW * 0.15;
    const padY = rawH * 0.15;

    startX = Math.max(0, Math.floor(rawX - padX));
    startY = Math.max(0, Math.floor(rawY - padY));
    endX = Math.min(photoW, Math.ceil(rawX + rawW + padX));
    endY = Math.min(photoH, Math.ceil(rawY + rawH + padY));
  } else {
    // Center square crop if no explicit bounds
    const side = Math.min(photoW, photoH);
    startX = Math.floor((photoW - side) / 2);
    startY = Math.floor((photoH - side) / 2);
    endX = startX + side;
    endY = startY + side;
  }

  const cropW = endX - startX;
  const cropH = endY - startY;

  const cropped = (cropW > 20 && cropH > 20 && (cropW !== photoW || cropH !== photoH))
    ? img.crop(startX, startY, endX, endY)
    : img;

  // 3. Resize to target 112x112 MobileFaceNet input dimensions
  const resized = cropped.resize(112, 112);
  const rawPixelData = resized.toRawPixelData();

  // 4. Extract raw RGB 3-channel byte array
  const rawBytes = new Uint8Array(rawPixelData.buffer);
  const rgb = new Uint8Array(112 * 112 * 3);
  const isBgra = rawPixelData.pixelFormat === 'BGRA';

  for (let i = 0, j = 0; i < rawBytes.length; i += 4, j += 3) {
    rgb[j] = isBgra ? rawBytes[i + 2] : rawBytes[i];         // Red
    rgb[j + 1] = rawBytes[i + 1];                           // Green
    rgb[j + 2] = isBgra ? rawBytes[i] : rawBytes[i + 2];     // Blue
  }

  // 5. Lighting normalization
  const normalizedRgb = LightingNormalizer.normalizeRgbFace(rgb, 112, 112);

  // 6. Extract real 192D MobileFaceNet embedding
  const embedding = await generateFaceEmbedding(normalizedRgb);

  // 7. Extract real 48D depth & topology features
  const gray = new Uint8Array(112 * 112);
  for (let p = 0; p < gray.length; p++) {
    gray[p] = Math.round(
      0.299 * normalizedRgb[p * 3] +
      0.587 * normalizedRgb[p * 3 + 1] +
      0.114 * normalizedRgb[p * 3 + 2]
    );
  }

  // Map landmarks to 112x112 face crop coordinates
  let mappedLandmarks: FaceLandmarksInput | undefined;
  if (face?.landmarks && face.bounds && cropW > 0 && cropH > 0) {
    const scaleX = (photoW / (face.frameWidth || photoW));
    const scaleY = (photoH / (face.frameHeight || photoH));

    const mapPoint = (p?: { x: number; y: number }) => {
      if (!p) return undefined;
      const px = p.x * scaleX - startX;
      const py = p.y * scaleY - startY;
      return {
        x: Math.max(0, Math.min(112, (px / cropW) * 112)),
        y: Math.max(0, Math.min(112, (py / cropH) * 112)),
      };
    };

    mappedLandmarks = {
      leftEye: mapPoint(face.landmarks.LEFT_EYE),
      rightEye: mapPoint(face.landmarks.RIGHT_EYE),
      noseBase: mapPoint(face.landmarks.NOSE_BASE),
      bottomMouth: mapPoint(face.landmarks.MOUTH_BOTTOM),
      leftMouth: mapPoint(face.landmarks.MOUTH_LEFT),
      rightMouth: mapPoint(face.landmarks.MOUTH_RIGHT),
      leftEar: mapPoint(face.landmarks.LEFT_EAR),
      rightEar: mapPoint(face.landmarks.RIGHT_EAR),
    };
  }

  const depthFeatures = DepthEstimator.extractDepthFeatures(gray, 112, 112, mappedLandmarks);

  return {
    photoPath,
    rgb,
    normalizedRgb,
    embedding,
    depthFeatures,
  };
}
