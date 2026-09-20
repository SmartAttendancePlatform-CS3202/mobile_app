/**
 * Multi-Pose Guided Capture Module
 * Guides the user through 5 orientations (Center, Left, Right, Up, Down)
 * using real-time ML Kit Euler angles (yaw, pitch, roll).
 */

export type GuidedPose = 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

export interface PoseTarget {
  pose: GuidedPose;
  targetYaw: number;    // degrees (headEulerAngleY)
  targetPitch: number;  // degrees (headEulerAngleX)
  toleranceYaw: number;
  tolerancePitch: number;
  instruction: string;
  holdInstruction: string;
}

export const POSE_SEQUENCE: PoseTarget[] = [
  {
    pose: 'CENTER',
    targetYaw: 0,
    targetPitch: 0,
    toleranceYaw: 12,
    tolerancePitch: 10,
    instruction: 'Look straight at the camera',
    holdInstruction: 'Hold still...',
  },
  {
    pose: 'LEFT',
    targetYaw: -25,
    targetPitch: 0,
    toleranceYaw: 12,
    tolerancePitch: 12,
    instruction: 'Turn your head slightly to the left',
    holdInstruction: 'Hold that position...',
  },
  {
    pose: 'RIGHT',
    targetYaw: 25,
    targetPitch: 0,
    toleranceYaw: 12,
    tolerancePitch: 12,
    instruction: 'Turn your head slightly to the right',
    holdInstruction: 'Hold that position...',
  },
  {
    pose: 'UP',
    targetYaw: 0,
    targetPitch: 15,
    toleranceYaw: 12,
    tolerancePitch: 10,
    instruction: 'Tilt your head slightly up',
    holdInstruction: 'Hold that position...',
  },
  {
    pose: 'DOWN',
    targetYaw: 0,
    targetPitch: -15,
    toleranceYaw: 12,
    tolerancePitch: 10,
    instruction: 'Tilt your head slightly down',
    holdInstruction: 'Hold that position...',
  },
];

export interface PoseEvaluationResult {
  currentPose: GuidedPose;
  isQualified: boolean;
  instruction: string;
  stableFrameCount: number;
  requiredStableFrames: number;
  poseIndex: number;
  totalPoses: number;
  yaw: number;
  pitch: number;
  yawError: number;
  pitchError: number;
  isAllComplete: boolean;
}

export class PoseGuide {
  private currentIndex: number = 0;
  private stableFrames: number = 0;
  private readonly requiredFrames: number;
  private completedPoses: Set<GuidedPose> = new Set();

  constructor(requiredStableFrames: number = 3) {
    this.requiredFrames = requiredStableFrames;
  }

  public getCurrentTarget(): PoseTarget | null {
    if (this.currentIndex >= POSE_SEQUENCE.length) {
      return null;
    }
    return POSE_SEQUENCE[this.currentIndex];
  }

  public getCurrentPoseIndex(): number {
    return this.currentIndex;
  }

  public getTotalPoses(): number {
    return POSE_SEQUENCE.length;
  }

  public isComplete(): boolean {
    return this.currentIndex >= POSE_SEQUENCE.length;
  }

  public getCompletedPoses(): GuidedPose[] {
    return Array.from(this.completedPoses);
  }

  /**
   * Evaluates face Euler angles against current target pose.
   * @param yaw headEulerAngleY (degrees, horizontal rotation)
   * @param pitch headEulerAngleX (degrees, vertical tilt)
   */
  public evaluate(yaw: number, pitch: number): PoseEvaluationResult {
    const target = this.getCurrentTarget();
    if (!target) {
      return {
        currentPose: 'CENTER',
        isQualified: true,
        instruction: 'All poses completed!',
        stableFrameCount: this.requiredFrames,
        requiredStableFrames: this.requiredFrames,
        poseIndex: POSE_SEQUENCE.length,
        totalPoses: POSE_SEQUENCE.length,
        yaw,
        pitch,
        yawError: 0,
        pitchError: 0,
        isAllComplete: true,
      };
    }

    const yawError = Math.abs(yaw - target.targetYaw);
    const pitchError = Math.abs(pitch - target.targetPitch);

    const isWithinTolerance =
      yawError <= target.toleranceYaw && pitchError <= target.tolerancePitch;

    if (isWithinTolerance) {
      this.stableFrames += 1;
    } else {
      this.stableFrames = 0;
    }

    const isQualified = this.stableFrames >= this.requiredFrames;
    const instruction = isQualified
      ? target.holdInstruction
      : this.stableFrames > 0
      ? target.holdInstruction
      : target.instruction;

    return {
      currentPose: target.pose,
      isQualified,
      instruction,
      stableFrameCount: this.stableFrames,
      requiredStableFrames: this.requiredFrames,
      poseIndex: this.currentIndex,
      totalPoses: POSE_SEQUENCE.length,
      yaw,
      pitch,
      yawError,
      pitchError,
      isAllComplete: false,
    };
  }

  /**
   * Advances to the next pose after current pose is captured.
   */
  public advance(): boolean {
    const current = this.getCurrentTarget();
    if (current) {
      this.completedPoses.add(current.pose);
      this.currentIndex += 1;
      this.stableFrames = 0;
    }
    return this.isComplete();
  }

  public reset(): void {
    this.currentIndex = 0;
    this.stableFrames = 0;
    this.completedPoses.clear();
  }
}
