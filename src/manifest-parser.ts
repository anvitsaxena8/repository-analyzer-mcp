import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { Module, Dependency, DependencyTreeNode, PackageLockDependency } from './types.js';

export class ManifestParser {
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  // Parse package-lock.json for full dependency tree
  parsePackageLockTree(repoPath: string): DependencyTreeNode | null {
    const lockPath = path.join(repoPath, 'package-lock.json');
    if (!fs.existsSync(lockPath)) {
      return null;
    }

    try {
      const lockContent = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      
      // Handle both lockfileVersion 2 and 3
      const packages = lockContent.packages || {};
      const dependencies = lockContent.dependencies || {};
      
      // Build tree from packages (v2/v3) or dependencies (v1)
      if (Object.keys(packages).length > 0) {
        return this.buildTreeFromPackages(packages, lockContent.name || 'root');
      } else {
        return this.buildTreeFromDependencies(dependencies, lockContent.name || 'root');
      }
    } catch (error) {
      console.error('Error parsing package-lock.json:', error);
      return null;
    }
  }

  private buildTreeFromPackages(packages: Record<string, any>, rootName: string): DependencyTreeNode {
    const root: DependencyTreeNode = {
      name: rootName,
      version: packages['']?.version || '1.0.0',
      dependencies: new Map(),
    };

    // Get root dependencies
    const rootPackage = packages[''];
    if (rootPackage?.dependencies) {
      for (const [depName, depVersion] of Object.entries(rootPackage.dependencies)) {
        const depKey = `node_modules/${depName}`;
        if (packages[depKey]) {
          root.dependencies!.set(depName, this.buildNodeFromPackage(depName, packages[depKey], packages));
        }
      }
    }

    return root;
  }

  private buildNodeFromPackage(name: string, pkg: any, allPackages: Record<string, any>): DependencyTreeNode {
    const node: DependencyTreeNode = {
      name,
      version: pkg.version || 'unknown',
      resolved: pkg.resolved,
      dev: pkg.dev || false,
    };

    if (pkg.dependencies) {
      node.dependencies = new Map();
      for (const [depName] of Object.entries(pkg.dependencies)) {
        // Try to find nested dependency
        const depKey = `node_modules/${name}/node_modules/${depName}`;
        const globalDepKey = `node_modules/${depName}`;
        
        const depPkg = allPackages[depKey] || allPackages[globalDepKey];
        if (depPkg) {
          node.dependencies.set(depName, this.buildNodeFromPackage(depName, depPkg, allPackages));
        }
      }
    }

    return node;
  }

  private buildTreeFromDependencies(dependencies: Record<string, PackageLockDependency>, rootName: string): DependencyTreeNode {
    const root: DependencyTreeNode = {
      name: rootName,
      version: '1.0.0',
      dependencies: new Map(),
    };

    for (const [depName, depInfo] of Object.entries(dependencies)) {
      root.dependencies!.set(depName, this.buildNodeFromDependencyInfo(depName, depInfo));
    }

    return root;
  }

  private buildNodeFromDependencyInfo(name: string, info: PackageLockDependency): DependencyTreeNode {
    const node: DependencyTreeNode = {
      name,
      version: info.version,
      resolved: info.resolved,
      dev: info.dev || false,
    };

    if (info.dependencies) {
      node.dependencies = new Map();
      for (const [depName, depInfo] of Object.entries(info.dependencies)) {
        node.dependencies.set(depName, this.buildNodeFromDependencyInfo(depName, depInfo));
      }
    }

    return node;
  }

  // Parse Maven dependency tree by executing mvn dependency:tree
  parseMavenDependencyTree(repoPath: string): DependencyTreeNode | null {
    const pomPath = path.join(repoPath, 'pom.xml');
    if (!fs.existsSync(pomPath)) {
      return null;
    }

    try {
      console.error('[repository-analyzer-mcp] Running mvn dependency:tree...');
      const output = execSync('mvn dependency:tree -DoutputType=text', {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 60000, // 60 second timeout
      });

      return this.parseMavenTreeOutput(output);
    } catch (error) {
      console.error('Error running mvn dependency:tree:', error);
      return null;
    }
  }

  private parseMavenTreeOutput(output: string): DependencyTreeNode {
    const lines = output.split('\n');
    const root: DependencyTreeNode = {
      name: 'maven-project',
      version: '1.0.0',
      dependencies: new Map(),
    };

    const stack: Array<{ node: DependencyTreeNode; depth: number }> = [{ node: root, depth: -1 }];

    for (const line of lines) {
      // Match Maven tree format: [INFO] +- groupId:artifactId:packaging:version:scope
      const match = line.match(/\[INFO\]\s+([\+\\|`\s-]+)\s*([^:]+):([^:]+):([^:]+):([^:]+)(?::([^:]+))?/);
      if (!match) continue;

      const indent = match[1];
      const groupId = match[2];
      const artifactId = match[3];
      const packaging = match[4];
      const version = match[5];
      const scope = match[6] || 'compile';

      const depth = indent.replace(/[^\s]/g, '').length / 3; // Approximate depth
      const name = `${groupId}:${artifactId}`;

      const node: DependencyTreeNode = {
        name,
        version,
        dev: scope === 'test',
        dependencies: new Map(),
      };

      // Find parent at correct depth
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1].node;
        parent.dependencies!.set(name, node);
      }

      stack.push({ node, depth });
    }

    return root;
  }

  // Parse Gradle dependency tree by executing gradle dependencies
  parseGradleDependencyTree(repoPath: string): DependencyTreeNode | null {
    const gradleFiles = ['build.gradle', 'build.gradle.kts'];
    const hasGradle = gradleFiles.some(f => fs.existsSync(path.join(repoPath, f)));
    
    if (!hasGradle) {
      return null;
    }

    try {
      console.error('[repository-analyzer-mcp] Running gradle dependencies...');
      const output = execSync('gradle dependencies --configuration runtimeClasspath', {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000,
      });

      return this.parseGradleTreeOutput(output);
    } catch (error) {
      console.error('Error running gradle dependencies:', error);
      return null;
    }
  }

  private parseGradleTreeOutput(output: string): DependencyTreeNode {
    const lines = output.split('\n');
    const root: DependencyTreeNode = {
      name: 'gradle-project',
      version: '1.0.0',
      dependencies: new Map(),
    };

    const stack: Array<{ node: DependencyTreeNode; depth: number }> = [{ node: root, depth: -1 }];

    for (const line of lines) {
      // Match Gradle tree format: +--- group:artifact:version
      const match = line.match(/^([\s|+\\-]+)([^:]+):([^:]+):([^\s]+)/);
      if (!match) continue;

      const indent = match[1];
      const group = match[2];
      const artifact = match[3];
      const version = match[4];

      const depth = indent.length / 4; // Approximate depth
      const name = `${group}:${artifact}`;

      const node: DependencyTreeNode = {
        name,
        version,
        dependencies: new Map(),
      };

      // Find parent at correct depth
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1].node;
        parent.dependencies!.set(name, node);
      }

      stack.push({ node, depth });
    }

    return root;
  }

  // Parse pip dependency tree by executing pipdeptree
  parsePipDependencyTree(repoPath: string): DependencyTreeNode | null {
    const reqPath = path.join(repoPath, 'requirements.txt');
    if (!fs.existsSync(reqPath)) {
      return null;
    }

    try {
      console.error('[repository-analyzer-mcp] Running pipdeptree...');
      // Try pipdeptree first, fall back to pip list if not available
      let output: string;
      try {
        output = execSync('pipdeptree --json-tree', {
          cwd: repoPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30000,
        });
        return this.parsePipTreeJson(output);
      } catch {
        // Fallback: just show installed packages
        output = execSync('pip list --format=json', {
          cwd: repoPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30000,
        });
        return this.parsePipListJson(output);
      }
    } catch (error) {
      console.error('Error running pip commands:', error);
      return null;
    }
  }

  private parsePipTreeJson(output: string): DependencyTreeNode {
    const data = JSON.parse(output);
    const root: DependencyTreeNode = {
      name: 'python-project',
      version: '1.0.0',
      dependencies: new Map(),
    };

    for (const pkg of data) {
      const node = this.buildPipNode(pkg);
      root.dependencies!.set(pkg.package.key, node);
    }

    return root;
  }

  private buildPipNode(pkg: any): DependencyTreeNode {
    const node: DependencyTreeNode = {
      name: pkg.package.key,
      version: pkg.package.installed_version,
      dependencies: new Map(),
    };

    if (pkg.dependencies && pkg.dependencies.length > 0) {
      for (const dep of pkg.dependencies) {
        node.dependencies!.set(dep.package.key, this.buildPipNode(dep));
      }
    }

    return node;
  }

  private parsePipListJson(output: string): DependencyTreeNode {
    const packages = JSON.parse(output);
    const root: DependencyTreeNode = {
      name: 'python-project',
      version: '1.0.0',
      dependencies: new Map(),
    };

    for (const pkg of packages) {
      root.dependencies!.set(pkg.name, {
        name: pkg.name,
        version: pkg.version,
        dependencies: new Map(),
      });
    }

    return root;
  }

  // Universal dependency tree parser - tries all methods
  parseUniversalDependencyTree(repoPath: string): DependencyTreeNode | null {
    // Try npm first (package-lock.json)
    const npmTree = this.parsePackageLockTree(repoPath);
    if (npmTree) {
      console.error('[repository-analyzer-mcp] Using npm dependency tree');
      return npmTree;
    }

    // Try Maven (pom.xml)
    const mavenTree = this.parseMavenDependencyTree(repoPath);
    if (mavenTree) {
      console.error('[repository-analyzer-mcp] Using Maven dependency tree');
      return mavenTree;
    }

    // Try Gradle (build.gradle)
    const gradleTree = this.parseGradleDependencyTree(repoPath);
    if (gradleTree) {
      console.error('[repository-analyzer-mcp] Using Gradle dependency tree');
      return gradleTree;
    }

    // Try pip (requirements.txt)
    const pipTree = this.parsePipDependencyTree(repoPath);
    if (pipTree) {
      console.error('[repository-analyzer-mcp] Using pip dependency tree');
      return pipTree;
    }

    console.error('[repository-analyzer-mcp] No supported dependency file found');
    return null;
  }

  async scanDirectory(repoPath: string): Promise<Module[]> {
    const modules: Module[] = [];

    // Check for package.json
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      modules.push(await this.parsePackageJson(packageJsonPath, repoPath));
    }

    // Check for pom.xml
    const pomPath = path.join(repoPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      modules.push(await this.parsePom(pomPath, repoPath));
    }

    // Check for requirements.txt
    const reqPath = path.join(repoPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      modules.push(await this.parseRequirements(reqPath, repoPath));
    }

    return modules;
  }

  private async parsePackageJson(filePath: string, repoPath: string): Promise<Module> {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    const dependencies: Dependency[] = [];
    
    // Production dependencies
    if (content.dependencies) {
      for (const [name, version] of Object.entries(content.dependencies)) {
        dependencies.push({
          name,
          version: String(version),
          ecosystem: 'npm',
          isDev: false,
        });
      }
    }

    // Dev dependencies
    if (content.devDependencies) {
      for (const [name, version] of Object.entries(content.devDependencies)) {
        dependencies.push({
          name,
          version: String(version),
          ecosystem: 'npm',
          isDev: true,
        });
      }
    }

    return {
      id: 'package.json',
      path: filePath,
      ecosystem: 'npm',
      type: content.type === 'module' || content.main ? 'library' : 'frontend',
      dependencies,
    };
  }

  private async parsePom(filePath: string, repoPath: string): Promise<Module> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = this.xmlParser.parse(content);

    const dependencies: Dependency[] = [];
    const deps = parsed.project?.dependencies?.dependency || [];
    const depArray = Array.isArray(deps) ? deps : [deps];

    for (const dep of depArray) {
      if (dep.artifactId && dep.groupId) {
        const name = `${dep.groupId}:${dep.artifactId}`;
        dependencies.push({
          name,
          version: dep.version || 'unknown',
          ecosystem: 'maven',
          isDev: dep.scope === 'test',
        });
      }
    }

    return {
      id: 'pom.xml',
      path: filePath,
      ecosystem: 'maven',
      type: 'backend',
      dependencies,
    };
  }

  private async parseRequirements(filePath: string, repoPath: string): Promise<Module> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

    const dependencies: Dependency[] = lines.map(line => {
      const match = line.match(/^([a-zA-Z0-9-_.]+)(?:==|>=|<=|>|<)?(.*)$/);
      const name = match ? match[1] : line;
      const version = match ? match[2] || 'unknown' : 'unknown';

      return {
        name,
        version,
        ecosystem: 'pip',
        isDev: false,
      };
    });

    return {
      id: 'requirements.txt',
      path: filePath,
      ecosystem: 'pip',
      type: 'backend',
      dependencies,
    };
  }
}
