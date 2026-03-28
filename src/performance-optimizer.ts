import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash: string;
}

export interface PerformanceMetrics {
  scanDuration: number;
  filesScanned: number;
  cacheHits: number;
  cacheMisses: number;
}

export class PerformanceOptimizer {
  private cache: Map<string, CacheEntry<any>>;
  private cacheDir: string;
  private maxCacheAge: number; // milliseconds
  private metrics: PerformanceMetrics;

  constructor(cacheDir: string = '.repo-lens-cache', maxCacheAgeMinutes: number = 60) {
    this.cache = new Map();
    this.cacheDir = cacheDir;
    this.maxCacheAge = maxCacheAgeMinutes * 60 * 1000;
    this.metrics = {
      scanDuration: 0,
      filesScanned: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  // Initialize cache directory
  initCache(repoPath: string) {
    const cachePath = path.join(repoPath, this.cacheDir);
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
    }
    this.loadCacheFromDisk(cachePath);
  }

  // Load cache from disk
  private loadCacheFromDisk(cachePath: string) {
    try {
      const cacheFile = path.join(cachePath, 'cache.json');
      if (fs.existsSync(cacheFile)) {
        const data = fs.readFileSync(cacheFile, 'utf-8');
        const entries = JSON.parse(data);
        
        // Load into memory cache
        for (const [key, entry] of Object.entries(entries)) {
          // Only load if not expired
          const age = Date.now() - (entry as any).timestamp;
          if (age < this.maxCacheAge) {
            this.cache.set(key, entry as any);
          }
        }
        
        console.error(`[repository-analyzer-mcp] Loaded ${this.cache.size} cached entries`);
      }
    } catch (error) {
      console.error('Error loading cache:', error);
    }
  }

  // Save cache to disk
  saveCacheToDisk(repoPath: string) {
    try {
      const cachePath = path.join(repoPath, this.cacheDir);
      if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(cachePath, { recursive: true });
      }

      const cacheFile = path.join(cachePath, 'cache.json');
      const entries = Object.fromEntries(this.cache);
      fs.writeFileSync(cacheFile, JSON.stringify(entries, null, 2));
      
      console.error(`[repository-analyzer-mcp] Saved ${this.cache.size} cache entries`);
    } catch (error) {
      console.error('Error saving cache:', error);
    }
  }

  // Get file hash for change detection
  private getFileHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return '';
    }
  }

  // Check if file has changed since last scan
  hasFileChanged(filePath: string): boolean {
    const cacheKey = `file:${filePath}`;
    const cached = this.cache.get(cacheKey);
    
    if (!cached) {
      return true; // No cache, consider changed
    }

    const currentHash = this.getFileHash(filePath);
    return currentHash !== cached.hash;
  }

  // Get cached result if available and valid
  getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    
    if (!cached) {
      this.metrics.cacheMisses++;
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.timestamp;
    if (age > this.maxCacheAge) {
      this.cache.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    this.metrics.cacheHits++;
    return cached.data as T;
  }

  // Set cache entry
  setCached<T>(key: string, data: T, filePath?: string) {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      hash: filePath ? this.getFileHash(filePath) : '',
    };
    
    this.cache.set(key, entry);
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    console.error('[repository-analyzer-mcp] Cache cleared');
  }

  // Clear expired cache entries
  clearExpiredCache() {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.maxCacheAge) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.error(`[repository-analyzer-mcp] Cleared ${cleared} expired cache entries`);
    }
  }

  // Get performance metrics
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  // Reset metrics
  resetMetrics() {
    this.metrics = {
      scanDuration: 0,
      filesScanned: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  // Measure execution time
  async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    this.metrics.scanDuration += duration;
    return { result, duration };
  }

  // Parallel file processing
  async processFilesInParallel<T>(
    files: string[],
    processor: (file: string) => Promise<T>,
    concurrency: number = 10
  ): Promise<T[]> {
    const results: T[] = [];
    const chunks: string[][] = [];

    // Split files into chunks
    for (let i = 0; i < files.length; i += concurrency) {
      chunks.push(files.slice(i, i + concurrency));
    }

    // Process chunks in parallel
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(processor));
      results.push(...chunkResults);
      this.metrics.filesScanned += chunk.length;
    }

    return results;
  }

  // Incremental scan - only process changed files
  getChangedFiles(repoPath: string, extensions: string[]): string[] {
    const changedFiles: string[] = [];
    
    const scanDir = (dir: string) => {
      const skipDirs = ['node_modules', 'dist', 'build', 'target', '.git', 'venv', '__pycache__'];
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !skipDirs.includes(entry.name)) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext) && this.hasFileChanged(fullPath)) {
              changedFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    scanDir(repoPath);
    return changedFiles;
  }

  // Memory optimization - process files in batches
  async processBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize: number = 100
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);

      // Allow garbage collection between batches
      if (global.gc) {
        global.gc();
      }
    }

    return results;
  }

  // Get cache statistics
  getCacheStats() {
    const now = Date.now();
    let expired = 0;
    let valid = 0;

    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      if (age > this.maxCacheAge) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries: valid,
      expiredEntries: expired,
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
      ...this.metrics,
    };
  }

  // Format performance report
  formatPerformanceReport(): string {
    const stats = this.getCacheStats();
    
    let output = '⚡ Performance Report\n\n';
    output += `Scan Duration: ${(stats.scanDuration / 1000).toFixed(2)}s\n`;
    output += `Files Scanned: ${stats.filesScanned}\n`;
    output += `Cache Hits: ${stats.cacheHits}\n`;
    output += `Cache Misses: ${stats.cacheMisses}\n`;
    output += `Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%\n\n`;
    
    output += `Cache Statistics:\n`;
    output += `  Total Entries: ${stats.totalEntries}\n`;
    output += `  Valid Entries: ${stats.validEntries}\n`;
    output += `  Expired Entries: ${stats.expiredEntries}\n\n`;

    if (stats.cacheHitRate > 0.7) {
      output += '✅ Excellent cache performance!\n';
    } else if (stats.cacheHitRate > 0.4) {
      output += '⚠️  Moderate cache performance\n';
    } else {
      output += '❌ Low cache hit rate - consider increasing cache duration\n';
    }

    return output;
  }
}

// Global performance optimizer instance
let globalOptimizer: PerformanceOptimizer | null = null;

export function getPerformanceOptimizer(): PerformanceOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new PerformanceOptimizer();
  }
  return globalOptimizer;
}
