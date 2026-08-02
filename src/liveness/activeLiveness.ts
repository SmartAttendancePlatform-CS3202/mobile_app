/**
 * Active Liveness Module
 * Real-time blink detection using ML Kit eye open probability landmarks.
 */

export interface FrameEyeData {
  timestamp: number; // Milliseconds timestamp (e.g. Date.now())
  leftEyeOpenProbability?: number | null;
  rightEyeOpenProbability?: number | null;
}

export interface ActiveLivenessConfig {
  /** Maximum number of frames to keep in the sliding buffer. Default: 15 */
  bufferSize?: number;
  /** Eye openness threshold below which an eye is considered closed. Default: 0.30 */
  closedThreshold?: number;
  /** Eye openness threshold above which an eye is considered open. Default: 0.70 */
  openThreshold?: number;
  /** Minimum duration (in ms) for a valid blink window. Default: 100ms */
  minWindowMs?: number;
  /** Maximum duration (in ms) for a valid blink window. Default: 600ms */
  maxWindowMs?: number;
}

export interface BlinkDetectionResult {
  blinkDetected: boolean;
  timestamp?: number;
  durationMs?: number;
  leftProbability?: number;
  rightProbability?: number;
  avgProbability?: number;
}

export type BlinkListener = (result: BlinkDetectionResult) => void;

/**
 * Calculates average eye openness from left and right eye probabilities.
 */
export function getAverageEyeOpenness(frame: FrameEyeData): number | null {
  const leftValid = typeof frame.leftEyeOpenProbability === 'number' && !isNaN(frame.leftEyeOpenProbability);
  const rightValid = typeof frame.rightEyeOpenProbability === 'number' && !isNaN(frame.rightEyeOpenProbability);

  if (leftValid && rightValid) {
    return (frame.leftEyeOpenProbability! + frame.rightEyeOpenProbability!) / 2;
  } else if (leftValid) {
    return frame.leftEyeOpenProbability!;
  } else if (rightValid) {
    return frame.rightEyeOpenProbability!;
  }
  return null;
}

/**
 * Stateful Active Liveness Detector that maintains a sliding frame buffer.
 */
export class ActiveLivenessDetector {
  private bufferSize: number;
  private closedThreshold: number;
  private openThreshold: number;
  private minWindowMs: number;
  private maxWindowMs: number;

  private frameBuffer: (FrameEyeData & { avgOpenness: number })[] = [];
  private listeners: BlinkListener[] = [];
  private lastBlinkTimestamp: number = 0;

  constructor(config?: ActiveLivenessConfig) {
    this.bufferSize = config?.bufferSize ?? 15;
    this.closedThreshold = config?.closedThreshold ?? 0.30;
    this.openThreshold = config?.openThreshold ?? 0.70;
    this.minWindowMs = config?.minWindowMs ?? 100;
    this.maxWindowMs = config?.maxWindowMs ?? 600;
  }

  /**
   * Subscribe a listener for blink detection events.
   */
  public onBlinkDetected(listener: BlinkListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Clears the current frame buffer and resets internal state.
   */
  public reset(): void {
    this.frameBuffer = [];
    this.lastBlinkTimestamp = 0;
  }

  /**
   * Returns a copy of the current sliding frame buffer.
   */
  public getBuffer(): FrameEyeData[] {
    return [...this.frameBuffer];
  }

  /**
   * Processes a single frame with ML Kit eye open probability landmarks.
   */
  public processFrame(frame: FrameEyeData): BlinkDetectionResult {
    const avgOpenness = getAverageEyeOpenness(frame);

    if (avgOpenness === null) {
      return { blinkDetected: false };
    }

    const frameWithAvg = {
      ...frame,
      avgOpenness,
    };

    // Maintain sliding frame buffer up to bufferSize (15 frames)
    this.frameBuffer.push(frameWithAvg);
    if (this.frameBuffer.length > this.bufferSize) {
      this.frameBuffer.shift();
    }

    // Attempt to evaluate blink state on the buffer
    const blinkResult = this.evaluateBlinkSequence();

    if (blinkResult.blinkDetected && blinkResult.timestamp) {
      // Prevent re-triggering for the exact same timestamp
      if (blinkResult.timestamp > this.lastBlinkTimestamp) {
        this.lastBlinkTimestamp = blinkResult.timestamp;
        
        // Log mandatory console event
        console.log(`[Liveness] Blink detected! Timestamp: ${blinkResult.timestamp}`);
        
        // Notify listeners
        for (const listener of this.listeners) {
          listener(blinkResult);
        }
      }
    }

    return blinkResult;
  }

  /**
   * Evaluates the sliding frame buffer for a blink event.
   * Pattern required:
   * 1. Eye starts open (> openThreshold 0.70)
   * 2. Eye drops below closedThreshold (0.30)
   * 3. Eye recovers above openThreshold (0.70)
   * 4. Time window between drop start/trough and recovery is within minWindowMs..maxWindowMs (100ms - 600ms)
   */
  private evaluateBlinkSequence(): BlinkDetectionResult {
    const buffer = this.frameBuffer;
    if (buffer.length < 3) {
      return { blinkDetected: false };
    }

    const latestFrame = buffer[buffer.length - 1];

    // Current frame must have recovered above openThreshold (> 0.70)
    if (latestFrame.avgOpenness < this.openThreshold) {
      return { blinkDetected: false };
    }

    // Look backward for a trough (eye closed < 0.30)
    let troughIndex = -1;
    for (let i = buffer.length - 2; i >= 0; i--) {
      if (buffer[i].avgOpenness < this.closedThreshold) {
        troughIndex = i;
        break;
      }
    }

    if (troughIndex === -1) {
      return { blinkDetected: false };
    }

    // Look backward prior to (or at) troughIndex for an open frame (> 0.70)
    let openIndex = -1;
    for (let i = troughIndex - 1; i >= 0; i--) {
      if (buffer[i].avgOpenness >= this.openThreshold) {
        openIndex = i;
        break;
      }
    }

    if (openIndex === -1) {
      return { blinkDetected: false };
    }

    const openFrame = buffer[openIndex];
    const troughFrame = buffer[troughIndex];
    const recoveryFrame = latestFrame;

    // Temporal duration window calculation
    // Duration between when eye started dropping / trough and recovery
    const totalDurationMs = recoveryFrame.timestamp - openFrame.timestamp;
    const troughToRecoveryMs = recoveryFrame.timestamp - troughFrame.timestamp;

    // Trigger when duration falls within temporal window (100ms - 600ms)
    const validWindow =
      (totalDurationMs >= this.minWindowMs && totalDurationMs <= this.maxWindowMs) ||
      (troughToRecoveryMs >= this.minWindowMs && troughToRecoveryMs <= this.maxWindowMs);

    if (validWindow) {
      return {
        blinkDetected: true,
        timestamp: recoveryFrame.timestamp,
        durationMs: totalDurationMs,
        leftProbability: recoveryFrame.leftEyeOpenProbability ?? undefined,
        rightProbability: recoveryFrame.rightEyeOpenProbability ?? undefined,
        avgProbability: recoveryFrame.avgOpenness,
      };
    }

    return { blinkDetected: false };
  }
}

/**
 * Functional helper for one-shot blink detection on a frame array.
 */
export function detectBlink(
  frames: FrameEyeData[],
  config?: ActiveLivenessConfig
): BlinkDetectionResult {
  const detector = new ActiveLivenessDetector(config);
  let lastResult: BlinkDetectionResult = { blinkDetected: false };
  for (const frame of frames) {
    lastResult = detector.processFrame(frame);
    if (lastResult.blinkDetected) {
      break;
    }
  }
  return lastResult;
}
