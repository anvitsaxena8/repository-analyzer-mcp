import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DBManager } from './db-manager.js';
import { ASTAnalyzer } from './ast-analyzer.js';

export interface CircularDependency {
  cycle: string[];
  description: string;
}

export interface UnusedDependency {
  package: string;
  version: string;
  declaredIn: string;
  ecosystem: 'npm' | 'maven' | 'pip';
  reason: string;
}

export interface ArchitectureLayer {
  name: string;
  pattern: string;
  files: string[];
  description: string;
}

export interface HotspotFile {
  filePath: string;
  changeCount: number;
  lastModified: Date;
  riskScore: number;
}

export interface RefactorCandidate {
  filePath: string;
  importedBy: number;
  changeCount: number;
  riskScore: number;
  reason: string;
}

export class AdvancedIntelligence {
  constructor(
    private dbManager: DBManager,
    private astAnalyzer: ASTAnalyzer
  ) {}

  // Detect circular dependencies using DFS
  detectCircularDependencies(): CircularDependency[] {
    const cycles: CircularDependency[] = [];
    const modules = this.dbManager.getAllModules();
    const graph = new Map<string, Set<string>>();

    // Build dependency graph
    for (const module of modules) {
      const deps = this.dbManager.getDependencies(module.id);
      graph.set(module.id, new Set(deps.map((d: any) => d.name)));
    }

    // DFS to find cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const currentPath: string[] = [];

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      currentPath.push(node);

      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = currentPath.indexOf(neighbor);
          const cycle = currentPath.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle

          cycles.push({
            cycle,
            description: cycle.join(' → '),
          });
        }
      }

      currentPath.pop();
      recursionStack.delete(node);
      return false;
    };

    // Check all nodes
    for (const module of modules) {
      if (!visited.has(module.id)) {
        dfs(module.id);
      }
    }

    return cycles;
  }

  // Find unused dependencies
  async findUnusedDependencies(repoPath: string): Promise<UnusedDependency[]> {
    const unused: UnusedDependency[] = [];

    // Get all declared dependencies from manifests
    const modules = this.dbManager.getAllModules();

    // Get all actual imports from code
    const astResult = this.astAnalyzer.analyzeAllAST(repoPath);
    const importedPackages = new Set<string>();

    // Extract package names from imports
    for (const imp of astResult.imports) {
      // For npm: extract package name from source
      if (imp.source.startsWith('.') || imp.source.startsWith('/')) {
        continue; // Skip local imports
      }

      // Extract package name (handle scoped packages)
      let pkgName = imp.source;
      if (pkgName.startsWith('@')) {
        // Scoped package: @scope/package
        const parts = pkgName.split('/');
        pkgName = parts.slice(0, 2).join('/');
      } else {
        // Regular package: package or package/subpath
        pkgName = pkgName.split('/')[0];
      }

      importedPackages.add(pkgName);
    }

    // Compare declared vs imported
    for (const module of modules) {
      const deps = this.dbManager.getDependencies(module.id);

      for (const dep of deps) {
        // Skip dev dependencies for now (they might be used in tests/build)
        if ((dep as any).type === 'dev' || (dep as any).isDev) {
          continue;
        }

        // Extract package name from dependency
        let depName = (dep as any).name;
        
        // For Maven: extract artifactId from groupId:artifactId
        if (depName.includes(':')) {
          const parts = depName.split(':');
          depName = parts[parts.length - 1];
        }

        // Check if imported
        let isImported = false;
        for (const imported of importedPackages) {
          if (imported === depName || imported.includes(depName) || depName.includes(imported)) {
            isImported = true;
            break;
          }
        }

        if (!isImported) {
          unused.push({
            package: (dep as any).name,
            version: (dep as any).version,
            declaredIn: module.id,
            ecosystem: module.ecosystem as any,
            reason: 'Declared in manifest but never imported in code',
          });
        }
      }
    }

    return unused;
  }

  // Get architecture summary
  getArchitectureSummary(repoPath: string): ArchitectureLayer[] {
    const layers: ArchitectureLayer[] = [];
    const allFiles: string[] = [];

    // Scan directory structure
    const scanDir = (dir: string, relativePath: string = '') => {
      const skipDirs = ['node_modules', 'dist', 'build', 'target', '.git', 'venv', '__pycache__'];

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.join(relativePath, entry.name);

          if (entry.isDirectory() && !skipDirs.includes(entry.name)) {
            scanDir(fullPath, relPath);
          } else if (entry.isFile()) {
            allFiles.push(relPath);
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    scanDir(repoPath);

    // Detect common architecture patterns
    const patterns = [
      {
        name: 'Controllers',
        pattern: /controller/i,
        description: 'HTTP request handlers and API endpoints',
      },
      {
        name: 'Services',
        pattern: /service/i,
        description: 'Business logic and application services',
      },
      {
        name: 'Repositories',
        pattern: /repository|repo|dao/i,
        description: 'Data access layer and database operations',
      },
      {
        name: 'Models/Entities',
        pattern: /model|entity|dto/i,
        description: 'Data models and domain entities',
      },
      {
        name: 'Utils/Helpers',
        pattern: /util|helper|common/i,
        description: 'Utility functions and helper classes',
      },
      {
        name: 'Config',
        pattern: /config|configuration/i,
        description: 'Application configuration',
      },
      {
        name: 'Middleware',
        pattern: /middleware|interceptor/i,
        description: 'Request/response interceptors',
      },
      {
        name: 'Tests',
        pattern: /test|spec|__tests__/i,
        description: 'Test files and test utilities',
      },
    ];

    // Code file extensions to consider
    const CODE_EXTENSIONS = ['.java', '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.kt'];
    const EXCLUDE_FILES = ['pom.xml', 'package.json', 'tsconfig.json', '.gitignore', '.editorconfig', 
                           'sonar-project.properties', '.repo-lens.db', 'CODEBASE_MEMORY.md', 
                           'WORKSPACE_MEMORY.md'];

    for (const pattern of patterns) {
      const matchingFiles = allFiles.filter(f => {
        const filename = path.basename(f);
        const ext = path.extname(f);
        
        // Must be a code file
        if (!CODE_EXTENSIONS.includes(ext)) return false;
        
        // Must not be in exclude list
        if (EXCLUDE_FILES.includes(filename)) return false;
        
        // Match pattern against filename only, not full path
        return pattern.pattern.test(filename);
      });
      
      if (matchingFiles.length > 0) {
        layers.push({
          name: pattern.name,
          pattern: pattern.pattern.source,
          files: matchingFiles.slice(0, 10), // Limit to 10 examples
          description: pattern.description,
        });
      }
    }

    return layers;
  }

  // Find hotspot files (most frequently changed)
  findHotspotFiles(repoPath: string, limit: number = 20): HotspotFile[] {
    const hotspots: HotspotFile[] = [];

    try {
      // Get file change counts from git log
      const output = execSync(
        'git log --pretty=format: --name-only | sort | uniq -c | sort -rn',
        {
          cwd: repoPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      const lines = output.split('\n').filter(l => l.trim());

      for (const line of lines.slice(0, limit)) {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!match) continue;

        const changeCount = parseInt(match[1]);
        const filePath = match[2];

        // Skip non-code files
        if (!this.isCodeFile(filePath)) continue;

        // Get last modified date
        let lastModified = new Date();
        try {
          const dateOutput = execSync(`git log -1 --format=%ai -- "${filePath}"`, {
            cwd: repoPath,
            encoding: 'utf-8',
          });
          lastModified = new Date(dateOutput.trim());
        } catch {
          // Use current date if git log fails
        }

        // Calculate risk score (higher change count = higher risk)
        const riskScore = Math.min(100, changeCount * 2);

        hotspots.push({
          filePath,
          changeCount,
          lastModified,
          riskScore,
        });
      }
    } catch (error) {
      console.error('Error finding hotspot files:', error);
    }

    return hotspots.sort((a, b) => b.riskScore - a.riskScore);
  }

  // Suggest refactor candidates
  async suggestRefactorCandidates(repoPath: string, limit: number = 10): Promise<RefactorCandidate[]> {
    const candidates: RefactorCandidate[] = [];

    // Get AST analysis to find import counts
    const astResult = this.astAnalyzer.analyzeAllAST(repoPath);

    // Count how many files import each file
    const importCounts = new Map<string, number>();
    for (const imp of astResult.imports) {
      // Track imports of local files
      if (imp.source.startsWith('.') || imp.source.startsWith('/')) {
        importCounts.set(imp.source, (importCounts.get(imp.source) || 0) + 1);
      }
    }

    // Get hotspot files (change frequency)
    const hotspots = this.findHotspotFiles(repoPath, 100);
    const changeCountMap = new Map(hotspots.map(h => [h.filePath, h.changeCount]));

    // Combine metrics
    const fileScores = new Map<string, { imports: number; changes: number }>();

    // Add import counts
    for (const [file, count] of importCounts) {
      fileScores.set(file, { imports: count, changes: 0 });
    }

    // Add change counts
    for (const hotspot of hotspots) {
      const existing = fileScores.get(hotspot.filePath) || { imports: 0, changes: 0 };
      existing.changes = hotspot.changeCount;
      fileScores.set(hotspot.filePath, existing);
    }

    // Calculate refactor scores
    for (const [file, metrics] of fileScores) {
      // Only consider files with both high imports and high changes
      if (metrics.imports >= 3 || metrics.changes >= 10) {
        const riskScore = (metrics.imports * 5) + (metrics.changes * 2);

        let reason = '';
        if (metrics.imports >= 10 && metrics.changes >= 20) {
          reason = 'High coupling (many imports) + High churn (frequent changes)';
        } else if (metrics.imports >= 10) {
          reason = 'High coupling - imported by many modules';
        } else if (metrics.changes >= 20) {
          reason = 'High churn - frequently modified';
        } else {
          reason = 'Moderate coupling and churn';
        }

        candidates.push({
          filePath: file,
          importedBy: metrics.imports,
          changeCount: metrics.changes,
          riskScore,
          reason,
        });
      }
    }

    return candidates
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, limit);
  }

  private isCodeFile(filePath: string): boolean {
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.java', '.py', '.go', '.rs', '.kt', '.scala'];
    const ext = path.extname(filePath);
    return codeExtensions.includes(ext);
  }

  // Format circular dependencies report
  formatCircularDependenciesReport(cycles: CircularDependency[]): string {
    if (cycles.length === 0) {
      return '✅ No circular dependencies detected!\n\nYour dependency graph is acyclic.';
    }

    let output = `⚠️  Circular Dependencies Detected\n\n`;
    output += `Found ${cycles.length} circular dependency cycle(s)\n\n`;

    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      output += `Cycle ${i + 1}:\n`;
      output += `  ${cycle.description}\n`;
      output += `  Length: ${cycle.cycle.length - 1} dependencies\n\n`;
    }

    output += `\n⚠️  Circular dependencies can cause:\n`;
    output += `  - Build failures\n`;
    output += `  - Runtime initialization issues\n`;
    output += `  - Tight coupling\n`;
    output += `  - Difficult testing\n\n`;
    output += `Recommendation: Refactor to break these cycles.`;

    return output;
  }

  // Format unused dependencies report
  formatUnusedDependenciesReport(unused: UnusedDependency[]): string {
    if (unused.length === 0) {
      return '✅ No unused dependencies detected!\n\nAll declared dependencies are imported in your code.';
    }

    let output = `📦 Unused Dependencies Report\n\n`;
    output += `Found ${unused.length} potentially unused dependencies\n\n`;

    // Group by ecosystem
    const byEcosystem = new Map<string, UnusedDependency[]>();
    for (const dep of unused) {
      if (!byEcosystem.has(dep.ecosystem)) {
        byEcosystem.set(dep.ecosystem, []);
      }
      byEcosystem.get(dep.ecosystem)!.push(dep);
    }

    for (const [ecosystem, deps] of byEcosystem) {
      output += `=== ${ecosystem.toUpperCase()} ===\n\n`;

      for (const dep of deps) {
        output += `  ❌ ${dep.package}@${dep.version}\n`;
        output += `     Declared in: ${dep.declaredIn}\n`;
        output += `     Reason: ${dep.reason}\n\n`;
      }
    }

    output += `\n💡 Benefits of removing unused dependencies:\n`;
    output += `  - Smaller bundle size\n`;
    output += `  - Faster install times\n`;
    output += `  - Reduced security surface\n`;
    output += `  - Cleaner dependency tree\n\n`;
    output += `⚠️  Note: Some dependencies may be used indirectly or in build scripts.`;

    return output;
  }

  // Format architecture summary
  formatArchitectureSummary(layers: ArchitectureLayer[]): string {
    if (layers.length === 0) {
      return 'No clear architecture patterns detected.\n\nConsider organizing your code into layers (controllers, services, repositories, etc.)';
    }

    let output = `🏗️  Architecture Summary\n\n`;
    output += `Detected ${layers.length} architectural layer(s)\n\n`;

    for (const layer of layers) {
      output += `📁 ${layer.name}\n`;
      output += `   ${layer.description}\n`;
      output += `   Files: ${layer.files.length}\n`;

      if (layer.files.length > 0) {
        output += `   Examples:\n`;
        for (const file of layer.files.slice(0, 5)) {
          output += `     - ${file}\n`;
        }
        if (layer.files.length > 5) {
          output += `     ... and ${layer.files.length - 5} more\n`;
        }
      }
      output += '\n';
    }

    // Infer architecture style
    const hasControllers = layers.some(l => l.name === 'Controllers');
    const hasServices = layers.some(l => l.name === 'Services');
    const hasRepositories = layers.some(l => l.name === 'Repositories');

    if (hasControllers && hasServices && hasRepositories) {
      output += `\n✅ Architecture Style: 3-Layer MVC\n`;
      output += `   Controllers → Services → Repositories\n`;
      output += `   This is a clean, maintainable architecture pattern.`;
    } else if (hasControllers && hasServices) {
      output += `\n✅ Architecture Style: 2-Layer Service-Oriented\n`;
      output += `   Controllers → Services\n`;
    } else {
      output += `\n📊 Architecture Style: Custom/Mixed\n`;
    }

    return output;
  }

  // Format hotspot files report
  formatHotspotsReport(hotspots: HotspotFile[]): string {
    if (hotspots.length === 0) {
      return 'No hotspot files found.\n\nEither this is a new project or git history is not available.';
    }

    let output = `🔥 Hotspot Files Report\n\n`;
    output += `Files changed most frequently (highest risk to modify)\n\n`;

    for (let i = 0; i < Math.min(20, hotspots.length); i++) {
      const hotspot = hotspots[i];
      const riskEmoji = hotspot.riskScore >= 80 ? '🔴' :
                        hotspot.riskScore >= 50 ? '🟠' :
                        hotspot.riskScore >= 30 ? '🟡' : '🟢';

      output += `${i + 1}. ${riskEmoji} ${hotspot.filePath}\n`;
      output += `   Changes: ${hotspot.changeCount}\n`;
      output += `   Risk Score: ${hotspot.riskScore}/100\n`;
      output += `   Last Modified: ${hotspot.lastModified.toLocaleDateString()}\n\n`;
    }

    output += `\n⚠️  High-risk files require:\n`;
    output += `  - Extra caution when modifying\n`;
    output += `  - Comprehensive test coverage\n`;
    output += `  - Code review by senior developers\n`;
    output += `  - Consider refactoring if too complex`;

    return output;
  }

  // Format refactor candidates report
  formatRefactorCandidatesReport(candidates: RefactorCandidate[]): string {
    if (candidates.length === 0) {
      return '✅ No obvious refactor candidates found!\n\nYour codebase appears well-structured.';
    }

    let output = `🔧 Refactor Candidates Report\n\n`;
    output += `Files that may benefit from refactoring\n\n`;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const riskEmoji = candidate.riskScore >= 100 ? '🔴' :
                        candidate.riskScore >= 50 ? '🟠' : '🟡';

      output += `${i + 1}. ${riskEmoji} ${candidate.filePath}\n`;
      output += `   Imported by: ${candidate.importedBy} module(s)\n`;
      output += `   Changed: ${candidate.changeCount} time(s)\n`;
      output += `   Risk Score: ${candidate.riskScore}\n`;
      output += `   Reason: ${candidate.reason}\n\n`;
    }

    output += `\n💡 Refactoring strategies:\n`;
    output += `  - Extract reusable functions into utilities\n`;
    output += `  - Split large files into smaller modules\n`;
    output += `  - Reduce coupling with dependency injection\n`;
    output += `  - Add comprehensive tests before refactoring`;

    return output;
  }
}
