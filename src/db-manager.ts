import { createRequire } from 'module';
import path from 'path';
import { Dependency, Module } from './types.js';
import type { Database } from 'better-sqlite3';

const require = createRequire(import.meta.url);
const DatabaseConstructor: new (filename: string, options?: any) => Database = require('better-sqlite3');

export class DBManager {
  private db: Database;
  private dbPath: string;

  constructor(repoPath: string) {
    // Store .repo-lens.db in the repo root
    this.dbPath = path.join(repoPath, '.repo-lens.db');
    this.db = new DatabaseConstructor(this.dbPath);
    this.initSchema();
  }

  private initSchema() {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        ecosystem TEXT NOT NULL,
        type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_id TEXT NOT NULL,
        dep_name TEXT NOT NULL,
        dep_version TEXT,
        is_dev INTEGER DEFAULT 0,
        ecosystem TEXT NOT NULL,
        FOREIGN KEY (module_id) REFERENCES modules(id)
      );

      CREATE INDEX IF NOT EXISTS idx_module_id ON dependencies(module_id);
      CREATE INDEX IF NOT EXISTS idx_dep_name ON dependencies(dep_name);
    `);
  }

  // Store parsed module and its dependencies
  insertModule(module: Module) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO modules (id, path, ecosystem, type) VALUES (?, ?, ?, ?)'
    );
    stmt.run(module.id, module.path, module.ecosystem, module.type);

    // Delete old dependencies for this module
    const deleteStmt = this.db.prepare('DELETE FROM dependencies WHERE module_id = ?');
    deleteStmt.run(module.id);

    const depStmt = this.db.prepare(
      'INSERT INTO dependencies (module_id, dep_name, dep_version, is_dev, ecosystem) VALUES (?, ?, ?, ?, ?)'
    );

    for (const dep of module.dependencies) {
      depStmt.run(
        module.id,
        dep.name,
        dep.version || 'unknown',
        dep.isDev ? 1 : 0,
        dep.ecosystem
      );
    }
  }

  // Get all modules
  getAllModules(): Module[] {
    const stmt = this.db.prepare(`
      SELECT id, path, ecosystem, type FROM modules
    `);
    return stmt.all() as Module[];
  }

  // Get dependencies of a module
  getDependencies(moduleId: string): Dependency[] {
    const stmt = this.db.prepare(`
      SELECT dep_name as name, dep_version as version, ecosystem, is_dev as isDev 
      FROM dependencies WHERE module_id = ?
    `);
    const rows = stmt.all(moduleId) as any[];
    return rows.map(row => ({
      ...row,
      isDev: row.isDev === 1
    }));
  }

  // Find which modules depend on this dependency
  getWhoDepends(depName: string): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT module_id FROM dependencies WHERE dep_name = ?
    `);
    const rows = stmt.all(depName) as { module_id: string }[];
    return rows.map(r => r.module_id);
  }

  // Clear old data before re-scan
  clearAll() {
    this.db.exec('DELETE FROM dependencies; DELETE FROM modules;');
  }

  close() {
    this.db.close();
  }
}
