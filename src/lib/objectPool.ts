/**
 * Object Pool for performance optimization
 * Reuses objects instead of creating/destroying them constantly
 */

export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;

  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize: number = 50, maxSize: number = 200) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    
    // Pre-allocate initial objects
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }

  /**
   * Get an object from the pool or create a new one
   */
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  /**
   * Return an object to the pool for reuse
   */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }

  /**
   * Release multiple objects at once
   */
  releaseAll(objects: T[]): void {
    objects.forEach(obj => this.release(obj));
  }

  /**
   * Get current pool size
   */
  getSize(): number {
    return this.pool.length;
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
  }
}

/**
 * Spatial partitioning grid for efficient collision detection
 */
export class SpatialGrid<T extends { position: { x: number; y: number } }> {
  private cellSize: number;
  private grid: Map<string, T[]>;
  private width: number;
  private height: number;

  constructor(cellSize: number, width: number, height: number) {
    this.cellSize = cellSize;
    this.width = width;
    this.height = height;
    this.grid = new Map();
  }

  /**
   * Get grid cell key for a position
   */
  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  /**
   * Insert object into grid
   */
  insert(obj: T): void {
    const key = this.getCellKey(obj.position.x, obj.position.y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(obj);
  }

  /**
   * Get all objects in cells near a position
   */
  getNearby(x: number, y: number, radius: number): T[] {
    const nearby: T[] = [];
    const cellsToCheck = Math.ceil(radius / this.cellSize);
    const centerCellX = Math.floor(x / this.cellSize);
    const centerCellY = Math.floor(y / this.cellSize);

    for (let dx = -cellsToCheck; dx <= cellsToCheck; dx++) {
      for (let dy = -cellsToCheck; dy <= cellsToCheck; dy++) {
        const key = `${centerCellX + dx},${centerCellY + dy}`;
        const cell = this.grid.get(key);
        if (cell) {
          nearby.push(...cell);
        }
      }
    }

    return nearby;
  }

  /**
   * Clear the grid
   */
  clear(): void {
    this.grid.clear();
  }

  /**
   * Rebuild grid with new objects
   */
  rebuild(objects: T[]): void {
    this.clear();
    objects.forEach(obj => this.insert(obj));
  }
}

/**
 * Simple cache for storing computed values
 */
export class ComputeCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }>;
  private ttl: number; // Time to live in milliseconds

  constructor(ttl: number = 1000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  /**
   * Get value from cache or compute it
   */
  get(key: K, computeFn: () => V): V {
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && now - cached.timestamp < this.ttl) {
      return cached.value;
    }

    const value = computeFn();
    this.cache.set(key, { value, timestamp: now });
    return value;
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: K): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
