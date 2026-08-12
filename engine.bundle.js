/**
 * AimSens Touch Engine - Standalone Engine Bundle (IIFE)
 * Self-contained build combining TouchEngine core and hardware sync routines.
 */
(function (global) {
  'use strict';

  class TouchEngine {
    constructor(options = {}) {
      this.config = {
        sensitivityMode: options.sensitivityMode || 'bezier',
        baseSensitivity: options.baseSensitivity !== undefined ? options.baseSensitivity : 1.0,
        bezierP1x: options.bezierP1x !== undefined ? options.bezierP1x : 0.42,
        bezierP1y: options.bezierP1y !== undefined ? options.bezierP1y : 0.05,
        bezierP2x: options.bezierP2x !== undefined ? options.bezierP2x : 0.58,
        bezierP2y: options.bezierP2y !== undefined ? options.bezierP2y : 0.95,
        maxVelocity: options.maxVelocity !== undefined ? options.maxVelocity : 4.5,
        smoothingAlpha: options.smoothingAlpha !== undefined ? options.smoothingAlpha : 0.72,
        touchSamplingRateHz: 180,
        displayRefreshRateHz: 60,
        useNativePlugin: options.useNativePlugin || false
      };

      this.lastRawX = null;
      this.lastRawY = null;
      this.lastTime = null;
      this.filteredX = null;
      this.filteredY = null;
      this.smoothedVelocity = 0;
      this.accumulatedDeltaX = 0;
      this.accumulatedDeltaY = 0;

      this.metrics = {
        eventCount: 0,
        sampleRateHz: 0,
        renderFps: 0,
        lastRawVelocity: 0,
        lastAppliedVelocity: 0,
        lastMultiplier: 1.0
      };

      this.sampleHistory = [];
      this.frameHistory = [];
      this.callbacks = [];
      this.isTracking = false;
      this.activePointerId = null;
      this.targetElement = null;
      this._rafId = null;
    }

    evaluateBezier(x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;

      const p1x = this.config.bezierP1x;
      const p1y = this.config.bezierP1y;
      const p2x = this.config.bezierP2x;
      const p2y = this.config.bezierP2y;

      const sampleCurveX = (t) => 3 * Math.pow(1 - t, 2) * t * p1x + 3 * (1 - t) * Math.pow(t, 2) * p2x + Math.pow(t, 3);
      const sampleCurveY = (t) => 3 * Math.pow(1 - t, 2) * t * p1y + 3 * (1 - t) * Math.pow(t, 2) * p2y + Math.pow(t, 3);
      const sampleCurveDerivativeX = (t) => 3 * Math.pow(1 - t, 2) * p1x + 6 * (1 - t) * t * (p2x - p1x) + 3 * Math.pow(t, 2) * (1 - p2x);

      let t = x;
      for (let i = 0; i < 8; i++) {
        const xEst = sampleCurveX(t) - x;
        if (Math.abs(xEst) < 1e-5) break;
        const dX = sampleCurveDerivativeX(t);
        if (Math.abs(dX) < 1e-6) break;
        t = t - xEst / dX;
      }
      return sampleCurveY(Math.max(0, Math.min(1, t)));
    }

    calculateMultiplier(velocity) {
      if (this.config.sensitivityMode === 'linear') {
        return this.config.baseSensitivity;
      }
      const normVel = Math.min(velocity / this.config.maxVelocity, 1.0);
      const bezierFactor = this.evaluateBezier(normVel);
      return (0.35 + (2.25 - 0.35) * bezierFactor) * this.config.baseSensitivity;
    }

    processRawInput(x, y, timeMs) {
      const now = timeMs || performance.now();
      if (this.lastTime === null || (now - this.lastTime) > 120) {
        this.lastRawX = x;
        this.lastRawY = y;
        this.filteredX = x;
        this.filteredY = y;
        this.lastTime = now;
        return;
      }

      const dt = Math.max(now - this.lastTime, 1.0);
      const rawDx = x - this.lastRawX;
      const rawDy = y - this.lastRawY;
      const rawVelocity = Math.hypot(rawDx, rawDy) / dt;

      this.lastRawX = x;
      this.lastRawY = y;
      this.lastTime = now;

      const alpha = Math.min(Math.max(this.config.smoothingAlpha, 0.05), 1.0);
      this.filteredX = alpha * x + (1 - alpha) * this.filteredX;
      this.filteredY = alpha * y + (1 - alpha) * this.filteredY;

      const cappedVelocity = Math.min(rawVelocity, this.config.maxVelocity);
      const mult = this.calculateMultiplier(cappedVelocity);

      this.accumulatedDeltaX += rawDx * mult;
      this.accumulatedDeltaY += rawDy * mult;

      this.metrics.lastRawVelocity = rawVelocity;
      this.metrics.lastAppliedVelocity = cappedVelocity;
      this.metrics.lastMultiplier = mult;
      this.metrics.eventCount++;

      this.sampleHistory.push(now);
      if (this.sampleHistory.length > 60) this.sampleHistory.shift();
      if (this.sampleHistory.length > 1) {
        const durationSec = (this.sampleHistory[this.sampleHistory.length - 1] - this.sampleHistory[0]) / 1000;
        if (durationSec > 0) {
          this.metrics.sampleRateHz = Math.round((this.sampleHistory.length - 1) / durationSec);
        }
      }
    }

    handlePointerMove(event) {
      if (!this.isTracking || event.pointerId !== this.activePointerId) return;
      const coalesced = (typeof event.getCoalescedEvents === 'function') ? event.getCoalescedEvents() : [event];
      for (let i = 0; i < coalesced.length; i++) {
        this.processRawInput(coalesced[i].clientX, coalesced[i].clientY, coalesced[i].timeStamp || performance.now());
      }
    }

    attach(element) {
      this.targetElement = element;
      element.style.touchAction = 'none';

      const onDown = (e) => {
        this.isTracking = true;
        this.activePointerId = e.pointerId;
        try { element.setPointerCapture(e.pointerId); } catch (err) {}
        this.lastTime = null;
        this.processRawInput(e.clientX, e.clientY, e.timeStamp || performance.now());
      };

      const onMove = (e) => this.handlePointerMove(e);

      const onUp = (e) => {
        if (e.pointerId === this.activePointerId) {
          this.isTracking = false;
          this.activePointerId = null;
          try { element.releasePointerCapture(e.pointerId); } catch (err) {}
        }
      };

      element.addEventListener('pointerdown', onDown, { passive: true });
      element.addEventListener('pointermove', onMove, { passive: true });
      element.addEventListener('pointerup', onUp, { passive: true });
      element.addEventListener('pointercancel', onUp, { passive: true });

      this.startFrameLoop();
    }

    startFrameLoop() {
      const loop = (now) => {
        this.frameHistory.push(now);
        if (this.frameHistory.length > 30) this.frameHistory.shift();
        if (this.frameHistory.length > 1) {
          const sec = (now - this.frameHistory[0]) / 1000;
          if (sec > 0) this.metrics.renderFps = Math.round((this.frameHistory.length - 1) / sec);
        }

        if (this.accumulatedDeltaX !== 0 || this.accumulatedDeltaY !== 0) {
          const dx = this.accumulatedDeltaX;
          const dy = this.accumulatedDeltaY;
          this.accumulatedDeltaX = 0;
          this.accumulatedDeltaY = 0;
          for (const cb of this.callbacks) cb(dx, dy, this.metrics);
        }

        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    }

    onDelta(callback) { this.callbacks.push(callback); }
    updateConfig(newConfig) { Object.assign(this.config, newConfig); }
  }

  global.TouchEngine = TouchEngine;
})(typeof window !== 'undefined' ? window : this);
