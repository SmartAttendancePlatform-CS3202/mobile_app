/**
 * Liveness State Machine Module
 * Deterministic state machine managing states:
 * IDLE -> FACE_DETECTED -> BLINK_VERIFIED -> PASSIVE_LIVENESS_PASSED -> EMBEDDING_READY
 */

export type LivenessState =
  | 'IDLE'
  | 'FACE_DETECTED'
  | 'BLINK_VERIFIED'
  | 'PASSIVE_LIVENESS_PASSED'
  | 'EMBEDDING_READY'
  | 'FAILED'
  | 'TIMEOUT';

export interface TransitionEvent {
  from: LivenessState;
  to: LivenessState;
  timestamp: number;
  elapsedTimeMs: number;
  payload?: any;
}

export type StateChangeListener = (event: TransitionEvent) => void;

export interface StateMachineConfig {
  /** Timeout duration (in ms) for intermediate states before transitioning to TIMEOUT. Default: 10000ms */
  timeoutMs?: number;
}

export interface StateStatusExport {
  currentState: LivenessState;
  timestamp: number;
  elapsedTimeMs: number;
  isComplete: boolean;
  hasFailed: boolean;
  history: TransitionEvent[];
  lastPayload?: any;
}

/** Valid deterministic state transitions mapping */
const ALLOWED_TRANSITIONS: Record<LivenessState, LivenessState[]> = {
  IDLE: ['FACE_DETECTED'],
  FACE_DETECTED: ['BLINK_VERIFIED', 'FAILED', 'TIMEOUT', 'IDLE'],
  BLINK_VERIFIED: ['PASSIVE_LIVENESS_PASSED', 'FAILED', 'TIMEOUT', 'IDLE'],
  PASSIVE_LIVENESS_PASSED: ['EMBEDDING_READY', 'FAILED', 'TIMEOUT', 'IDLE'],
  EMBEDDING_READY: ['IDLE'],
  FAILED: ['IDLE', 'FACE_DETECTED'],
  TIMEOUT: ['IDLE', 'FACE_DETECTED'],
};

export class LivenessStateMachine {
  private currentState: LivenessState = 'IDLE';
  private startTime: number = Date.now();
  private lastStateTime: number = Date.now();
  private timeoutMs: number;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private listeners: StateChangeListener[] = [];
  private history: TransitionEvent[] = [];
  private lastPayload: any = undefined;

  constructor(config?: StateMachineConfig) {
    this.timeoutMs = config?.timeoutMs ?? 10000;
  }

  /**
   * Returns current state.
   */
  public getState(): LivenessState {
    return this.currentState;
  }

  /**
   * Exports full state status details.
   */
  public getStatus(): StateStatusExport {
    const now = Date.now();
    return {
      currentState: this.currentState,
      timestamp: now,
      elapsedTimeMs: now - this.startTime,
      isComplete: this.currentState === 'EMBEDDING_READY',
      hasFailed: this.currentState === 'FAILED' || this.currentState === 'TIMEOUT',
      history: [...this.history],
      lastPayload: this.lastPayload,
    };
  }

  /**
   * Subscribe a listener to state transition events.
   */
  public onStateChange(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Checks if transition to target state is valid from current state.
   */
  public canTransitionTo(nextState: LivenessState): boolean {
    const allowed = ALLOWED_TRANSITIONS[this.currentState];
    return allowed ? allowed.includes(nextState) : false;
  }

  /**
   * Deterministically transitions to nextState if allowed.
   */
  public transitionTo(nextState: LivenessState, payload?: any): boolean {
    if (!this.canTransitionTo(nextState)) {
      console.warn(
        `[LivenessStateMachine] Invalid transition attempt from ${this.currentState} to ${nextState}`
      );
      return false;
    }

    const now = Date.now();
    const elapsedTimeMs = now - this.lastStateTime;
    const previousState = this.currentState;

    // Clear active timeout timer
    this.clearTimeoutTimer();

    // Perform state transition
    this.currentState = nextState;
    this.lastStateTime = now;
    this.lastPayload = payload;

    const event: TransitionEvent = {
      from: previousState,
      to: nextState,
      timestamp: now,
      elapsedTimeMs,
      payload,
    };

    this.history.push(event);
    console.log(`[LivenessStateMachine] Transitioned from ${previousState} -> ${nextState}`);

    // Set timeout timer for intermediate active states
    if (
      nextState === 'FACE_DETECTED' ||
      nextState === 'BLINK_VERIFIED' ||
      nextState === 'PASSIVE_LIVENESS_PASSED'
    ) {
      this.startTimeoutTimer();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[LivenessStateMachine] Error in state listener:', err);
      }
    }

    return true;
  }

  /**
   * Resets the state machine back to IDLE.
   */
  public reset(): void {
    this.clearTimeoutTimer();
    const previousState = this.currentState;
    this.currentState = 'IDLE';
    this.startTime = Date.now();
    this.lastStateTime = Date.now();
    this.lastPayload = undefined;

    if (previousState !== 'IDLE') {
      const event: TransitionEvent = {
        from: previousState,
        to: 'IDLE',
        timestamp: Date.now(),
        elapsedTimeMs: 0,
      };
      this.history.push(event);
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error('[LivenessStateMachine] Error in state listener:', err);
        }
      }
    }
  }

  // --- Convenience transition methods ---

  public handleFaceDetected(payload?: any): boolean {
    return this.transitionTo('FACE_DETECTED', payload);
  }

  public handleBlinkVerified(payload?: any): boolean {
    return this.transitionTo('BLINK_VERIFIED', payload);
  }

  public handlePassiveLivenessPassed(payload?: any): boolean {
    return this.transitionTo('PASSIVE_LIVENESS_PASSED', payload);
  }

  public handleEmbeddingReady(payload?: any): boolean {
    return this.transitionTo('EMBEDDING_READY', payload);
  }

  public handleFailure(reason?: string, payload?: any): boolean {
    return this.transitionTo('FAILED', { reason, ...payload });
  }

  // --- Timeout Timer Helpers ---

  private startTimeoutTimer(): void {
    this.clearTimeoutTimer();
    this.timerId = setTimeout(() => {
      console.warn(`[LivenessStateMachine] Timeout reached in state ${this.currentState}`);
      this.transitionTo('TIMEOUT', { reason: 'State timeout exceeded' });
    }, this.timeoutMs);
  }

  private clearTimeoutTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
