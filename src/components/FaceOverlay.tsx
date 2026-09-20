import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LivenessState } from '../liveness/livenessStateMachine';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LandmarkPoint {
  x: number;
  y: number;
  name?: string;
}

export type LandmarksInput =
  | LandmarkPoint[]
  | { [key: string]: LandmarkPoint | undefined | null }
  | null;

export interface FaceOverlayProps {
  boundingBox?: BoundingBox | null;
  frameWidth: number;
  frameHeight: number;
  layoutWidth: number;
  layoutHeight: number;
  isFrontCamera?: boolean;
  currentState: LivenessState;
  landmarks?: LandmarksInput;
  statusMessageOverride?: string;
  poseProgress?: {
    current: number;
    total: number;
    poseName: string;
  };
  poseDirection?: 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
}

/**
 * Maps current liveness pipeline state to banner status text.
 */
export function getStatusMessage(state: LivenessState, override?: string): string {
  if (override) return override;

  switch (state) {
    case 'IDLE':
      return 'Searching for Face';
    case 'FACE_DETECTED':
      return 'Please Blink';
    case 'BLINK_VERIFIED':
      return 'Passive Anti-Spoofing Check';
    case 'PASSIVE_LIVENESS_PASSED':
      return 'Liveness Verified';
    case 'POSE_CAPTURE_IN_PROGRESS':
      return 'Follow Guided Head Movement';
    case 'ALL_POSES_CAPTURED':
      return 'Poses Captured - Scanning Depth';
    case 'DEPTH_ESTIMATED':
      return 'Generating Centroid Embedding';
    case 'EMBEDDING_READY':
      return 'Verified & Transmitted!';
    case 'FAILED':
      return 'Verification Failed';
    case 'TIMEOUT':
      return 'Verification Timed Out';
    default:
      return 'Searching for Face';
  }
}

/**
 * Face Bounding Box Overlay Component.
 * Scaled using cover aspect-ratio and front camera horizontal mirroring formula:
 * x_screen = layoutWidth - (x_scaled + width_scaled)
 */
export const FaceOverlay: React.FC<FaceOverlayProps> = ({
  boundingBox,
  frameWidth,
  frameHeight,
  layoutWidth,
  layoutHeight,
  isFrontCamera = true,
  currentState,
  landmarks,
  statusMessageOverride,
  poseProgress,
  poseDirection,
}) => {
  const statusMessage = getStatusMessage(currentState, statusMessageOverride);

  // Validate dimensions to avoid division by zero
  const validDimensions =
    frameWidth > 0 && frameHeight > 0 && layoutWidth > 0 && layoutHeight > 0;

  let x_screen = 0;
  let y_screen = 0;
  let width_scaled = 0;
  let height_scaled = 0;

  let scaledLandmarks: { x: number; y: number }[] = [];

  if (validDimensions && boundingBox) {
    // 1. Cover aspect ratio scale calculation
    const scale = Math.max(layoutWidth / frameWidth, layoutHeight / frameHeight);

    const scaledFrameWidth = frameWidth * scale;
    const scaledFrameHeight = frameHeight * scale;

    const offsetX = (scaledFrameWidth - layoutWidth) / 2;
    const offsetY = (scaledFrameHeight - layoutHeight) / 2;

    // 2. Coordinate scaling for bounding box
    const x_scaled = boundingBox.x * scale - offsetX;
    const y_scaled = boundingBox.y * scale - offsetY;
    width_scaled = boundingBox.width * scale;
    height_scaled = boundingBox.height * scale;

    // 3. Front camera horizontal mirroring formula: x_screen = layoutWidth - (x_scaled + width_scaled)
    if (isFrontCamera) {
      x_screen = layoutWidth - (x_scaled + width_scaled);
    } else {
      x_screen = x_scaled;
    }
    y_screen = y_scaled;

    // 4. Transform facial landmark points
    if (landmarks) {
      const landmarkList: LandmarkPoint[] = Array.isArray(landmarks)
        ? landmarks
        : (Object.values(landmarks).filter(
            (pt): pt is LandmarkPoint =>
              pt !== null && pt !== undefined && typeof pt.x === 'number' && typeof pt.y === 'number'
          ) as LandmarkPoint[]);

      scaledLandmarks = landmarkList.map((pt) => {
        const lx_scaled = pt.x * scale - offsetX;
        const ly_scaled = pt.y * scale - offsetY;
        const lx_screen = isFrontCamera ? layoutWidth - lx_scaled : lx_scaled;
        const ly_screen = ly_scaled;
        return { x: lx_screen, y: ly_screen };
      });
    }
  }

  const getBorderColor = (): string => {
    switch (currentState) {
      case 'EMBEDDING_READY':
      case 'DEPTH_ESTIMATED':
        return '#10B981'; // Emerald Green
      case 'ALL_POSES_CAPTURED':
        return '#8B5CF6'; // Purple
      case 'POSE_CAPTURE_IN_PROGRESS':
        return '#3B82F6'; // Blue
      case 'FAILED':
      case 'TIMEOUT':
        return '#EF4444'; // Red
      case 'PASSIVE_LIVENESS_PASSED':
      case 'BLINK_VERIFIED':
        return '#06B6D4'; // Cyan
      case 'FACE_DETECTED':
        return '#4F46E5'; // Indigo
      case 'IDLE':
      default:
        return 'rgba(255, 255, 255, 0.6)';
    }
  };

  const getDirectionArrow = (): string | null => {
    switch (poseDirection) {
      case 'LEFT':
        return '←';
      case 'RIGHT':
        return '→';
      case 'UP':
        return '↑';
      case 'DOWN':
        return '↓';
      case 'CENTER':
        return '•';
      default:
        return null;
    }
  };

  return (
    <View style={styles.overlayContainer} pointerEvents="none">
      {/* Pose Progress Bar / Steps (Face ID style) */}
      {poseProgress && (
        <View style={styles.poseHeaderContainer}>
          <View style={styles.poseStepsRow}>
            {Array.from({ length: poseProgress.total }).map((_, idx) => {
              const isCompleted = idx < poseProgress.current;
              const isCurrent = idx === poseProgress.current;
              return (
                <View
                  key={`pose-dot-${idx}`}
                  style={[
                    styles.poseDot,
                    isCompleted && styles.poseDotCompleted,
                    isCurrent && styles.poseDotCurrent,
                  ]}
                />
              );
            })}
          </View>
          {getDirectionArrow() && (
            <View style={styles.arrowBadge}>
              <Text style={styles.arrowText}>{getDirectionArrow()}</Text>
            </View>
          )}
        </View>
      )}

      {/* Bounding Box Rect & Facial Landmarks */}
      {validDimensions && boundingBox ? (
        <>
          <View
            style={[
              styles.boundingBox,
              {
                left: x_screen,
                top: y_screen,
                width: width_scaled,
                height: height_scaled,
                borderColor: getBorderColor(),
              },
            ]}
          >
            {/* Box Corner Accents */}
            <View style={[styles.cornerTL, { borderColor: getBorderColor() }]} />
            <View style={[styles.cornerTR, { borderColor: getBorderColor() }]} />
            <View style={[styles.cornerBL, { borderColor: getBorderColor() }]} />
            <View style={[styles.cornerBR, { borderColor: getBorderColor() }]} />
          </View>

          {/* Facial Landmark Points */}
          {scaledLandmarks.map((pt, index) => (
            <View
              key={`landmark-${index}`}
              style={[
                styles.landmarkDot,
                {
                  left: pt.x - 4,
                  top: pt.y - 4,
                  backgroundColor: getBorderColor(),
                },
              ]}
            />
          ))}
        </>
      ) : null}
    </View>
  );
};

export default FaceOverlay;

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  bannerWrapper: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  bannerSuccess: {
    backgroundColor: 'rgba(6, 78, 59, 0.9)',
    borderColor: '#10B981',
  },
  bannerError: {
    backgroundColor: 'rgba(127, 29, 29, 0.9)',
    borderColor: '#EF4444',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  cornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 14,
    height: 14,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 14,
    height: 14,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 10,
  },
  landmarkDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  poseHeaderContainer: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  poseStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  poseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  poseDotCompleted: {
    backgroundColor: '#10B981',
  },
  poseDotCurrent: {
    backgroundColor: '#3B82F6',
    transform: [{ scale: 1.3 }],
  },
  arrowBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
});
