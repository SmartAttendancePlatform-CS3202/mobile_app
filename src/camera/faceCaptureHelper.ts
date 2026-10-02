import { RefObject } from 'react';
import type { Face } from 'react-native-vision-camera-face-detector';
import { loadImage, type Image } from 'react-native-nitro-image';
// Removed LightingNormalizer import to preserve true RGB color features for MobileFaceNet
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
 * Captures a real photo via VisionCamera, crops to face bounds with square geometry and front-camera mirroring,
 * applies canonical RGB float normalization, and extracts real 512D MobileFaceNet embedding and 48D depth vector.
 */
export async function captureAndProcessFace(
  cameraRef: RefObject<CaptureCapableRef | null>,
  face?: Face | null,
  isFrontCamera: boolean = true
): Promise<FaceCaptureResult> {
  if (!cameraRef.current) {
    throw new Error('Camera reference is not initialized');
  }

  // 0. Strict Entry Validation (Fail Fast) before capturing photo
  if (!face?.bounds) {
    throw new Error('No face detected in the frame. Please look at the camera.');
  }
  if (face.bounds.width < 100 || face.bounds.height < 100) {
    throw new Error('Face is too far away. Please move the phone closer.');
  }
  
  // Validate Head Tilt (Roll Angle)
  const faceData: any = face;
  if (typeof faceData.rollAngle === 'number' && (faceData.rollAngle > 10 || faceData.rollAngle < -10)) {
    throw new Error('Please hold the phone straight.');
  } else if (face.landmarks && face.landmarks.LEFT_EYE && face.landmarks.RIGHT_EYE) {
    // Fallback: Manually calculate roll angle using eye landmarks if rollAngle prop is missing
    const dy = face.landmarks.RIGHT_EYE.y - face.landmarks.LEFT_EYE.y;
    const dx = face.landmarks.RIGHT_EYE.x - face.landmarks.LEFT_EYE.x;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 10 || angle < -10) {
      throw new Error('Please hold the phone straight.');
    }
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
  // Since we already strictly validated face.bounds exists, we can safely compute.
  const frameW = face.frameWidth || photoW;
  const frameH = face.frameHeight || photoH;

  const scaleX = photoW / frameW;
  const scaleY = photoH / frameH;

  // Front camera photos on Android (HybridPhoto.toImage) are horizontally mirrored.
  // MLKit face.bounds.x is in unmirrored sensor space, so mirror it when isFrontCamera is true.
  const rawX = isFrontCamera
    ? photoW - (face.bounds.x * scaleX + face.bounds.width * scaleX)
    : face.bounds.x * scaleX;
  const rawY = face.bounds.y * scaleY;
  const rawW = face.bounds.width * scaleX;
  const rawH = face.bounds.height * scaleY;

  const centerX = rawX + rawW / 2;
  const centerY = rawY + rawH / 2;

  // Determine the ideal square side with a 20% margin
  let side = Math.max(rawW, rawH) * 1.20;
  // Ensure the square side doesn't exceed the shortest image dimension
  side = Math.min(side, photoW, photoH);

  // Calculate initial start/end points
  let startX = Math.floor(centerX - side / 2);
  let startY = Math.floor(centerY - side / 2);
  let endX = Math.floor(startX + side);
  let endY = Math.floor(startY + side);

  // 3. Shift the square if it bleeds off the edges (maintains 1:1 aspect ratio)
  if (startX < 0) {
    endX -= startX; // Push right
    startX = 0;
  } else if (endX > photoW) {
    startX -= (endX - photoW); // Push left
    endX = photoW;
  }

  if (startY < 0) {
    endY -= startY; // Push down
    startY = 0;
  } else if (endY > photoH) {
    startY -= (endY - photoH); // Push up
    endY = photoH;
  }

  // Final safety clamp to absolute bounds
  startX = Math.max(0, startX);
  startY = Math.max(0, startY);
  endX = Math.min(photoW, endX);
  endY = Math.min(photoH, endY);

  const cropW = Math.max(1, endX - startX);
  const cropH = Math.max(1, endY - startY);

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

  // 5. Canonical MobileFaceNet RGB float normalization: (pixel - 127.5) / 128.0
  // Preserves true RGB skin/lip/eye color gradients for high discrimination
  const normalizedRgb = new Float32Array(112 * 112 * 3);
  for (let i = 0; i < rgb.length; i++) {
    normalizedRgb[i] = (rgb[i] - 127.5) / 128.0;
  }

  // 6. Extract real 512D MobileFaceNet embedding
  const embedding = await generateFaceEmbedding(normalizedRgb);

  // 7. Extract real 48D depth & topology features (using luminance derived from natural RGB)
  const gray = new Uint8Array(112 * 112);
  for (let p = 0; p < gray.length; p++) {
    gray[p] = Math.round(
      0.299 * rgb[p * 3] +
      0.587 * rgb[p * 3 + 1] +
      0.114 * rgb[p * 3 + 2]
    );
  }

  // Map landmarks to 112x112 face crop coordinates
  let mappedLandmarks: FaceLandmarksInput | undefined;
  if (face?.landmarks && face.bounds && cropW > 0 && cropH > 0) {
    const frameW = face.frameWidth || photoW;
    const frameH = face.frameHeight || photoH;
    const scaleX = (photoW / frameW);
    const scaleY = (photoH / frameH);

    const mapPoint = (p?: { x: number; y: number }) => {
      if (!p) return undefined;
      const lx = isFrontCamera ? photoW - (p.x * scaleX) : p.x * scaleX;
      const ly = p.y * scaleY;
      const px = lx - startX;
      const py = ly - startY;
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
