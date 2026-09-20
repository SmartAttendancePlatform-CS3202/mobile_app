import React, { useEffect, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ViewStyle } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  type CameraViewProps,
  type CameraRef,
} from 'react-native-vision-camera';
import {
  createFaceDetectorOutput,
  type Face,
  type FaceDetectorOutputOptions,
} from 'react-native-vision-camera-face-detector';
import type { Image } from 'react-native-nitro-image';

export { type Face };

export interface VisionCameraRef extends Partial<CameraRef> {
  capturePhoto: () => Promise<Image>;
}

export interface VisionCameraViewProps extends Omit<CameraViewProps, 'device' | 'isActive'> {
  facing?: 'front' | 'back';
  isActive?: boolean;
  style?: ViewStyle;
  onFacesDetected?: (faces: Face[]) => void;
  runClassifications?: boolean;
  runLandmarks?: boolean;
  faceDetectorOptions?: Partial<FaceDetectorOutputOptions>;
}

const STATIC_PHOTO_OPTIONS = {
  quality: 0.9,
  qualityPrioritization: 'speed' as const,
};

export const VisionCameraView = forwardRef<VisionCameraRef, VisionCameraViewProps>(({
  facing = 'front',
  isActive = true,
  style,
  onFacesDetected,
  runClassifications = true,
  runLandmarks = true,
  faceDetectorOptions,
  outputs,
  ...props
}, ref) => {
  const device = useCameraDevice(facing);
  const { hasPermission, requestPermission } = useCameraPermission();
  const innerCameraRef = useRef<CameraRef>(null);

  // Keep latest onFacesDetected in ref so callback changes don't re-create native output
  const onFacesDetectedRef = useRef(onFacesDetected);
  onFacesDetectedRef.current = onFacesDetected;

  // 1. Stable MLKit Face Detector Output (created once, not re-created on render)
  const faceDetectorOutput = useMemo(() => {
    return createFaceDetectorOutput({
      onFacesDetected: (faces: Face[]) => {
        onFacesDetectedRef.current?.(faces);
      },
      onError: (err: Error) => {
        console.warn('[VisionCameraView] Face detector error:', err);
      },
      cameraFacing: facing,
      runClassifications,
      runLandmarks,
      performanceMode: 'fast',
      minFaceSize: 0.25,
      trackingEnabled: true,
      outputResolution: 'preview',
      ...faceDetectorOptions,
    });
  }, [facing, runClassifications, runLandmarks]);

  // 2. VisionCamera Nitro Photo Output (created once)
  const photoOutput = usePhotoOutput(STATIC_PHOTO_OPTIONS);

  const combinedOutputs = useMemo(() => {
    return [faceDetectorOutput, photoOutput, ...(outputs ?? [])];
  }, [faceDetectorOutput, photoOutput, outputs]);

  // Expose capturePhoto method on ref to return in-memory Nitro Image
  useImperativeHandle(ref, () => ({
    capturePhoto: async () => {
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {}
      );
      const img = await photo.toImageAsync();
      photo.dispose();
      return img;
    },
    focusTo: (viewPoint, options) => innerCameraRef.current?.focusTo(viewPoint, options) ?? Promise.resolve(),
    controller: innerCameraRef.current?.controller,
    preview: innerCameraRef.current?.preview,
  }), [photoOutput]);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.centered, style]}>
        <Text style={styles.text}>Camera permission is required.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={[styles.container, styles.centered, style]}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.text}>Loading camera device...</Text>
      </View>
    );
  }

  return (
    <Camera
      ref={innerCameraRef}
      style={[styles.container, style]}
      device={device}
      isActive={isActive}
      outputs={combinedOutputs}
      {...props}
    />
  );
});

VisionCameraView.displayName = 'VisionCameraView';

export default VisionCameraView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 16,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
