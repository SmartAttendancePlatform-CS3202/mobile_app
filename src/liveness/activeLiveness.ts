/**
 * Active Liveness Module
 * Real-time blink detection using ML Kit eye open probability landmarks.
 * Adaptive to low sampling rates (15-30 FPS) and natural eyelid variance.
 */

export interface FrameEyeData {
  timestamp?: number; // Milliseconds timestamp (e.g. Date.now())
  leftEyeOpenProbability?: number | null;
  rightEyeOpenProbability?: number | null;
}

export interface ActiveLivenessConfig {
  /** Maximum number of frames to keep in the sliding buffer. Default: 20 */
  bufferSize?: number;
  /** Eye openness threshold below which an eye is considered closed or dipping. Default: 0.45 */
  closedThreshold?: number;
  /** Eye openness threshold above which an eye is considered open. Default: 0.60 */
  openThreshold?: number;
  /** Minimum relative drop from recent baseline to qualify as a blink dip. Default: 0.22 */
  relativeDropThreshold?: number;
  /** Minimum duration (in ms) for a valid blink window. Default: 40ms */
  minWindowMs?: number;
  /** Maximum duration (in ms) for a valid blink window. Default: 1200ms */
  maxWindowMs?: number;
}

export interface BlinkDetectionResult {
  blinkDetected: boolean;
  timestamp?: number;
  durationMs?: number;
  leftProbability?: number;
  rightProbability?: number;
  avgProbability?: number;
  minProbability?: number;
  baselineOpenness?: number;
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
 * Calculates minimum eye openness from available eye probabilities.
 */
export function getMinEyeOpenness(frame: FrameEyeData): number | null {
  const leftValid = typeof frame.leftEyeOpenProbability === 'number' && !isNaN(frame.leftEyeOpenProbability);
  const rightValid = typeof frame.rightEyeOpenProbability === 'number' && !isNaN(frame.rightEyeOpenProbability);

  if (leftValid && rightValid) {
    return Math.min(frame.leftEyeOpenProbability!, frame.rightEyeOpenProbability!);
  } else if (leftValid) {
    return frame.leftEyeOpenProbability!;
  } else if (rightValid) {
    return frame.rightEyeOpenProbability!;
  }
  return null;
}

interface BufferedFrame extends FrameEyeData {
  timestamp: number;
  avgOpenness: number;
  minOpenness: number;
}

/**
 * Stateful Active Liveness Detector that maintains a sliding frame buffer.
 * Supports adaptive baseline tracking and delta dip detection for natural 15Hz blinks.
 */
export class ActiveLivenessDetector {
  private bufferSize: number;
  private closedThreshold: number;
  private openThreshold: number;
  private relativeDropThreshold: number;
  private minWindowMs: number;
  private maxWindowMs: number;

  private frameBuffer: BufferedFrame[] = [];
  private listeners: BlinkListener[] = [];
  private lastBlinkTimestamp: number = 0;

  constructor(config?: ActiveLivenessConfig) {
    this.bufferSize = config?.bufferSize ?? 20;
    this.closedThreshold = config?.closedThreshold ?? 0.45;
    this.openThreshold = config?.openThreshold ?? 0.60;
    this.relativeDropThreshold = config?.relativeDropThreshold ?? 0.22;
    this.minWindowMs = config?.minWindowMs ?? 40;
    this.maxWindowMs = config?.maxWindowMs ?? 1200;
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
   * Returns latest metrics for UI visual indicators.
   */
  public getLatestMetrics(): {
    currentOpenness: number | null;
    minOpenness: number | null;
    isDipping: boolean;
  } {
    if (this.frameBuffer.length === 0) {
      return { currentOpenness: null, minOpenness: null, isDipping: false };
    }
    const latest = this.frameBuffer[this.frameBuffer.length - 1];
    const isDipping = latest.avgOpenness < this.closedThreshold || latest.minOpenness < this.closedThreshold;
    return {
      currentOpenness: latest.avgOpenness,
      minOpenness: latest.minOpenness,
      isDipping,
    };
  }

  /**
   * Processes a single frame with ML Kit eye open probability landmarks.
   */
  public processFrame(frame: FrameEyeData): BlinkDetectionResult {
    const avgOpenness = getAverageEyeOpenness(frame);
    const minOpenness = getMinEyeOpenness(frame);

    if (avgOpenness === null || minOpenness === null) {
      return { blinkDetected: false };
    }

    const timestamp = frame.timestamp ?? Date.now();
    const frameWithAvg: BufferedFrame = {
      ...frame,
      timestamp,
      avgOpenness,
      minOpenness,
    };

    // Maintain sliding frame buffer up to bufferSize
    this.frameBuffer.push(frameWithAvg);
    if (this.frameBuffer.length > this.bufferSize) {
      this.frameBuffer.shift();
    }

    // Attempt to evaluate blink state on the buffer
    const blinkResult = this.evaluateBlinkSequence();

    if (blinkResult.blinkDetected && blinkResult.timestamp) {
      // Prevent re-triggering for the exact same timestamp or within 800ms
      if (blinkResult.timestamp - this.lastBlinkTimestamp > 800) {
        this.lastBlinkTimestamp = blinkResult.timestamp;
        
        console.log(`[Liveness] Blink detected! Timestamp: ${blinkResult.timestamp}, duration: ${blinkResult.durationMs}ms, avg: ${blinkResult.avgProbability?.toFixed(2)}`);
        
        // Notify listeners
        for (const listener of this.listeners) {
          listener(blinkResult);
        }
      } else {
        return { blinkDetected: false };
      }
    }

    return blinkResult;
  }

  /**
   * Evaluates the sliding frame buffer for a natural blink event.
   * Accommodates 15 FPS to 30 FPS sampling rates:
   * 1. Eye starts open (avg >= openThreshold OR >= 0.55)
   * 2. Eye dips below closedThreshold (0.45) OR experiences relative drop >= relativeDropThreshold (0.22)
   * 3. Eye recovers above open threshold with clear rebound (>= trough + 0.18)
   * 4. Temporal duration falls within minWindowMs..maxWindowMs (40ms - 1200ms)
   */
  private evaluateBlinkSequence(): BlinkDetectionResult {
    const buffer = this.frameBuffer;
    if (buffer.length < 3) {
      return { blinkDetected: false };
    }

    const latestFrame = buffer[buffer.length - 1];

    // Current frame must have recovered to an open state
    const isCurrentlyOpen =
      latestFrame.avgOpenness >= this.openThreshold || latestFrame.avgOpenness >= 0.55;
    if (!isCurrentlyOpen) {
      return { blinkDetected: false };
    }

    // Step 1: Look backward for the deepest trough (eye dip / closure)
    let troughIndex = -1;
    let minVal = 999;
    for (let i = buffer.length - 2; i >= 0; i--) {
      const isDip =
        buffer[i].avgOpenness < this.closedThreshold ||
        buffer[i].minOpenness < this.closedThreshold;
      if (isDip && buffer[i].avgOpenness < minVal) {
        minVal = buffer[i].avgOpenness;
        troughIndex = i;
      }
    }

    // Step 2: If no absolute dip below closedThreshold, check for a relative drop >= relativeDropThreshold
    if (troughIndex === -1) {
      for (let i = buffer.length - 2; i >= 1; i--) {
        for (let j = i - 1; j >= 0; j--) {
          if (buffer[j].avgOpenness - buffer[i].avgOpenness >= this.relativeDropThreshold) {
            troughIndex = i;
            break;
          }
        }
        if (troughIndex !== -1) break;
      }
    }

    if (troughIndex === -1) {
      return { blinkDetected: false };
    }

    const troughFrame = buffer[troughIndex];

    // Step 3: Look backward prior to troughIndex for an open frame
    let openIndex = -1;
    for (let i = troughIndex - 1; i >= 0; i--) {
      const isOpen =
        buffer[i].avgOpenness >= this.openThreshold || buffer[i].avgOpenness >= 0.55;
      const isHigherThanTrough = buffer[i].avgOpenness >= troughFrame.avgOpenness + 0.18;
      if (isOpen && isHigherThanTrough) {
        openIndex = i;
        break;
      }
    }

    if (openIndex === -1) {
      return { blinkDetected: false };
    }

    const openFrame = buffer[openIndex];
    const recoveryFrame = latestFrame;

    // Step 4: Validate clear rebound (recovery must be significantly higher than trough)
    if (recoveryFrame.avgOpenness < troughFrame.avgOpenness + 0.18) {
      return { blinkDetected: false };
    }

    // Step 5: Temporal duration window
    const totalDurationMs = recoveryFrame.timestamp - openFrame.timestamp;
    const troughToRecoveryMs = recoveryFrame.timestamp - troughFrame.timestamp;

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
        minProbability: recoveryFrame.minOpenness,
        baselineOpenness: openFrame.avgOpenness,
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

