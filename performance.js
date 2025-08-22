// Performance monitoring utility for optimization tracking
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    // Only enable in development mode or when explicitly requested
    this.enabled = (typeof window !== 'undefined' && 
                   (window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    window.location.search.includes('debug=true'))) ? false : false; // Default disabled
  }
  
  startTimer(name) {
    if (!this.enabled) return;
    this.metrics.set(name + '_start', performance.now());
  }
  
  endTimer(name) {
    if (!this.enabled) return;
    const start = this.metrics.get(name + '_start');
    if (start) {
      const duration = performance.now() - start;
      const existing = this.metrics.get(name) || [];
      existing.push(duration);
      this.metrics.set(name, existing);
      this.metrics.delete(name + '_start');
      
      // Log if operation took too long
      if (duration > 100) {
        console.warn(`Performance: ${name} took ${duration.toFixed(2)}ms`);
      }
    }
  }
  
  getAverageTime(name) {
    const times = this.metrics.get(name) || [];
    if (times.length === 0) return 0;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }
  
  getReport() {
    const report = {};
    for (const [key, values] of this.metrics.entries()) {
      if (Array.isArray(values)) {
        report[key] = {
          count: values.length,
          average: this.getAverageTime(key),
          min: Math.min(...values),
          max: Math.max(...values)
        };
      }
    }
    return report;
  }
  
  clear() {
    this.metrics.clear();
  }
  
  enable() {
    this.enabled = true;
    console.log('Performance monitoring enabled');
  }
  
  disable() {
    this.enabled = false;
  }
}

// Global performance monitor instance
export const perfMonitor = new PerformanceMonitor();

// Utility function to wrap expensive operations
export function measurePerformance(name, fn) {
  perfMonitor.startTimer(name);
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => perfMonitor.endTimer(name));
    } else {
      perfMonitor.endTimer(name);
      return result;
    }
  } catch (error) {
    perfMonitor.endTimer(name);
    throw error;
  }
}

// Memory usage tracking
export function getMemoryUsage() {
  if (performance.memory) {
    return {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB',
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
    };
  }
  return null;
}

// Frame rate monitoring
export class FPSMonitor {
  constructor() {
    this.frames = [];
    this.lastTime = performance.now();
  }
  
  tick() {
    const now = performance.now();
    this.frames.push(now);
    
    // Keep only last second of frames
    while (this.frames.length > 0 && this.frames[0] <= now - 1000) {
      this.frames.shift();
    }
    
    this.lastTime = now;
    return this.frames.length;
  }
  
  getFPS() {
    return this.frames.length;
  }
}