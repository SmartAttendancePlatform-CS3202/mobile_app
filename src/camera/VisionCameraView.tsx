import React, { useEffect, forwardRef } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ViewStyle } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, type CameraViewProps, type CameraRef } from 'react-native-vision-camera';

export interface VisionCameraViewProps extends Omit<CameraViewProps, 'device' | 'isActive'> {
  facing?: 'front' | 'back';
  isActive?: boolean;
  style?: ViewStyle;
}

export const VisionCameraView = forwardRef<CameraRef, VisionCameraViewProps>(({
  facing = 'front',
  isActive = true,
  style,
  ...props
}, ref) => {
  const device = useCameraDevice(facing);
  const { hasPermission, requestPermission } = useCameraPermission();

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
      ref={ref}
      style={[styles.container, style]}
      device={device}
      isActive={isActive}
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
