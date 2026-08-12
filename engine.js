/**
 * AimSens Touch Engine v1.0
 * Low-Latency Touch Sensitivity Engine using Cubic Bézier Curves & Noise Filtering
 * Optimized for Oppo A58 (180Hz Touch Sampling / 60Hz Refresh Rate / Helio G85)
 */

class TouchEngine {
  constructor(options = {}) {
    // Default Configuration
    this.config = {
      sensitivityMode: options.sensitivityMode || 'bezier', // 'bezier' or 'linear'
      baseSensitivity: options.baseSensitivity !== undefined ? options.baseSensitivity : 1.0,
      
      // Cubic Bézier Control Points: P0=(0,0), P1=(cx1, cy1), P2=(cx2, cy2), P3=(1,1)
      // Controls non-linear response: slow drag -> fine precision, fast drag -> acceleration sweep
      bezierP1x: options.bezierP1x !== undefined ? options.bezierP1x : 0.42,
      bezierP1y: options.bezierP1y !== undefined ? options.bezierP1y : 0.05,
      bezierP2x: options.bezierP2x !== undefined ? options.bezierP2x : 0.58,
      bezierP2y: options.bezierP2y !== undefined ? options.bezierP2y : 0.95,

      // Velocity Capping (px/ms) to prevent wild runaway spins on sudden hard slides
      maxVelocity: options.maxVelocity !== undefined ? options.maxVelocity : 4.5,
      
      // Noise Filter Smoothing (Exponential Moving Average low-pass)
      // 0.0 = max smoothing (heavy lag), 1.0 = no smoothing (raw sensor jitter)
      // Default 0.72 optimal for Oppo A58 180Hz touch digitizer
      smoothingAlpha: options.smoothingAlpha !== undefined ? options.smoothingAlpha : 0.72,

      // Target Hardware Parameters
      touchSamplingRateHz: 180,
      displayRefreshRateHz: 60,
      
      // Native Plugin Bridge toggle
      useNativePlugin: options.useNativePlugin || false
    };

    // State Variables
    this.lastRawX = null;
    this.lastRawY = null;
    this.lastTime = null;

    this.filteredX = null;
    this.filteredY = null;

    this.smoothedVelocity = 0;
    this.accumulatedDeltaX = 0;
    this.accumulatedDeltaY = 0;

    // Diagnostics / Metrics
    this.metrics = {
      eventCount: 0,
      sampleRateHz: 0,
      renderFps: 0,
      lastRawVelocity: 0,
      lastAppliedVelocity: 0,
      lastMultiplier: 1.0,
      jitterReductionPct: 0
    };

    this.sampleHistory = [];
    this.frameHistory = [];
    this.callbacks = [];

    this.isTracking = false;
    this.activePointerId = null;
    this.targetElement = null;

    this._rafId = null;
    this._lastFrameTime = performance.now();
  }

  /**
   * Evaluates Cubic Bézier y-value for a given x in [0, 1] using Newton-Raphson solver
   */
  evaluateBezier(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    const p1x = this.config.bezierP1x;
    const p1y = this.config.bezierP1y;
    const p2x = this.config.bezierP2x;
    const p2y = this.config.bezierP2y;

    // Helper for parametric X(t)
    const sampleCurveX = (t) => {
      // 3*(1-t)^2 * t * p1x + 3*(1-t) * t^2 * p2x + t^3
      return 3 * Math.pow(1 - t, 2) * t * p1x + 3 * (1 - t) * Math.pow(t, 2) * p2x + Math.pow(t, 3);
    };

    // Helper for parametric Y(t)
    const sampleCurveY = (t) => {
      return 3 * Math.pow(1 - t, 2) * t * p1y + 3 * (1 - t) * Math.pow(t, 2) * p2y + Math.pow(t, 3);
    };

    // Helper for derivative dX/dt
    const sampleCurveDerivativeX = (t) => {
      return 3 * Math.pow(1 - t, 2) * p1x + 6 * (1 - t) * t * (p2x - p1x) + 3 * Math.pow(t, 2) * (1 - p2x);
    };

    // Solve for t corresponding to target x using Newton-Raphson
    let t = x; // initial guess
    for (let i = 0; i < 8; i++) {
      const xEst = sampleCurveX(t) - x;
      if (Math.abs(xEst) < 1e-5) break;
      const dX = sampleCurveDerivativeX(t);
      if (Math.abs(dX) < 1e-6) break;
      t = t - xEst / dX;
    }

    t = Math.max(0, Math.min(1, t));
    return sampleCurveY(t);
  }

  /**
   * Computes non-linear curve dynamic sensitivity multiplier
   */
  calculateMultiplier(velocity) {
    if (this.config.sensitivityMode === 'linear') {
      return this.config.baseSensitivity;
    }

    // Normalize velocity against maxVelocity threshold
    const normVel = Math.min(velocity / this.config.maxVelocity, 1.0);
    
    // Evaluate Bézier curve response factor
    const bezierFactor = this.evaluateBezier(normVel);

    // Dynamic curve map: maps factor to range [0.3x, 2.5x] scaling around baseSensitivity
    // Slow drag (normVel ~ 0.05) -> fine control ~0.35x
    // Fast sweep (normVel ~ 0.9)  -> quick acceleration ~2.2x
    const minScale = 0.35;
    const maxScale = 2.25;
    const dynamicMultiplier = (minScale + (maxScale - minScale) * bezierFactor) * this.config.baseSensitivity;

    return dynamicMultiplier;
  }

  /**
   * Process raw coordinate reading (x, y, timestamp)
   */
  processRawInput(x, y, timeMs) {
    const now = timeMs || performance.now();

    // Reset baseline if new stroke or stalled input
    if (this.lastTime === null || (now - this.lastTime) > 120) {
      this.lastRawX = x;
      this.lastRawY = y;
      this.filteredX = x;
      this.filteredY = y;
      this.lastTime = now;
      this.smoothedVelocity = 0;
      return;
    }

    const dt = Math.max(now - this.lastTime, 1.0); // ms (avoid division by 0)
    const rawDx = x - this.lastRawX;
    const rawDy = y - this.lastRawY;
    const rawDist = Math.hypot(rawDx, rawDy);
    const rawVelocity = rawDist / dt; // px/ms

    // Update raw input tracking
    this.lastRawX = x;
    this.lastRawY = y;
    this.lastTime = now;

    // Apply Noise Low-Pass Filter (Exponential Moving Average)
    const alpha = Math.min(Math.max(this.config.smoothingAlpha, 0.05), 1.0);
    this.filteredX = alpha * x + (1 - alpha) * this.filteredX;
    this.filteredY = alpha * y + (1 - alpha) * this.filteredY;

    // Calculate velocity cap & dynamic sensitivity multiplier
    const cappedVelocity = Math.min(rawVelocity, this.config.maxVelocity);
    const sensitivityMultiplier = this.calculateMultiplier(cappedVelocity);

    // Compute final dynamic movement deltas
    const smoothDx = rawDx * sensitivityMultiplier;
    const smoothDy = rawDy * sensitivityMultiplier;

    // Accumulate for frame rendering
    this.accumulatedDeltaX += smoothDx;
    this.accumulatedDeltaY += smoothDy;

    // Metrics calculation
    this.metrics.lastRawVelocity = rawVelocity;
    this.metrics.lastAppliedVelocity = cappedVelocity;
    this.metrics.lastMultiplier = sensitivityMultiplier;
    this.metrics.eventCount++;

    // Track touch sampling rate (180Hz target)
    this.sampleHistory.push(now);
    if (this.sampleHistory.length > 60) this.sampleHistory.shift();
    if (this.sampleHistory.length > 1) {
      const durationSec = (this.sampleHistory[this.sampleHistory.length - 1] - this.sampleHistory[0]) / 1000;
      if (durationSec > 0) {
        this.metrics.sampleRateHz = Math.round((this.sampleHistory.length - 1) / durationSec);
      }
    }
  }

  /**
   * Handles low-latency PointerEvent direct touch capture with getCoalescedEvents()
   */
  handlePointerMove(event) {
    if (!this.isTracking || event.pointerId !== this.activePointerId) return;

    // High-precision sub-frame touch capture: Chrome API getCoalescedEvents()
    // Extracts intermediate 180Hz points buffered between 60Hz display frames
    const coalescedEvents = (typeof event.getCoalescedEvents === 'function') 
      ? event.getCoalescedEvents() 
      : [event];

    for (let i = 0; i < coalescedEvents.length; i++) {
      const e = coalescedEvents[i];
      this.processRawInput(e.clientX, e.clientY, e.timeStamp || performance.now());
    }
  }

  /**
   * Bridge endpoint for native Capacitor Kotlin plugin (MotionEvent direct capturing)
   */
  processNativeMotionEvent(payload) {
    // Payload format: { action, points: [{x, y, timestamp, pressure}], historical: [...] }
    if (payload.action === 'down') {
      this.isTracking = true;
      this.lastTime = null;
    }

    if (payload.historical && Array.isArray(payload.historical)) {
      for (const pt of payload.historical) {
        this.processRawInput(pt.x, pt.y, pt.timestamp);
      }
    }

    if (payload.points && Array.isArray(payload.points)) {
      for (const pt of payload.points) {
        this.processRawInput(pt.x, pt.y, pt.timestamp);
      }
    }

    if (payload.action === 'up' || payload.action === 'cancel') {
      this.isTracking = false;
      this.lastTime = null;
    }
  }

  /**
   * Attach pointer event listeners to a target DOM element with low-latency flags
   */
  attach(element) {
    this.targetElement = element;

    // Use touch-action: none to prevent browser default gesture delays
    element.style.touchAction = 'none';

    const onPointerDown = (e) => {
      this.isTracking = true;
      this.activePointerId = e.pointerId;
      try {
        element.setPointerCapture(e.pointerId);
      } catch (err) {
        // Fallback if setPointerCapture is unsupported
      }
      this.lastTime = null;
      this.processRawInput(e.clientX, e.clientY, e.timeStamp || performance.now());
    };

    const onPointerMove = (e) => {
      this.handlePointerMove(e);
    };

    const onPointerUp = (e) => {
      if (e.pointerId === this.activePointerId) {
        this.isTracking = false;
        this.activePointerId = null;
        try {
          element.releasePointerCapture(e.pointerId);
        } catch (err) {}
      }
    };

    element.addEventListener('pointerdown', onPointerDown, { passive: true });
    element.addEventListener('pointermove', onPointerMove, { passive: true });
    element.addEventListener('pointerup', onPointerUp, { passive: true });
    element.addEventListener('pointercancel', onPointerUp, { passive: true });

    this._cleanupListeners = () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
    };

    // Start 60Hz display sync render loop
    this.startFrameLoop();
  }

  detach() {
    if (this._cleanupListeners) {
      this._cleanupListeners();
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
    }
  }

  /**
   * Display Frame Loop: Synchronizes 180Hz touch input deltas to 60Hz screen refresh
   */
  startFrameLoop() {
    const loop = (now) => {
      // Calculate display frame rate
      this.frameHistory.push(now);
      if (this.frameHistory.length > 30) this.frameHistory.shift();
      if (this.frameHistory.length > 1) {
        const frameSec = (now - this.frameHistory[0]) / 1000;
        if (frameSec > 0) {
          this.metrics.renderFps = Math.round((this.frameHistory.length - 1) / frameSec);
        }
      }

      // Dispatch accumulated touch delta if non-zero
      if (this.accumulatedDeltaX !== 0 || this.accumulatedDeltaY !== 0) {
        const dx = this.accumulatedDeltaX;
        const dy = this.accumulatedDeltaY;

        this.accumulatedDeltaX = 0;
        this.accumulatedDeltaY = 0;

        for (const cb of this.callbacks) {
          cb(dx, dy, this.metrics);
        }
      }

      this._rafId = requestAnimationFrame(loop);
    };

    this._rafId = requestAnimationFrame(loop);
  }

  onDelta(callback) {
    this.callbacks.push(callback);
  }

  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
  }
}

// Export for module environments or window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TouchEngine;
} else {
  window.TouchEngine = TouchEngine;
}
