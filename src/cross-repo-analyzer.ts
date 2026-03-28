import * as fs from 'fs';
import * as path from 'path';
import { Repository } from './workspace-manager.js';

export interface CrossRepoDependency {
  fromRepo: string;
  toRepo: string;
  packageName: string;
  version?: string;
  type: 'npm' | 'maven' | 'import';
}

export interface CrossRepoAnalysis {
  workspace: string;
  repositories: Repository[];
  dependencies: CrossRepoDependency[];
  sharedPackages: string[];
  integrationPatterns: string[];
}

export class CrossRepoAnalyzer {
  
  /**
   * Analyze dependencies between repositories
   */
  analyzeCrossRepoDependencies(repos: Repository[]): CrossRepoDependency[] {
    const dependencies: CrossRepoDependency[] = [];
    
    for (const repo of repos) {
      // Analyze npm dependencies
      if (repo.hasPackageJson) {
        const npmDeps = this.analyzeNpmDependencies(repo, repos);
        dependencies.push(...npmDeps);
      }
      
      // Analyze Maven dependencies
      if (repo.hasPomXml) {
        const mavenDeps = this.analyzeMavenDependencies(repo, repos);
        dependencies.push(...mavenDeps);
      }
    }
    
    return dependencies;
  }
  
  /**
   * Analyze npm package dependencies between repos
   */
  private analyzeNpmDependencies(repo: Repository, allRepos: Repository[]): CrossRepoDependency[] {
    const dependencies: CrossRepoDependency[] = [];
    const packageJsonPath = path.join(repo.path, 'package.json');
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };
      
      // Check if any dependency matches another repo's package name
      for (const [depName, version] of Object.entries(allDeps)) {
        for (const otherRepo of allRepos) {
          if (otherRepo.name === repo.name) continue;
          
          if (otherRepo.hasPackageJson) {
            const otherPackageJsonPath = path.join(otherRepo.path, 'package.json');
            try {
              const otherPackageJson = JSON.parse(fs.readFileSync(otherPackageJsonPath, 'utf-8'));
              
              // Check if dependency name matches the other repo's package name
              if (otherPackageJson.name === depName) {
                dependencies.push({
                  fromRepo: repo.name,
                  toRepo: otherRepo.name,
                  packageName: depName,
                  version: version as string,
                  type: 'npm'
                });
              }
            } catch (error) {
              // Skip if can't read package.json
            }
          }
        }
      }
    } catch (error) {
      console.error(`[repository-analyzer-mcp] Error reading package.json for ${repo.name}`);
    }
    
    return dependencies;
  }
  
  /**
   * Analyze Maven dependencies between repos
   */
  private analyzeMavenDependencies(repo: Repository, allRepos: Repository[]): CrossRepoDependency[] {
    const dependencies: CrossRepoDependency[] = [];
    const pomPath = path.join(repo.path, 'pom.xml');
    
    try {
      const pomContent = fs.readFileSync(pomPath, 'utf-8');
      
      // Extract artifactId from this repo's pom.xml
      const artifactIdMatch = pomContent.match(/<artifactId>([^<]+)<\/artifactId>/);
      if (!artifactIdMatch) return dependencies;
      
      const thisArtifactId = artifactIdMatch[1];
      
      // Check other repos for dependencies on this artifact
      for (const otherRepo of allRepos) {
        if (otherRepo.name === repo.name || !otherRepo.hasPomXml) continue;
        
        const otherPomPath = path.join(otherRepo.path, 'pom.xml');
        try {
          const otherPomContent = fs.readFileSync(otherPomPath, 'utf-8');
          
          // Check if other repo depends on this repo
          if (otherPomContent.includes(`<artifactId>${thisArtifactId}</artifactId>`)) {
            dependencies.push({
              fromRepo: otherRepo.name,
              toRepo: repo.name,
              packageName: thisArtifactId,
              type: 'maven'
            });
          }
        } catch (error) {
          // Skip if can't read pom.xml
        }
      }
    } catch (error) {
      console.error(`[repository-analyzer-mcp] Error reading pom.xml for ${repo.name}`);
    }
    
    return dependencies;
  }
  
  /**
   * Find shared packages used across multiple repos
   */
  findSharedPackages(repos: Repository[]): string[] {
    const packageUsage = new Map<string, Set<string>>();
    
    for (const repo of repos) {
      if (repo.hasPackageJson) {
        const packageJsonPath = path.join(repo.path, 'package.json');
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          const allDeps = {
            ...packageJson.dependencies || {},
            ...packageJson.devDependencies || {}
          };
          
          for (const depName of Object.keys(allDeps)) {
            if (!packageUsage.has(depName)) {
              packageUsage.set(depName, new Set());
            }
            packageUsage.get(depName)!.add(repo.name);
          }
        } catch (error) {
          // Skip
        }
      }
    }
    
    // Return packages used by 2 or more repos
    const sharedPackages: string[] = [];
    for (const [pkg, repos] of packageUsage.entries()) {
      if (repos.size >= 2) {
        sharedPackages.push(pkg);
      }
    }
    
    return sharedPackages.sort();
  }
  
  /**
   * Detect integration patterns across repos
   */
  detectIntegrationPatterns(repos: Repository[]): string[] {
    const patterns: Set<string> = new Set();
    
    for (const repo of repos) {
      if (repo.hasPackageJson) {
        const packageJsonPath = path.join(repo.path, 'package.json');
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          const allDeps = {
            ...packageJson.dependencies || {},
            ...packageJson.devDependencies || {}
          };
          
          // Detect common patterns
          if (allDeps['react'] || allDeps['react-dom']) patterns.add('React UI Framework');
          if (allDeps['redux'] || allDeps['@reduxjs/toolkit']) patterns.add('Redux State Management');
          if (allDeps['axios']) patterns.add('Axios HTTP Client');
          if (allDeps['express']) patterns.add('Express REST API');
          if (allDeps['next']) patterns.add('Next.js Framework');
          if (allDeps['@nestjs/core']) patterns.add('NestJS Framework');
          if (allDeps['graphql']) patterns.add('GraphQL API');
          if (allDeps['socket.io']) patterns.add('WebSocket Communication');
        } catch (error) {
          // Skip
        }
      }
      
      if (repo.hasPomXml) {
        const pomPath = path.join(repo.path, 'pom.xml');
        try {
          const pomContent = fs.readFileSync(pomPath, 'utf-8');
          
          if (pomContent.includes('spring-boot-starter-web')) patterns.add('Spring Boot REST API');
          if (pomContent.includes('spring-cloud')) patterns.add('Spring Cloud Microservices');
          if (pomContent.includes('kafka')) patterns.add('Kafka Message Queue');
          if (pomContent.includes('rabbitmq')) patterns.add('RabbitMQ Message Queue');
        } catch (error) {
          // Skip
        }
      }
    }
    
    return Array.from(patterns).sort();
  }
  
  /**
   * Generate full cross-repository analysis
   */
  analyzeWorkspace(workspacePath: string, repos: Repository[]): CrossRepoAnalysis {
    const dependencies = this.analyzeCrossRepoDependencies(repos);
    const sharedPackages = this.findSharedPackages(repos);
    const integrationPatterns = this.detectIntegrationPatterns(repos);
    
    return {
      workspace: workspacePath,
      repositories: repos,
      dependencies,
      sharedPackages,
      integrationPatterns
    };
  }
}
