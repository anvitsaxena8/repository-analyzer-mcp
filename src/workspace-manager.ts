import * as fs from 'fs';
import * as path from 'path';

export interface Repository {
  name: string;
  path: string;
  type: 'npm' | 'maven' | 'gradle' | 'python' | 'mixed';
  hasPackageJson: boolean;
  hasPomXml: boolean;
  hasBuildGradle: boolean;
  hasRequirementsTxt: boolean;
}

export interface Workspace {
  rootPath: string;
  repositories: Repository[];
}

export class WorkspaceManager {
  
  /**
   * Auto-detect repositories in a workspace directory
   */
  detectRepositories(workspacePath: string, maxDepth: number = 3): Repository[] {
    const repos: Repository[] = [];
    
    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Workspace path does not exist: ${workspacePath}`);
    }
    
    this.scanDirectory(workspacePath, workspacePath, 0, maxDepth, repos);
    
    return repos;
  }
  
  /**
   * Recursively scan directory for repositories
   */
  private scanDirectory(
    currentPath: string,
    rootPath: string,
    depth: number,
    maxDepth: number,
    repos: Repository[]
  ): void {
    if (depth > maxDepth) return;
    
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      // Check if current directory is a repository
      const hasPackageJson = entries.some(e => e.name === 'package.json');
      const hasPomXml = entries.some(e => e.name === 'pom.xml');
      const hasBuildGradle = entries.some(e => e.name === 'build.gradle');
      const hasRequirementsTxt = entries.some(e => e.name === 'requirements.txt');
      
      const isRepo = hasPackageJson || hasPomXml || hasBuildGradle || hasRequirementsTxt;
      
      if (isRepo) {
        const repoName = path.basename(currentPath);
        const repoType = this.determineRepoType(hasPackageJson, hasPomXml, hasBuildGradle, hasRequirementsTxt);
        
        repos.push({
          name: repoName,
          path: currentPath,
          type: repoType,
          hasPackageJson,
          hasPomXml,
          hasBuildGradle,
          hasRequirementsTxt
        });
        
        // Don't scan subdirectories of a detected repo
        return;
      }
      
      // Scan subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
          const subPath = path.join(currentPath, entry.name);
          this.scanDirectory(subPath, rootPath, depth + 1, maxDepth, repos);
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.error(`[repository-analyzer-mcp] Cannot read directory: ${currentPath}`);
    }
  }
  
  /**
   * Determine repository type based on manifest files
   */
  private determineRepoType(
    hasPackageJson: boolean,
    hasPomXml: boolean,
    hasBuildGradle: boolean,
    hasRequirementsTxt: boolean
  ): 'npm' | 'maven' | 'gradle' | 'python' | 'mixed' {
    const types = [];
    if (hasPackageJson) types.push('npm');
    if (hasPomXml) types.push('maven');
    if (hasBuildGradle) types.push('gradle');
    if (hasRequirementsTxt) types.push('python');
    
    if (types.length === 0) return 'npm'; // default
    if (types.length === 1) return types[0] as any;
    return 'mixed';
  }
  
  /**
   * Directories to skip during scanning
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      '.idea',
      '.vscode',
      'dist',
      'build',
      'target',
      '__pycache__',
      '.pytest_cache',
      'venv',
      'env',
      '.env',
      'coverage',
      '.next',
      '.nuxt'
    ];
    
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }
  
  /**
   * Validate that specified repositories exist in workspace
   */
  validateRepositories(workspacePath: string, repoNames: string[]): Repository[] {
    const detectedRepos = this.detectRepositories(workspacePath);
    const validRepos: Repository[] = [];
    
    for (const repoName of repoNames) {
      const repo = detectedRepos.find(r => r.name === repoName);
      if (repo) {
        validRepos.push(repo);
      } else {
        console.warn(`[repository-analyzer-mcp] Repository not found: ${repoName}`);
      }
    }
    
    return validRepos;
  }
  
  /**
   * Get workspace summary
   */
  getWorkspaceSummary(workspacePath: string): Workspace {
    const repositories = this.detectRepositories(workspacePath);
    
    return {
      rootPath: workspacePath,
      repositories
    };
  }
}
