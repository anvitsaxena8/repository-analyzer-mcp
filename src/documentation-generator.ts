import { DBManager } from './db-manager.js';
import { ASTAnalyzer } from './ast-analyzer.js';
import { AdvancedIntelligence } from './advanced-intelligence.js';
import { CodeAnalyzer } from './code-analyzer.js';
import { ManifestParser } from './manifest-parser.js';
import { DataFlowAnalyzer } from './data-flow-analyzer.js';
import { CallGraphAnalyzer } from './call-graph-analyzer.js';
import fs from 'fs';
import path from 'path';

export type DocumentationType = 'summary' | 'architecture' | 'full';

interface ProjectMetadata {
  name: string;
  totalModules: number;
  ecosystems: string[];
  techStack: { [key: string]: string[] };
}

interface DependencyStats {
  production: number;
  dev: number;
  total: number;
}

export class DocumentationGenerator {
  private callGraphAnalyzer: CallGraphAnalyzer;

  constructor(
    private dbManager: DBManager,
    private astAnalyzer: ASTAnalyzer,
    private advancedIntel: AdvancedIntelligence,
    private codeAnalyzer: CodeAnalyzer,
    private manifestParser: ManifestParser,
    private dataFlowAnalyzer: DataFlowAnalyzer
  ) {
    this.callGraphAnalyzer = new CallGraphAnalyzer();
  }

  /**
   * Generate repository documentation
   */
  async generateDocument(
    projectPath: string,
    outputType: DocumentationType,
    outputFile?: string
  ): Promise<{ filePath: string; content: string }> {
    const metadata = this.extractProjectMetadata(projectPath);
    
    let content = '';
    let defaultFileName = '';

    switch (outputType) {
      case 'summary':
        content = this.generateSummaryDocument(projectPath, metadata);
        defaultFileName = 'CODEBASE_MEMORY.md';
        break;
      case 'architecture':
        content = await this.generateArchitectureDocument(projectPath, metadata);
        defaultFileName = 'CODEBASE_MEMORY.md';
        break;
      case 'full':
        content = await this.generateFullDocument(projectPath, metadata);
        defaultFileName = 'CODEBASE_MEMORY.md';
        break;
    }

    const filePath = outputFile || path.join(projectPath, defaultFileName);
    
    // Write to file
    fs.writeFileSync(filePath, content, 'utf-8');

    return { filePath, content };
  }

  /**
   * Extract project metadata from database or by scanning manifest files
   */
  private extractProjectMetadata(projectPath: string): ProjectMetadata {
    let modules = this.dbManager.getAllModules();
    
    // If database is empty, scan for manifest files directly
    if (modules.length === 0) {
      modules = this.scanManifestFiles(projectPath);
    }
    
    const ecosystems = [...new Set(modules.map(m => m.ecosystem))];
    
    // Determine project name from path
    const projectName = path.basename(projectPath);

    // Group tech stack by ecosystem
    const techStack: { [key: string]: string[] } = {};
    for (const ecosystem of ecosystems) {
      techStack[ecosystem] = this.detectTechStack(projectPath, ecosystem);
    }

    return {
      name: projectName,
      totalModules: modules.length,
      ecosystems,
      techStack,
    };
  }

  /**
   * Scan for manifest files directly (fallback when database is empty)
   * Now recursively scans subdirectories to find all manifest files
   */
  private scanManifestFiles(projectPath: string): any[] {
    const modules: any[] = [];
    
    const scanDirectory = (dir: string, depth: number = 0) => {
      // Limit depth to avoid scanning too deep
      if (depth > 3) return;
      
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          // Skip node_modules, .git, dist, build, target directories
          if (item.isDirectory()) {
            const skipDirs = ['node_modules', '.git', 'dist', 'build', 'target', '.next', 'out', 'coverage'];
            if (!skipDirs.includes(item.name)) {
              scanDirectory(fullPath, depth + 1);
            }
          } else if (item.isFile()) {
            // Check for manifest files
            if (item.name === 'package.json') {
              modules.push({
                id: path.relative(projectPath, fullPath),
                path: fullPath,
                ecosystem: 'npm',
                type: 'frontend'
              });
            } else if (item.name === 'pom.xml') {
              modules.push({
                id: path.relative(projectPath, fullPath),
                path: fullPath,
                ecosystem: 'maven',
                type: 'backend'
              });
            } else if (item.name === 'requirements.txt') {
              modules.push({
                id: path.relative(projectPath, fullPath),
                path: fullPath,
                ecosystem: 'pip',
                type: 'backend'
              });
            } else if (item.name === 'Cargo.toml') {
              modules.push({
                id: path.relative(projectPath, fullPath),
                path: fullPath,
                ecosystem: 'cargo',
                type: 'backend'
              });
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    try {
      scanDirectory(projectPath);

      // Also check for requirements.txt (pip) at root for backward compatibility
      const requirementsPath = path.join(projectPath, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        modules.push({
          id: 'requirements.txt',
          path: requirementsPath,
          ecosystem: 'pip',
          type: 'backend'
        });
      }

      // Check for build.gradle (Gradle)
      const gradlePath = path.join(projectPath, 'build.gradle');
      if (fs.existsSync(gradlePath)) {
        modules.push({
          id: 'build.gradle',
          path: gradlePath,
          ecosystem: 'gradle',
          type: 'backend'
        });
      }
    } catch (error) {
      // Silently fail if we can't scan
    }

    return modules;
  }

  /**
   * Detect tech stack for a given ecosystem
   */
  private detectTechStack(projectPath: string, ecosystem: string): string[] {
    const stack: string[] = [];

    try {
      if (ecosystem === 'npm') {
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          
          // Detect framework
          if (pkg.dependencies?.react) stack.push(`React ${pkg.dependencies.react}`);
          if (pkg.dependencies?.vue) stack.push(`Vue ${pkg.dependencies.vue}`);
          if (pkg.dependencies?.angular) stack.push(`Angular ${pkg.dependencies.angular}`);
          if (pkg.dependencies?.next) stack.push(`Next.js ${pkg.dependencies.next}`);
          if (pkg.dependencies?.express) stack.push(`Express ${pkg.dependencies.express}`);
          
          // Detect TypeScript
          if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
            stack.push('TypeScript');
          }
          
          // Detect build tools
          if (pkg.devDependencies?.vite) stack.push('Vite');
          if (pkg.devDependencies?.webpack) stack.push('Webpack');
        }
      } else if (ecosystem === 'maven') {
        const pomPath = path.join(projectPath, 'pom.xml');
        if (fs.existsSync(pomPath)) {
          const pomContent = fs.readFileSync(pomPath, 'utf-8');
          
          // Detect Java version
          const javaVersionMatch = pomContent.match(/<java\.version>([\d.]+)<\/java\.version>/);
          if (javaVersionMatch) stack.push(`Java ${javaVersionMatch[1]}`);
          
          // Detect Spring Boot
          if (pomContent.includes('spring-boot-starter')) {
            const versionMatch = pomContent.match(/<version>([\d.]+)<\/version>/);
            stack.push(`Spring Boot ${versionMatch ? versionMatch[1] : ''}`);
          }
        }
      } else if (ecosystem === 'pip') {
        // Check for common Python frameworks
        const modules = this.dbManager.getAllModules();
        const pythonModule = modules.find(m => m.ecosystem === 'pip');
        if (pythonModule) {
          const deps = this.dbManager.getDependencies(pythonModule.id);
          if (deps.find(d => d.name === 'django')) stack.push('Django');
          if (deps.find(d => d.name === 'flask')) stack.push('Flask');
          if (deps.find(d => d.name === 'fastapi')) stack.push('FastAPI');
        }
      }
    } catch (error) {
      // Silently fail if we can't detect tech stack
    }

    return stack.length > 0 ? stack : [ecosystem];
  }

  /**
   * Generate summary document
   */
  private generateSummaryDocument(projectPath: string, metadata: ProjectMetadata): string {
    let modules = this.dbManager.getAllModules();
    
    // If database is empty, use scanned modules
    if (modules.length === 0) {
      modules = this.scanManifestFiles(projectPath);
    }
    
    const currentDate = new Date().toISOString().split('T')[0];
    
    let doc = `# Project: ${metadata.name}\n\n`;
    doc += `## What is this?\n\n`;
    
    // Project description
    const ecosystemDesc = metadata.ecosystems.length > 0 ? metadata.ecosystems.join(', ') : 'unknown';
    doc += `A project with ${metadata.totalModules} module(s) detected across ${metadata.ecosystems.length} ecosystem(s): ${ecosystemDesc}.\n\n`;

    // Tech Stack
    doc += `## Tech Stack\n\n`;
    if (Object.keys(metadata.techStack).length > 0) {
      for (const [ecosystem, stack] of Object.entries(metadata.techStack)) {
        const label = this.getEcosystemLabel(ecosystem);
        doc += `- **${label}**: ${stack.join(', ')}\n`;
      }
    } else {
      doc += `*Tech stack detection requires manifest files (package.json, pom.xml, etc.)*\n`;
    }
    doc += '\n';

    // Key Dependencies by module
    doc += `## Key Dependencies\n\n`;
    
    if (modules.length > 0) {
      for (const module of modules) {
        // Try to get from database first
        let deps = this.dbManager.getDependencies(module.id);
        
        // If database is empty, parse the manifest file directly
        if (deps.length === 0) {
          deps = this.parseManifestDependencies(module.path, module.ecosystem);
        }
        
        const prodDeps = deps.filter(d => !d.isDev);
        const devDeps = deps.filter(d => d.isDev);

        doc += `### ${this.getModuleLabel(module.path, module.ecosystem)}\n\n`;
        
        if (prodDeps.length > 0) {
          doc += `**Production Dependencies:**\n`;
          prodDeps.slice(0, 10).forEach(dep => {
            doc += `- ${dep.name}${dep.version && dep.version !== 'unknown' ? `@${dep.version}` : ''}\n`;
          });
          if (prodDeps.length > 10) {
            doc += `- ... and ${prodDeps.length - 10} more\n`;
          }
          doc += '\n';
        }

        if (devDeps.length > 0) {
          doc += `**Dev Dependencies:**\n`;
          devDeps.slice(0, 5).forEach(dep => {
            doc += `- ${dep.name}${dep.version && dep.version !== 'unknown' ? `@${dep.version}` : ''} [dev]\n`;
          });
          if (devDeps.length > 5) {
            doc += `- ... and ${devDeps.length - 5} more\n`;
          }
          doc += '\n';
        }
        
        if (prodDeps.length === 0 && devDeps.length === 0) {
          doc += `*No dependencies found. Run \`scan_project()\` for detailed dependency analysis.*\n\n`;
        }
      }
    } else {
      doc += `*No manifest files detected. This may not be a standard npm/Maven/pip project.*\n\n`;
    }

    // Module Count Summary with Health Context
    const stats = this.getDependencyStats(projectPath);
    doc += `## Dependency Health\n\n`;
    
    // Count internal dependencies (organization packages)
    let internalCount = 0;
    try {
      const modules = this.dbManager.getAllModules();
      modules.forEach(module => {
        const deps = this.dbManager.getDependencies(module.id);
        deps.forEach((dep: any) => {
          // Detect internal packages by common prefixes (e.g., @company, company-*)
          if (dep.name && (dep.name.startsWith('@company') || dep.name.includes('internal-'))) {
            internalCount++;
          }
        });
      });
    } catch (error) {
      // Continue without internal count
    }
    
    // Assess health
    const prodAssessment = stats.production > 60 ? '⚠️ High (typical: 20-40)' : 
                          stats.production > 40 ? 'ℹ️ Moderate (typical: 20-40)' : 
                          '✅ Healthy';
    const devAssessment = stats.dev > 50 ? '⚠️ High (typical: 15-30)' : 
                         stats.dev > 30 ? 'ℹ️ Moderate (typical: 15-30)' : 
                         '✅ Healthy';
    
    doc += `| Metric | Count | Assessment |\n`;
    doc += `|--------|-------|------------|\n`;
    doc += `| Production dependencies | ${stats.production} | ${prodAssessment} |\n`;
    doc += `| Dev dependencies | ${stats.dev} | ${devAssessment} |\n`;
    if (internalCount > 0) {
      doc += `| Internal dependencies | ${internalCount} | ✅ Well modularized |\n`;
    }
    doc += `| **Total** | **${stats.total}** | |\n\n`;
    
    if (stats.production > 60 || stats.dev > 50) {
      doc += `💡 **Recommendation**: Consider reviewing dependencies for unused packages or opportunities to consolidate.\n\n`;
    }

    // Module Dependency Map (for multi-module projects)
    if (modules.length > 1) {
      doc += `## Module Dependency Map\n\n`;
      doc += `This project contains ${modules.length} modules:\n\n`;
      
      const modulesByType = new Map<string, any[]>();
      modules.forEach(module => {
        const type = module.ecosystem || 'unknown';
        if (!modulesByType.has(type)) {
          modulesByType.set(type, []);
        }
        modulesByType.get(type)!.push(module);
      });
      
      modulesByType.forEach((mods, type) => {
        doc += `**${type.toUpperCase()} Modules:**\n`;
        mods.forEach(module => {
          const moduleName = path.basename(path.dirname(module.path));
          doc += `- \`${moduleName}\` (${path.basename(module.path)})\n`;
        });
        doc += '\n';
      });
      
      // Show inter-module dependencies if detectable
      doc += `**Inter-Module Dependencies:**\n\n`;
      const hasInternalDeps = internalCount > 0;
      if (hasInternalDeps) {
        doc += `This project uses ${internalCount} internal dependencies, indicating good modularization.\n\n`;
        doc += `Common pattern:\n`;
        doc += `\`\`\`\n`;
        
        // Try to detect common patterns
        const hasWebapp = modules.some(m => m.path.includes('webapp'));
        const hasService = modules.some(m => m.path.includes('service'));
        
        if (hasWebapp && hasService) {
          doc += `webapp/ → depends on → service/\n`;
          doc += `service/ → depends on → common libraries\n`;
        } else {
          doc += `Modules share common dependencies\n`;
        }
        doc += `\`\`\`\n\n`;
      } else {
        doc += `*No inter-module dependencies detected. Modules may be independent.*\n\n`;
      }
    }

    // Getting Started - Auto-detected run commands
    doc += `## Getting Started\n\n`;
    
    // Detect and show run commands from package.json and Maven
    let hasCommands = false;
    
    // Check for npm scripts
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.scripts) {
          hasCommands = true;
          doc += `### Frontend (Node.js)\n\n`;
          doc += `\`\`\`bash\n`;
          doc += `# Install dependencies\n`;
          doc += `npm install\n\n`;
          
          if (pkg.scripts.dev || pkg.scripts.start) {
            doc += `# Run development server\n`;
            doc += `npm run ${pkg.scripts.dev ? 'dev' : 'start'}\n\n`;
          }
          
          if (pkg.scripts.build) {
            doc += `# Build for production\n`;
            doc += `npm run build\n\n`;
          }
          
          if (pkg.scripts.test) {
            doc += `# Run tests\n`;
            doc += `npm test\n`;
          }
          doc += `\`\`\`\n\n`;
        }
      } catch (error) {
        // Skip if can't parse
      }
    }
    
    // Check for Maven
    const pomPath = path.join(projectPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      hasCommands = true;
      doc += `### Backend (Maven)\n\n`;
      doc += `\`\`\`bash\n`;
      doc += `# Build the project\n`;
      doc += `mvn clean install\n\n`;
      doc += `# Run the application (Spring Boot)\n`;
      doc += `mvn spring-boot:run\n\n`;
      doc += `# Run tests\n`;
      doc += `mvn test\n`;
      doc += `\`\`\`\n\n`;
    }
    
    if (!hasCommands) {
      doc += `*No standard build scripts detected. Check project documentation for setup instructions.*\n\n`;
    }

    doc += `---\n`;
    doc += `*Generated by repository-analyzer-mcp on ${currentDate}*\n`;

    return doc;
  }

  /**
   * Parse dependencies from manifest file directly
   */
  private parseManifestDependencies(manifestPath: string, ecosystem: string): any[] {
    const deps: any[] = [];
    
    try {
      if (ecosystem === 'npm' && fs.existsSync(manifestPath)) {
        const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        
        // Production dependencies
        if (pkg.dependencies) {
          Object.entries(pkg.dependencies).forEach(([name, version]) => {
            deps.push({ name, version: version as string, isDev: false, ecosystem: 'npm' });
          });
        }
        
        // Dev dependencies
        if (pkg.devDependencies) {
          Object.entries(pkg.devDependencies).forEach(([name, version]) => {
            deps.push({ name, version: version as string, isDev: true, ecosystem: 'npm' });
          });
        }
      } else if (ecosystem === 'maven' && fs.existsSync(manifestPath)) {
        // Parse pom.xml for dependencies
        const pomContent = fs.readFileSync(manifestPath, 'utf-8');
        const depMatches = pomContent.matchAll(/<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>[\s\S]*?(?:<version>(.*?)<\/version>)?[\s\S]*?<\/dependency>/g);
        
        for (const match of depMatches) {
          const groupId = match[1];
          const artifactId = match[2];
          const version = match[3] || 'unknown';
          const name = `${groupId}:${artifactId}`;
          deps.push({ name, version, isDev: false, ecosystem: 'maven' });
        }
      } else if (ecosystem === 'pip' && fs.existsSync(manifestPath)) {
        // Parse requirements.txt
        const content = fs.readFileSync(manifestPath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const match = trimmed.match(/^([a-zA-Z0-9\-_]+)(?:==|>=|<=|>|<)?(.*)$/);
            if (match) {
              deps.push({ 
                name: match[1], 
                version: match[2] || 'unknown', 
                isDev: false, 
                ecosystem: 'pip' 
              });
            }
          }
        }
      }
    } catch (error) {
      // Silently fail if we can't parse
    }
    
    return deps;
  }

  /**
   * Generate architecture document
   */
  private async generateArchitectureDocument(projectPath: string, metadata: ProjectMetadata): Promise<string> {
    const currentDate = new Date().toISOString().split('T')[0];
    
    let doc = `# Architecture: ${metadata.name}\n\n`;

    // Health Check Section
    doc += `## 🏥 Repository Health Check\n\n`;
    doc += `Quick assessment of repository health:\n\n`;
    doc += `| Check | Status | Detail |\n`;
    doc += `|-------|--------|--------|\n`;
    
    // Check circular dependencies
    const healthCircularDeps = this.detectCircularDependencies(projectPath);
    const circularStatus = healthCircularDeps.length === 0 ? '✅ None' : `🔴 ${healthCircularDeps.length} found`;
    doc += `| Circular Dependencies | ${circularStatus} | ${healthCircularDeps.length === 0 ? 'Clean dependency graph' : 'Needs attention'} |\n`;
    
    // Check hotspot files
    let hotspotStatus = 'ℹ️ Not scanned';
    try {
      const hotspots = this.advancedIntel.findHotspotFiles(projectPath, 10);
      const highRisk = hotspots.filter(h => h.riskScore >= 80).length;
      hotspotStatus = highRisk > 5 ? `🔴 ${highRisk} high-risk files` : 
                     highRisk > 0 ? `🟡 ${highRisk} files` : '✅ Healthy';
      doc += `| Hotspot Files | ${hotspotStatus} | ${highRisk > 0 ? 'High change frequency — refactor candidates' : 'No major hotspots'} |\n`;
    } catch (error) {
      doc += `| Hotspot Files | ${hotspotStatus} | Git history not available |\n`;
    }
    
    // Check external API calls
    let apiCallCount = 0;
    try {
      const dataFlowGraph = await this.dataFlowAnalyzer.analyzeDataFlow(projectPath);
      if (dataFlowGraph) {
        apiCallCount = dataFlowGraph.nodes.filter((n: any) => n.type === 'api_client').length;
      }
      const apiStatus = apiCallCount > 0 ? `ℹ️ ${apiCallCount} detected` : '✅ None';
      doc += `| External API Calls | ${apiStatus} | ${apiCallCount > 0 ? 'Service integrations found' : 'Self-contained service'} |\n`;
    } catch (error) {
      doc += `| External API Calls | ℹ️ Not scanned | Data flow analysis unavailable |\n`;
    }
    
    doc += `\n`;

    // Generate ASCII Architecture Diagram
    try {
      const dataFlowGraph = await this.dataFlowAnalyzer.analyzeDataFlow(projectPath);
      if (dataFlowGraph && dataFlowGraph.nodes.length > 0) {
        doc += `## System Architecture Overview\n\n`;
        doc += this.generateAsciiArchitectureDiagram(metadata.name, dataFlowGraph);
        doc += '\n';
      }
    } catch (error) {
      // Skip diagram if data flow analysis fails
    }

    // Project Structure
    doc += `## Project Structure\n\n`;
    const structure = this.analyzeProjectStructure(projectPath);
    doc += structure + '\n\n';

    // Dependency Graph - Most Imported Files
    doc += `## Dependency Graph\n\n`;
    const importAnalysis = this.codeAnalyzer.analyzeAllCode(projectPath);
    
    if (importAnalysis && importAnalysis.imports.length > 0) {
      // Build a map of files and their import counts
      const fileImportCounts = new Map<string, number>();
      importAnalysis.imports.forEach((imp) => {
        const count = fileImportCounts.get(imp.source) || 0;
        fileImportCounts.set(imp.source, count + 1);
      });

      // Filter out noise imports (stdlib, annotations, framework boilerplate)
      const NOISE_IMPORTS = [
        'java.util.', 'java.lang.', 'java.io.', 'java.time.', 'java.nio.',
        'lombok.', // Lombok annotations
        'org.springframework.beans.factory.annotation', // @Autowired, @Value
        'org.springframework.stereotype', // @Component, @Service
        'org.springframework.web.bind.annotation', // @RestController, @RequestMapping
        'prop-types', // React boilerplate
        'react', // Too generic
        'classnames', // CSS utility
      ];

      const meaningfulImports = Array.from(fileImportCounts.entries())
        .filter(([file]) => !NOISE_IMPORTS.some(noise => file.startsWith(noise)))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      if (meaningfulImports.length > 0) {
        meaningfulImports.forEach(([file, count]) => {
          const riskLevel = count > 10 ? '🔴 HIGH RISK' : 
                           count > 5 ? '🟡 MEDIUM RISK' : '🟢 LOW RISK';
          doc += `- \`${file}\` ← imported by ${count} module(s) ${riskLevel}\n`;
        });
      } else {
        doc += `*Only framework/stdlib imports detected. No custom module hotspots.*\n`;
      }
      doc += '\n';
    } else {
      doc += `*No import data available. Run code analysis first.*\n\n`;
    }

    // Circular Dependencies
    doc += `## Circular Dependencies\n\n`;
    const circularDeps = this.detectCircularDependencies(projectPath);
    if (circularDeps.length === 0) {
      doc += `✅ None detected\n\n`;
    } else {
      doc += `⚠️ Found ${circularDeps.length} circular dependency chain(s):\n\n`;
      circularDeps.forEach((chain, idx) => {
        doc += `${idx + 1}. ${chain.join(' → ')}\n`;
      });
      doc += '\n';
    }

    // Inter-Service Dependencies (Data Flow Analysis)
    doc += `## Inter-Service Dependencies\n\n`;
    try {
      const dataFlow = this.dataFlowAnalyzer.analyzeDataFlow(projectPath);
      
      // Extract different types of nodes
      const apiEndpoints = dataFlow.nodes.filter(n => n.type === 'api_endpoint');
      const apiClients = dataFlow.nodes.filter(n => n.type === 'api_client');
      const producers = dataFlow.nodes.filter(n => n.type === 'producer');
      const consumers = dataFlow.nodes.filter(n => n.type === 'consumer');
      const datastores = dataFlow.nodes.filter(n => n.type === 'datastore');
      
      // API Endpoints (what this service exposes) - Grouped by controller
      if (apiEndpoints.length > 0) {
        doc += `### API Endpoints (${apiEndpoints.length} total)\n\n`;
        
        // Group endpoints by controller file
        const endpointsByController = new Map<string, any[]>();
        apiEndpoints.forEach(node => {
          const controllerName = node.file ? path.basename(node.file, path.extname(node.file)) : 'Unknown';
          if (!endpointsByController.has(controllerName)) {
            endpointsByController.set(controllerName, []);
          }
          endpointsByController.get(controllerName)!.push(node);
        });
        
        // Display each controller's endpoints in a table
        endpointsByController.forEach((endpoints, controllerName) => {
          // Try to extract base path from controller name or first endpoint
          let basePath = '';
          const firstEndpoint = endpoints[0];
          if (firstEndpoint && firstEndpoint.details.path) {
            const fullPath = firstEndpoint.details.path;
            // Extract common prefix if multiple endpoints
            if (endpoints.length > 1) {
              const paths = endpoints.map(e => e.details.path || '');
              const parts = fullPath.split('/').filter((p: string) => p && !p.startsWith('{') && !p.startsWith(':'));
              if (parts.length > 0) {
                basePath = '/' + parts.slice(0, -1).join('/');
              }
            }
          }
          
          doc += `#### ${controllerName}${basePath ? ` (${basePath})` : ''} — ${endpoints.length} endpoint${endpoints.length > 1 ? 's' : ''}\n\n`;
          doc += `| Method | Path | Handler |\n`;
          doc += `|--------|------|----------|\n`;
          
          endpoints.forEach(node => {
            const endpoint = node.details;
            const method = endpoint.method || 'HTTP';
            const path = endpoint.path || node.label || '';
            const handler = endpoint.handler || 'unknown';
            doc += `| ${method} | \`${path}\` | ${handler} |\n`;
          });
          doc += '\n';
        });
      }

      // API Clients (outgoing calls to other services)
      if (apiClients.length > 0) {
        doc += `### API Clients (Calls to other services)\n\n`;
        apiClients.forEach(node => {
          const client = node.details;
          doc += `- **${node.label}**`;
          if (client.url) {
            doc += ` → \`${client.url}\``;
          }
          if (node.file) {
            doc += ` — used in \`${node.file}\``;
          }
          doc += '\n';
        });
        doc += '\n';
      }

      // Message Queue Producers
      if (producers.length > 0) {
        doc += `### Message Queue Producers (Topics published to)\n\n`;
        producers.forEach(node => {
          const producer = node.details;
          doc += `- **${producer.topic || node.label}**`;
          if (producer.framework) {
            doc += ` (${producer.framework})`;
          }
          if (node.file) {
            doc += ` — produced in \`${node.file}\``;
          }
          doc += '\n';
        });
        doc += '\n';
      }

      // Message Queue Consumers
      if (consumers.length > 0) {
        doc += `### Message Queue Consumers (Topics subscribed to)\n\n`;
        consumers.forEach(node => {
          const consumer = node.details;
          doc += `- **${consumer.topic || node.label}**`;
          if (consumer.framework) {
            doc += ` (${consumer.framework})`;
          }
          if (node.file) {
            doc += ` — consumed in \`${node.file}\``;
          }
          doc += '\n';
        });
        doc += '\n';
      }

      // Database Operations
      if (datastores.length > 0) {
        doc += `### Database Operations\n\n`;
        const dbTypes = [...new Set(datastores.map(n => n.details.type))];
        dbTypes.forEach(dbType => {
          const ops = datastores.filter(n => n.details.type === dbType);
          doc += `- **${dbType}**: ${ops.length} operation(s)\n`;
        });
        doc += '\n';
      }

      // If no data flow detected
      const hasDataFlow = apiEndpoints.length + apiClients.length + producers.length + consumers.length + datastores.length;
      
      if (hasDataFlow === 0) {
        doc += `*No inter-service dependencies detected. This may be a standalone service or data flow patterns are not recognized.*\n\n`;
      } else {
        // Add Workflow & Integration Map
        doc += `## Workflow & Integration Map\n\n`;
        doc += `This section provides a high-level view of how **${metadata.name}** integrates with other services and repositories.\n\n`;
        
        // Determine service role
        const hasIncoming = apiEndpoints.length > 0 || consumers.length > 0;
        const hasOutgoing = apiClients.length > 0 || producers.length > 0;
        
        if (hasIncoming && hasOutgoing) {
          doc += `### Service Role\n`;
          doc += `**${metadata.name}** acts as an **intermediary service** that receives requests/events, processes them, and forwards to downstream services.\n\n`;
        } else if (hasIncoming) {
          doc += `### Service Role\n`;
          doc += `**${metadata.name}** acts as a **consumer/endpoint service** that receives and processes requests/events.\n\n`;
        } else if (hasOutgoing) {
          doc += `### Service Role\n`;
          doc += `**${metadata.name}** acts as a **producer/client service** that initiates requests and publishes events.\n\n`;
        }
        
        // Upstream Dependencies (who calls us)
        if (apiEndpoints.length > 0 || consumers.length > 0) {
          doc += `### Upstream Dependencies (Who calls/triggers this service)\n\n`;
          
          if (apiEndpoints.length > 0) {
            doc += `**REST API Consumers:**\n`;
            doc += `- External services/UIs can call our ${apiEndpoints.length} exposed endpoint(s)\n`;
            const uniquePaths = [...new Set(apiEndpoints.map(n => {
              const endpoint = n.details;
              return endpoint.path || n.label;
            }))];
            uniquePaths.slice(0, 5).forEach(path => {
              doc += `  - \`${path}\`\n`;
            });
            if (uniquePaths.length > 5) {
              doc += `  - ... and ${uniquePaths.length - 5} more\n`;
            }
            doc += '\n';
          }
          
          if (consumers.length > 0) {
            doc += `**Message Queue Publishers:**\n`;
            doc += `- Services publishing to topics we consume:\n`;
            consumers.forEach(node => {
              const consumer = node.details;
              doc += `  - \`${consumer.topic || node.label}\` (${consumer.framework || 'message queue'})\n`;
            });
            doc += '\n';
          }
        }
        
        // Downstream Dependencies (who we call)
        if (apiClients.length > 0 || producers.length > 0 || datastores.length > 0) {
          doc += `### Downstream Dependencies (Services/Systems this service calls)\n\n`;
          
          if (apiClients.length > 0) {
            doc += `**External Service Calls:**\n`;
            apiClients.forEach(node => {
              const client = node.details;
              const url = client.url || 'unknown';
              const serviceName = this.extractServiceName(url);
              doc += `- **${serviceName}** → \`${url}\`\n`;
            });
            doc += '\n';
          }
          
          if (producers.length > 0) {
            doc += `**Message Queue Subscriptions:**\n`;
            doc += `- Services consuming topics we publish to:\n`;
            producers.forEach(node => {
              const producer = node.details;
              doc += `  - \`${producer.topic || node.label}\` (${producer.framework || 'message queue'})\n`;
            });
            doc += '\n';
          }
          
          if (datastores.length > 0) {
            doc += `**Data Stores:**\n`;
            const dbTypes = [...new Set(datastores.map(n => n.details.type))];
            dbTypes.forEach(dbType => {
              const ops = datastores.filter(n => n.details.type === dbType);
              doc += `- **${dbType}**: ${ops.length} operation(s) — data persistence layer\n`;
            });
            doc += '\n';
          }
        }
        
        // Workflow Sequence - Detailed with file names
        doc += `### Data Flow Diagram\n\n`;
        doc += `This shows the complete data flow through ${metadata.name} with specific files and topics:\n\n`;
        doc += '```\n';
        let step = 1;
        
        // Incoming flow - with file details
        if (consumers.length > 0) {
          doc += `📥 INCOMING EVENTS:\n`;
          consumers.forEach(node => {
            const consumer = node.details;
            const fileName = node.file ? path.basename(node.file) : 'unknown';
            doc += `${step}. [Upstream Service] \n`;
            doc += `   → Kafka Topic: "${consumer.topic || node.label}" ${consumer.framework ? `(${consumer.framework})` : ''}\n`;
            doc += `   → Consumer: ${fileName} (line ${node.line || '?'})\n`;
            doc += `   → Handler: ${consumer.handler || 'processMessage()'}\n\n`;
            step++;
          });
        }
        
        if (apiEndpoints.length > 0) {
          doc += `📥 INCOMING API REQUESTS:\n`;
          const sampleEndpoints = apiEndpoints.slice(0, 3);
          sampleEndpoints.forEach(node => {
            const endpoint = node.details;
            const fileName = node.file ? path.basename(node.file) : 'unknown';
            doc += `${step}. [Client/UI] \n`;
            doc += `   → ${endpoint.method || 'HTTP'} ${endpoint.path || node.label}\n`;
            doc += `   → Controller: ${fileName}\n`;
            doc += `   → Handler: ${endpoint.handler || 'handleRequest()'}\n\n`;
            step++;
          });
          if (apiEndpoints.length > 3) {
            doc += `   ... and ${apiEndpoints.length - 3} more endpoints\n\n`;
          }
        }
        
        // Processing - with file details
        if (apiClients.length > 0) {
          doc += `📤 OUTGOING API CALLS:\n`;
          apiClients.forEach(node => {
            const client = node.details;
            const fileName = node.file ? path.basename(node.file) : 'unknown';
            const serviceName = this.extractServiceName(client.url || '');
            doc += `${step}. [${metadata.name}]\n`;
            doc += `   → File: ${fileName} (line ${node.line || '?'})\n`;
            doc += `   → Calls: ${client.method || 'HTTP'} ${client.url || 'unknown'}\n`;
            doc += `   → Target Service: ${serviceName}\n\n`;
            step++;
          });
        }
        
        // Data storage - with details
        if (datastores.length > 0) {
          doc += `💾 DATA STORAGE:\n`;
          const dbGroups = new Map<string, any[]>();
          datastores.forEach(node => {
            const type = node.details.type;
            if (!dbGroups.has(type)) {
              dbGroups.set(type, []);
            }
            dbGroups.get(type)!.push(node);
          });
          
          dbGroups.forEach((nodes, dbType) => {
            doc += `${step}. [${metadata.name}]\n`;
            doc += `   → Database: ${dbType}\n`;
            const sampleOps = nodes.slice(0, 3);
            sampleOps.forEach(node => {
              const fileName = node.file ? path.basename(node.file) : 'unknown';
              const op = node.details;
              doc += `   → ${op.operation || 'query'}: ${op.collection || op.index || 'data'} (${fileName})\n`;
            });
            if (nodes.length > 3) {
              doc += `   → ... and ${nodes.length - 3} more operations\n`;
            }
            doc += '\n';
            step++;
          });
        }
        
        // Outgoing flow - with file details
        if (producers.length > 0) {
          doc += `📤 OUTGOING EVENTS:\n`;
          producers.forEach(node => {
            const producer = node.details;
            const fileName = node.file ? path.basename(node.file) : 'unknown';
            doc += `${step}. [${metadata.name}]\n`;
            doc += `   → File: ${fileName} (line ${node.line || '?'})\n`;
            doc += `   → Publishes to Kafka Topic: "${producer.topic || node.label}" ${producer.framework ? `(${producer.framework})` : ''}\n`;
            doc += `   → Message Type: ${producer.messageType || 'Event'}\n`;
            doc += `   → Downstream: [Services consuming this topic]\n\n`;
            step++;
          });
        }
        
        if (apiEndpoints.length > 0 && step > 1) {
          doc += `📤 RESPONSE:\n`;
          doc += `${step}. [${metadata.name}] → HTTP Response → [Client/UI]\n`;
        }
        
        doc += '```\n\n';
        
        // Integration Notes
        doc += `### Integration Notes\n\n`;
        doc += `- **Total API Endpoints Exposed**: ${apiEndpoints.length}\n`;
        doc += `- **External Services Called**: ${apiClients.length}\n`;
        doc += `- **Message Topics Published**: ${producers.length}\n`;
        doc += `- **Message Topics Consumed**: ${consumers.length}\n`;
        doc += `- **Data Stores Used**: ${datastores.length > 0 ? [...new Set(datastores.map(n => n.details.type))].join(', ') : 'None'}\n\n`;
      }
    } catch (error) {
      doc += `*Unable to analyze data flow: ${error instanceof Error ? error.message : 'Unknown error'}*\n\n`;
    }

    // UI Module Dependencies (for React/frontend projects)
    try {
      const uiDeps = this.analyzeUIModuleDependencies(projectPath);
      if (uiDeps && (uiDeps.externalRoutes.length > 0 || uiDeps.localRoutes.length > 0)) {
        doc += `## UI Module Dependencies\n\n`;
        doc += `This section shows which UI components/pages are loaded from external packages vs local code.\n\n`;
        
        if (uiDeps.externalRoutes.length > 0) {
          doc += `### External UI Modules (from npm packages)\n\n`;
          doc += `These components are imported from external dependencies:\n\n`;
          
          const grouped = new Map<string, any[]>();
          uiDeps.externalRoutes.forEach((route: any) => {
            if (!grouped.has(route.package)) {
              grouped.set(route.package, []);
            }
            grouped.get(route.package)!.push(route);
          });
          
          grouped.forEach((routes, pkg) => {
            doc += `**${pkg}**\n`;
            routes.forEach((route: any) => {
              doc += `- \`${route.path || route.name}\` → \`${route.component}\`\n`;
            });
            doc += '\n';
          });
        }
        
        if (uiDeps.localRoutes.length > 0) {
          doc += `### Local UI Modules (from this repository)\n\n`;
          doc += `These components are defined locally in this repository:\n\n`;
          
          // Show all local routes, not just first 10
          uiDeps.localRoutes.forEach((route: any) => {
            doc += `- \`${route.path || route.name}\` → \`${route.component}\` (${route.file})\n`;
          });
          
          doc += '\n';
        }
        
        if (uiDeps.summary) {
          doc += `### Summary\n\n`;
          doc += `- **Total Routes**: ${uiDeps.summary.total}\n`;
          doc += `- **External Modules**: ${uiDeps.summary.external} (from ${uiDeps.summary.externalPackages} package(s))\n`;
          doc += `- **Local Modules**: ${uiDeps.summary.local}\n\n`;
        }
      }
    } catch (error) {
      // Skip UI dependencies if not applicable or error occurs
    }

    // Hotspot Files - Enhanced table with import counts
    doc += `## Hotspot Files\n\n`;
    doc += `Files with high change frequency and/or high import counts:\n\n`;
    
    try {
      const hotspots = this.advancedIntel.findHotspotFiles(projectPath, 10);
      
      if (hotspots.length > 0) {
        // Get import counts for correlation
        const importAnalysis = this.codeAnalyzer.analyzeAllCode(projectPath);
        const fileImportCounts = new Map<string, number>();
        
        if (importAnalysis && importAnalysis.imports.length > 0) {
          importAnalysis.imports.forEach((imp) => {
            const count = fileImportCounts.get(imp.source) || 0;
            fileImportCounts.set(imp.source, count + 1);
          });
        }
        
        doc += `| File | Git Changes | Imported By | Risk | Action |\n`;
        doc += `|------|-------------|-------------|------|--------|\n`;
        
        hotspots.forEach(hotspot => {
          const fileName = path.basename(hotspot.filePath);
          const importCount = fileImportCounts.get(fileName) || 0;
          const riskEmoji = hotspot.riskScore >= 80 ? '🔴' : 
                           hotspot.riskScore >= 50 ? '🟡' : '🟢';
          const action = hotspot.riskScore >= 80 ? 'Consider splitting' :
                        hotspot.riskScore >= 50 ? 'Review & document' : 'Monitor';
          
          doc += `| ${fileName} | ${hotspot.changeCount} commits | ${importCount} files | ${riskEmoji} ${hotspot.riskScore} | ${action} |\n`;
        });
        doc += '\n';
        
        const highRiskCount = hotspots.filter(h => h.riskScore >= 80).length;
        if (highRiskCount > 0) {
          doc += `⚠️ **${highRiskCount} high-risk file${highRiskCount > 1 ? 's' : ''}** detected. These files are changed frequently and may benefit from refactoring.\n\n`;
        }
      } else {
        doc += `*No git history available or no hotspots detected.*\n\n`;
      }
    } catch (error) {
      doc += `*Unable to analyze hotspots: ${error instanceof Error ? error.message : 'Unknown error'}*\n\n`;
    }

    // Call Graph Analysis - Method Complexity and Relationships
    doc += `## Method Complexity Analysis\n\n`;
    doc += `This section analyzes method relationships and call hierarchies across the codebase.\n\n`;
    
    try {
      const callGraph = this.callGraphAnalyzer.buildCallGraph(projectPath);
      const stats = this.callGraphAnalyzer.getStatistics();
      
      if (stats.totalMethods > 0) {
        doc += `### Overview\n\n`;
        doc += `- **Total Methods:** ${stats.totalMethods}\n`;
        doc += `- **Call Relationships:** ${stats.totalCallRelationships}\n`;
        doc += `- **Entry Points:** ${stats.entryPoints} (methods with no callers)\n`;
        doc += `- **Leaf Nodes:** ${stats.leafNodes} (methods that don't call anything)\n`;
        doc += `- **Average Calls per Method:** ${stats.averageCallsPerMethod}\n`;
        doc += `- **Maximum Call Depth:** ${stats.maxCallDepth}\n`;
        doc += `- **Cross-Module Dependencies:** ${stats.moduleDependencies}\n\n`;
        
        // Most Complex Methods (highest call depth)
        doc += `### Most Complex Methods\n\n`;
        doc += `Methods with the highest number of outgoing calls (complexity hotspots):\n\n`;
        
        const methodComplexity: Array<{ id: string; name: string; file: string; line: number; callees: number }> = [];
        for (const [id, node] of callGraph.nodes.entries()) {
          methodComplexity.push({
            id,
            name: node.method.name,
            file: node.method.filePath,
            line: node.method.line,
            callees: node.callees.length
          });
        }
        
        methodComplexity.sort((a, b) => b.callees - a.callees);
        const topComplex = methodComplexity.slice(0, 10);
        
        doc += `| Method | File | Calls Made | Complexity |\n`;
        doc += `|--------|------|------------|------------|\n`;
        
        for (const method of topComplex) {
          const fileName = path.basename(method.file);
          const complexity = method.callees >= 8 ? '🔴 High' : method.callees >= 5 ? '🟡 Medium' : '🟢 Low';
          doc += `| \`${method.name}\` | ${fileName}:${method.line} | ${method.callees} | ${complexity} |\n`;
        }
        doc += '\n';
        
        // Critical Path Analysis - Entry Points
        doc += `### Critical Execution Paths\n\n`;
        doc += `Entry points are methods that are not called by any other methods in the codebase. These are typically:\n`;
        doc += `- Main application entry points\n`;
        doc += `- Public API endpoints\n`;
        doc += `- Event handlers\n`;
        doc += `- Callback functions\n\n`;
        
        if (callGraph.entryPoints.length > 0) {
          doc += `**Top Entry Points:**\n\n`;
          const topEntries = callGraph.entryPoints.slice(0, 10);
          for (const entryId of topEntries) {
            const node = callGraph.nodes.get(entryId);
            if (node) {
              const fileName = path.basename(node.method.filePath);
              const calleeCount = node.callees.length;
              doc += `- **${node.method.name}** (\`${fileName}:${node.method.line}\`) → calls ${calleeCount} method(s)\n`;
            }
          }
          if (callGraph.entryPoints.length > 10) {
            doc += `- ... and ${callGraph.entryPoints.length - 10} more entry points\n`;
          }
          doc += '\n';
        } else {
          doc += `*No clear entry points detected. All methods are called by other methods.*\n\n`;
        }
        
        // Module Coupling Analysis
        doc += `### Module Coupling\n\n`;
        doc += `Cross-module dependencies show which files are most interconnected:\n\n`;
        
        if (callGraph.moduleGraph.size > 0) {
          const moduleCoupling: Array<{ module: string; dependencies: number }> = [];
          for (const [module, deps] of callGraph.moduleGraph.entries()) {
            moduleCoupling.push({
              module: path.basename(module),
              dependencies: deps.size
            });
          }
          
          moduleCoupling.sort((a, b) => b.dependencies - a.dependencies);
          const topCoupled = moduleCoupling.slice(0, 10);
          
          doc += `| Module | Depends On | Coupling |\n`;
          doc += `|--------|------------|----------|\n`;
          
          for (const mod of topCoupled) {
            const coupling = mod.dependencies >= 5 ? '🔴 High' : mod.dependencies >= 3 ? '🟡 Medium' : '🟢 Low';
            doc += `| \`${mod.module}\` | ${mod.dependencies} modules | ${coupling} |\n`;
          }
          doc += '\n';
        } else {
          doc += `*No cross-module dependencies detected. Methods are contained within their own files.*\n\n`;
        }
        
      } else {
        doc += `*No methods detected for call graph analysis. The project may not contain supported code files (JS/TS/Java/Python).*\n\n`;
      }
    } catch (error) {
      doc += `*Unable to analyze call graph: ${error instanceof Error ? error.message : 'Unknown error'}*\n\n`;
    }

    // Method Distribution Analysis
    doc += `## Method Distribution\n\n`;
    doc += `This section shows how methods are distributed across the codebase.\n\n`;
    
    try {
      const callGraph = this.callGraphAnalyzer.getCallGraph();
      
      if (callGraph.nodes.size > 0) {
        // Group methods by file
        const methodsByFile = new Map<string, number>();
        for (const [id, node] of callGraph.nodes.entries()) {
          const file = node.method.filePath;
          methodsByFile.set(file, (methodsByFile.get(file) || 0) + 1);
        }
        
        // Sort by method count
        const fileStats = Array.from(methodsByFile.entries())
          .map(([file, count]) => ({ file: path.basename(file), fullPath: file, count }))
          .sort((a, b) => b.count - a.count);
        
        doc += `### Files with Most Methods\n\n`;
        doc += `Files containing the most method definitions:\n\n`;
        
        doc += `| File | Method Count | Density |\n`;
        doc += `|------|--------------|----------|\n`;
        
        const topFiles = fileStats.slice(0, 10);
        for (const file of topFiles) {
          const density = file.count >= 20 ? '🔴 High' : file.count >= 10 ? '🟡 Medium' : '🟢 Low';
          doc += `| \`${file.file}\` | ${file.count} | ${density} |\n`;
        }
        doc += '\n';
        
        // Call Density - files with most function calls
        doc += `### Call Density\n\n`;
        doc += `Files with the most outgoing method calls (high activity):\n\n`;
        
        const callDensity = new Map<string, number>();
        for (const edge of callGraph.edges) {
          const callerNode = callGraph.nodes.get(edge.caller);
          if (callerNode) {
            const file = callerNode.method.filePath;
            callDensity.set(file, (callDensity.get(file) || 0) + 1);
          }
        }
        
        const densityStats = Array.from(callDensity.entries())
          .map(([file, count]) => ({ file: path.basename(file), count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        if (densityStats.length > 0) {
          doc += `| File | Outgoing Calls | Activity |\n`;
          doc += `|------|----------------|----------|\n`;
          
          for (const stat of densityStats) {
            const activity = stat.count >= 30 ? '🔴 Very High' : stat.count >= 15 ? '🟡 High' : '🟢 Normal';
            doc += `| \`${stat.file}\` | ${stat.count} | ${activity} |\n`;
          }
          doc += '\n';
        }
        
        // Cross-Module Dependencies Visualization
        doc += `### Cross-Module Dependencies\n\n`;
        doc += `Visual representation of how modules depend on each other:\n\n`;
        
        if (callGraph.moduleGraph.size > 0) {
          doc += '```\n';
          
          const moduleEntries = Array.from(callGraph.moduleGraph.entries())
            .slice(0, 15); // Limit to avoid overwhelming output
          
          for (const [module, deps] of moduleEntries) {
            const moduleName = path.basename(module);
            doc += `${moduleName}\n`;
            
            const depArray = Array.from(deps).slice(0, 5);
            for (let i = 0; i < depArray.length; i++) {
              const dep = depArray[i];
              const depName = path.basename(dep);
              const isLast = i === depArray.length - 1;
              doc += `  ${isLast ? '└─' : '├─'} → ${depName}\n`;
            }
            
            if (deps.size > 5) {
              doc += `  └─ ... and ${deps.size - 5} more\n`;
            }
            doc += '\n';
          }
          
          if (callGraph.moduleGraph.size > 15) {
            doc += `... and ${callGraph.moduleGraph.size - 15} more modules\n`;
          }
          
          doc += '```\n\n';
        } else {
          doc += `*No cross-module dependencies detected.*\n\n`;
        }
        
      } else {
        doc += `*No method distribution data available.*\n\n`;
      }
    } catch (error) {
      doc += `*Unable to analyze method distribution: ${error instanceof Error ? error.message : 'Unknown error'}*\n\n`;
    }

    // Architecture Layers - Enhanced with examples
    doc += `## Code Organization\n\n`;
    doc += `This section explains how the code is organized and what each layer does:\n\n`;
    
    const layers = this.advancedIntel.getArchitectureSummary(projectPath);
    if (layers.length > 0) {
      layers.forEach(layer => {
        doc += `### ${layer.name}\n`;
        doc += `**Purpose:** ${layer.description}\n\n`;
        doc += `- **File Count:** ${layer.files.length} files\n`;
        doc += `- **Pattern Match:** \`${layer.pattern}\`\n`;
        
        // Add sample files
        if (layer.files.length > 0) {
          doc += `- **Example Files:**\n`;
          const sampleFiles = layer.files.slice(0, 3);
          sampleFiles.forEach(file => {
            const fileName = path.basename(file);
            doc += `  - \`${fileName}\`\n`;
          });
          if (layer.files.length > 3) {
            doc += `  - ... and ${layer.files.length - 3} more\n`;
          }
        }
        
        // Add what this layer does
        doc += `- **What it does:**\n`;
        if (layer.name.toLowerCase().includes('controller')) {
          doc += `  - Handles incoming HTTP requests\n`;
          doc += `  - Routes requests to appropriate services\n`;
          doc += `  - Returns HTTP responses\n`;
        } else if (layer.name.toLowerCase().includes('service')) {
          doc += `  - Contains business logic\n`;
          doc += `  - Orchestrates data operations\n`;
          doc += `  - Calls repositories and external services\n`;
        } else if (layer.name.toLowerCase().includes('repository') || layer.name.toLowerCase().includes('dao')) {
          doc += `  - Handles database operations\n`;
          doc += `  - Executes queries and updates\n`;
          doc += `  - Abstracts data access layer\n`;
        } else if (layer.name.toLowerCase().includes('model') || layer.name.toLowerCase().includes('entity')) {
          doc += `  - Defines data structures\n`;
          doc += `  - Represents database tables/documents\n`;
          doc += `  - Used for data transfer between layers\n`;
        } else if (layer.name.toLowerCase().includes('config')) {
          doc += `  - Application configuration\n`;
          doc += `  - Bean definitions and setup\n`;
          doc += `  - Environment-specific settings\n`;
        } else if (layer.name.toLowerCase().includes('util') || layer.name.toLowerCase().includes('helper')) {
          doc += `  - Reusable utility functions\n`;
          doc += `  - Common helper methods\n`;
          doc += `  - Shared constants and enums\n`;
        } else if (layer.name.toLowerCase().includes('test')) {
          doc += `  - Unit and integration tests\n`;
          doc += `  - Test utilities and fixtures\n`;
          doc += `  - Ensures code quality\n`;
        } else {
          doc += `  - ${layer.description}\n`;
        }
        
        doc += '\n';
      });
      
      // Add flow explanation
      doc += `### Typical Request Flow\n\n`;
      const hasControllers = layers.some(l => l.name.toLowerCase().includes('controller'));
      const hasServices = layers.some(l => l.name.toLowerCase().includes('service'));
      const hasRepos = layers.some(l => l.name.toLowerCase().includes('repository') || l.name.toLowerCase().includes('dao'));
      
      if (hasControllers && hasServices && hasRepos) {
        doc += '```\n';
        doc += 'Client Request\n';
        doc += '    ↓\n';
        doc += 'Controller (validates input, routes request)\n';
        doc += '    ↓\n';
        doc += 'Service (business logic, orchestration)\n';
        doc += '    ↓\n';
        doc += 'Repository (database operations)\n';
        doc += '    ↓\n';
        doc += 'Database\n';
        doc += '```\n\n';
      } else if (hasControllers && hasServices) {
        doc += '```\n';
        doc += 'Client Request → Controller → Service → Response\n';
        doc += '```\n\n';
      }
    } else {
      doc += `*No clear layered architecture detected. The project may use a different organizational pattern.*\n\n`;
    }

    doc += `---\n`;
    doc += `*Generated by repository-analyzer-mcp on ${currentDate}*\n`;

    return doc;
  }

  /**
   * Generate full comprehensive document
   */
  private async generateFullDocument(projectPath: string, metadata: ProjectMetadata): Promise<string> {
    const summary = this.generateSummaryDocument(projectPath, metadata);
    const architecture = await this.generateArchitectureDocument(projectPath, metadata);
    
    // Combine both with a separator
    let doc = `# ${metadata.name} - Complete Repository Report\n\n`;
    doc += `This document provides a comprehensive overview of the repository structure, dependencies, and architecture.\n\n`;
    
    // Add Table of Contents
    doc += `## 📑 Table of Contents\n\n`;
    doc += `1. [Project Summary](#-project-summary)\n`;
    doc += `   - [What is this?](#what-is-this)\n`;
    doc += `   - [Tech Stack](#tech-stack)\n`;
    doc += `   - [Key Dependencies](#key-dependencies)\n`;
    doc += `   - [Dependency Summary](#dependency-summary)\n`;
    doc += `2. [Architecture Analysis](#-architecture-analysis)\n`;
    doc += `   - [System Architecture Overview](#system-architecture-overview)\n`;
    doc += `   - [Project Structure](#project-structure)\n`;
    doc += `   - [Dependency Graph](#dependency-graph)\n`;
    doc += `   - [Circular Dependencies](#circular-dependencies)\n`;
    doc += `   - [Inter-Service Dependencies](#inter-service-dependencies)\n`;
    doc += `   - [Workflow & Integration Map](#workflow--integration-map)\n`;
    doc += `   - [UI Module Dependencies](#ui-module-dependencies)\n`;
    doc += `   - [Hotspot Files](#hotspot-files-most-imported)\n`;
    doc += `   - [Code Organization](#code-organization)\n`;
    doc += `\n`;
    doc += `---\n\n`;
    
    // Add summary section
    doc += summary.replace(`# Project: ${metadata.name}`, '## 📋 Project Summary');
    doc += `\n---\n\n`;
    
    // Add architecture section
    doc += architecture.replace(`# Architecture: ${metadata.name}`, '## 🏗️ Architecture Analysis');

    return doc;
  }

  /**
   * Analyze project structure and detect patterns
   */
  private analyzeProjectStructure(projectPath: string): string {
    let structure = '';

    try {
      const detectedDirs: string[] = [];
      let basePath = '';
      
      // Check for Java/Maven structure (src/main/java)
      const javaMainPath = path.join(projectPath, 'src', 'main', 'java');
      if (fs.existsSync(javaMainPath)) {
        basePath = 'src/main/java';
        structure += 'Detected structure:\n\n';
        structure += '```\n';
        structure += 'src/\n';
        structure += '  main/\n';
        structure += '    java/\n';
        
        // Find package structure
        const findPackages = (dir: string, depth: number = 0): void => {
          if (depth > 3) return; // Limit depth
          try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              if (item.isDirectory()) {
                const indent = '      ' + '  '.repeat(depth);
                const fullPath = path.join(dir, item.name);
                const files = fs.readdirSync(fullPath);
                const javaFiles = files.filter(f => f.endsWith('.java'));
                if (javaFiles.length > 0) {
                  detectedDirs.push(`${indent}${item.name}/ (${javaFiles.length} files)`);
                  structure += `${indent}${item.name}/ (${javaFiles.length} files)\n`;
                }
                if (depth < 2) {
                  findPackages(fullPath, depth + 1);
                }
              }
            }
          } catch (e) {
            // Skip if can't read directory
          }
        };
        
        findPackages(javaMainPath);
        structure += '```\n';
        
        // Detect architectural pattern for Java
        const structureText = detectedDirs.join(' ').toLowerCase();
        const hasControllers = structureText.includes('controller');
        const hasServices = structureText.includes('service');
        const hasRepositories = structureText.includes('repository') || structureText.includes('dao');
        const hasModels = structureText.includes('model') || structureText.includes('entity');
        
        if (hasControllers && hasServices && hasRepositories) {
          structure += '\n**Detected pattern**: Layered Spring Boot Architecture (Controller → Service → Repository)\n';
        } else if (hasControllers && hasServices) {
          structure += '\n**Detected pattern**: Service-Oriented Architecture\n';
        } else {
          structure += '\n**Detected pattern**: Java/Maven Project\n';
        }
        
        return structure;
      }
      
      // Check for Node.js/Frontend structure (src/)
      const srcPath = path.join(projectPath, 'src');
      if (fs.existsSync(srcPath)) {
        basePath = 'src';
        const commonDirs = ['components', 'services', 'controllers', 'models', 'views', 'utils', 'config', 'api', 'pages', 'hooks', 'store'];
        
        for (const dir of commonDirs) {
          const dirPath = path.join(srcPath, dir);
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            detectedDirs.push(`  ${dir}/ (${files.length} files)`);
          }
        }

        if (detectedDirs.length > 0) {
          structure += 'Detected structure:\n\n';
          structure += '```\n';
          structure += 'src/\n';
          detectedDirs.forEach(dir => structure += `${dir}\n`);
          structure += '```\n';

          // Detect architectural pattern
          const structureText = detectedDirs.join(' ').toLowerCase();
          const hasControllers = structureText.includes('controllers');
          const hasServices = structureText.includes('services');
          const hasModels = structureText.includes('models');
          const hasComponents = structureText.includes('components');
          const hasPages = structureText.includes('pages');

          if (hasControllers && hasServices && hasModels) {
            structure += '\n**Detected pattern**: Layered MVC Architecture\n';
          } else if (hasComponents && hasPages) {
            structure += '\n**Detected pattern**: Component-Based Frontend (React/Vue/Angular)\n';
          } else if (hasComponents) {
            structure += '\n**Detected pattern**: Component-Based Architecture\n';
          } else {
            structure += '\n**Detected pattern**: Custom/Mixed Architecture\n';
          }
          
          return structure;
        }
      }
      
      // Fallback: list top-level directories
      const topLevel = fs.readdirSync(projectPath, { withFileTypes: true })
        .filter(item => item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules')
        .slice(0, 10);
      
      if (topLevel.length > 0) {
        structure += 'Top-level directories:\n\n';
        structure += '```\n';
        topLevel.forEach(dir => {
          structure += `${dir.name}/\n`;
        });
        structure += '```\n';
      } else {
        structure += '*Unable to detect standard project structure.*\n';
      }
    } catch (error) {
      structure += `*Error analyzing structure: ${error instanceof Error ? error.message : 'Unknown error'}*\n`;
    }

    return structure;
  }

  /**
   * Detect circular dependencies (simplified version)
   */
  private detectCircularDependencies(projectPath: string): string[][] {
    // This is a simplified implementation
    // In a real scenario, you'd use AST analysis to build a full dependency graph
    const circularChains: string[][] = [];
    
    try {
      const importAnalysis = this.codeAnalyzer.analyzeAllCode(projectPath);
      
      // Build adjacency list from imports
      const graph = new Map<string, Set<string>>();
      
      importAnalysis.imports.forEach((imp) => {
        if (!graph.has(imp.filePath)) {
          graph.set(imp.filePath, new Set());
        }
        graph.get(imp.filePath)!.add(imp.source);
      });

      // Simple cycle detection using DFS
      const visited = new Set<string>();
      const recStack = new Set<string>();

      const dfs = (node: string, path: string[]): boolean => {
        visited.add(node);
        recStack.add(node);
        path.push(node);

        const neighbors = graph.get(node) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            if (dfs(neighbor, [...path])) return true;
          } else if (recStack.has(neighbor)) {
            // Found a cycle
            const cycleStart = path.indexOf(neighbor);
            if (cycleStart !== -1) {
              circularChains.push([...path.slice(cycleStart), neighbor]);
            }
            return true;
          }
        }

        recStack.delete(node);
        return false;
      };

      for (const node of graph.keys()) {
        if (!visited.has(node)) {
          dfs(node, []);
        }
      }
    } catch (error) {
      // Silently fail
    }

    return circularChains.slice(0, 5); // Return max 5 circular dependencies
  }

  /**
   * Get dependency statistics
   */
  private getDependencyStats(projectPath: string): DependencyStats {
    let modules = this.dbManager.getAllModules();
    
    // If database is empty, scan for manifest files
    if (modules.length === 0) {
      modules = this.scanManifestFiles(projectPath);
    }
    
    let production = 0;
    let dev = 0;

    for (const module of modules) {
      // Try to get from database first
      let deps = this.dbManager.getDependencies(module.id);
      
      // If database is empty, parse the manifest file directly
      if (deps.length === 0) {
        deps = this.parseManifestDependencies(module.path, module.ecosystem);
      }
      
      production += deps.filter(d => !d.isDev).length;
      dev += deps.filter(d => d.isDev).length;
    }

    return {
      production,
      dev,
      total: production + dev,
    };
  }

  /**
   * Get ecosystem label
   */
  private getEcosystemLabel(ecosystem: string): string {
    const labels: { [key: string]: string } = {
      npm: 'Frontend/Node.js',
      maven: 'Java/Maven',
      pip: 'Python',
      gradle: 'Java/Gradle',
      composer: 'PHP',
      cargo: 'Rust',
    };
    return labels[ecosystem] || ecosystem;
  }

  /**
   * Get module label from path
   */
  private getModuleLabel(modulePath: string, ecosystem: string): string {
    const fileName = path.basename(modulePath);
    const labels: { [key: string]: string } = {
      'package.json': 'Frontend (package.json)',
      'pom.xml': 'Backend (pom.xml)',
      'requirements.txt': 'Python (requirements.txt)',
      'Cargo.toml': 'Rust (Cargo.toml)',
    };
    return labels[fileName] || `${ecosystem} (${fileName})`;
  }

  /**
   * Extract npm package information
   */
  private extractNpmPackageInfo(projectPath: string): any {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return {
        name: pkg.name || 'unknown',
        version: pkg.version || '0.0.0',
        exports: pkg.exports || null,
        peerDependencies: pkg.peerDependencies || {},
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {},
        scripts: pkg.scripts || {},
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract Maven project information
   */
  private extractMavenInfo(projectPath: string): any {
    const pomPath = path.join(projectPath, 'pom.xml');
    if (!fs.existsSync(pomPath)) {
      return null;
    }

    try {
      const pomContent = fs.readFileSync(pomPath, 'utf-8');
      
      // Extract basic info
      const artifactIdMatch = pomContent.match(/<artifactId>(.*?)<\/artifactId>/);
      const versionMatch = pomContent.match(/<version>(.*?)<\/version>/);
      const groupIdMatch = pomContent.match(/<groupId>(.*?)<\/groupId>/);
      
      return {
        groupId: groupIdMatch ? groupIdMatch[1] : 'unknown',
        artifactId: artifactIdMatch ? artifactIdMatch[1] : 'unknown',
        version: versionMatch ? versionMatch[1] : '0.0.0',
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate tech stack summary table
   */
  private generateTechStackTable(projectPath: string, metadata: ProjectMetadata): string {
    let table = '| Technology | Details |\n';
    table += '|------------|----------|\n';
    
    // Frontend
    const npmInfo = this.extractNpmPackageInfo(projectPath);
    if (npmInfo) {
      const deps = npmInfo.dependencies;
      if (deps.react) table += `| **Frontend Framework** | React ${deps.react.replace('^', '')} |\n`;
      if (deps.vue) table += `| **Frontend Framework** | Vue ${deps.vue.replace('^', '')} |\n`;
      if (deps.angular) table += `| **Frontend Framework** | Angular ${deps.angular.replace('^', '')} |\n`;
      if (deps.vite) table += `| **Build Tool** | Vite ${deps.vite.replace('^', '')} |\n`;
      if (deps.webpack) table += `| **Build Tool** | Webpack ${deps.webpack.replace('^', '')} |\n`;
      if (deps.typescript || npmInfo.devDependencies.typescript) {
        const tsVersion = deps.typescript || npmInfo.devDependencies.typescript;
        table += `| **Language** | TypeScript ${tsVersion.replace('^', '')} |\n`;
      }
    }
    
    // Backend
    const mavenInfo = this.extractMavenInfo(projectPath);
    if (mavenInfo) {
      table += `| **Backend Framework** | Java/Maven |\n`;
      table += `| **Artifact** | ${mavenInfo.groupId}:${mavenInfo.artifactId} |\n`;
      table += `| **Version** | ${mavenInfo.version} |\n`;
    }
    
    // From tech stack detection
    for (const [ecosystem, stack] of Object.entries(metadata.techStack)) {
      if (stack.length > 0) {
        const key = ecosystem === 'npm' ? 'Node.js' : ecosystem === 'maven' ? 'Java' : ecosystem;
        if (!table.includes(key)) {
          table += `| **${key}** | ${stack.slice(0, 3).join(', ')} |\n`;
        }
      }
    }
    
    return table + '\n';
  }

  /**
   * Analyze UI module dependencies from routes
   */
  private analyzeUIModuleDependencies(projectPath: string): any {
    const result = {
      externalRoutes: [] as any[],
      localRoutes: [] as any[],
      summary: {
        total: 0,
        external: 0,
        local: 0,
        externalPackages: 0
      }
    };

    try {
      // Find routes files (routes.jsx, routes.js, routes.tsx, App.jsx, etc.)
      const routeFiles = this.findRouteFiles(projectPath);
      
      if (routeFiles.length === 0) {
        return null;
      }

      // Get package.json dependencies to identify external packages
      const packageJsonPath = path.join(projectPath, 'package.json');
      let externalPackages = new Set<string>();
      
      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          const allDeps = { ...pkg.dependencies, ...pkg.peerDependencies };
          externalPackages = new Set(Object.keys(allDeps));
        } catch (error) {
          // Continue without package info
        }
      }

      // Parse each route file
      for (const routeFile of routeFiles) {
        try {
          const content = fs.readFileSync(routeFile, 'utf-8');
          
          // Extract import statements
          const importRegex = /import\s+(?:{[^}]+}|[\w]+)\s+from\s+['"]([^'"]+)['"]/g;
          let match;
          
          const imports = new Map<string, string>(); // component name -> import source
          
          while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            const importStatement = match[0];
            
            // Extract component names from import
            const componentMatch = importStatement.match(/import\s+(?:{([^}]+)}|([\w]+))/);
            if (componentMatch) {
              const components = componentMatch[1] ? componentMatch[1].split(',').map(c => c.trim()) : [componentMatch[2]];
              components.forEach(comp => {
                imports.set(comp, importPath);
              });
            }
          }
          
          // Find route definitions - AsyncComponent(() => import("...")) pattern
          
          // Pattern: AsyncComponent(() => import("path/to/Component"))
          // Matches: import(/* webpackChunkName: "..." */ "path")
          const asyncComponentPattern = /AsyncComponent\s*\(\s*\(\s*\)\s*=>\s*import\s*\([^)]*["']([^"']+)["']\s*\)/g;
          let asyncMatch;
          
          // Also extract route names/paths from the structure
          // Pattern: name: "RouteName", ... component: AsyncComponent(...)
          const routeWithNamePattern = /(?:name|path):\s*["']([^"']+)["'][^}]*component:\s*AsyncComponent/g;
          const routeNames: string[] = [];
          let nameMatch;
          while ((nameMatch = routeWithNamePattern.exec(content)) !== null) {
            routeNames.push(nameMatch[1]);
          }
          
          let routeIndex = 0;
          while ((asyncMatch = asyncComponentPattern.exec(content)) !== null) {
            const importPath = asyncMatch[1];
            const routeName = routeNames[routeIndex] || `Route ${routeIndex + 1}`;
            routeIndex++;
            
            // Determine if it's external or local
            const isExternal = !importPath.startsWith('.') && !importPath.startsWith('/');
            
            if (isExternal) {
              // Extract package name from import path
              // e.g., "@company/ui-library/Component" -> "@company/ui-library"
              const packageName = importPath.split('/').slice(0, importPath.startsWith('@') ? 2 : 1).join('/');
              const componentName = importPath.split('/').pop() || importPath;
              
              if (externalPackages.has(packageName)) {
                result.externalRoutes.push({
                  path: routeName,
                  component: componentName,
                  package: packageName,
                  file: path.basename(routeFile)
                });
              } else {
                // External but not in package.json (maybe a sub-path)
                result.localRoutes.push({
                  path: routeName,
                  component: componentName,
                  file: importPath,
                  name: componentName
                });
              }
            } else {
              // Local import
              const componentName = importPath.split('/').pop() || importPath;
              result.localRoutes.push({
                path: routeName,
                component: componentName,
                file: importPath,
                name: componentName
              });
            }
          }
          
          // Also handle commonSubRoutes() from external packages
          const commonSubRoutesPattern = /commonSubRoutes\s*\(\s*\)/g;
          if (commonSubRoutesPattern.test(content)) {
            // Check if commonSubRoutes is imported from external package
            const commonSubRoutesImport = content.match(/import\s*{[^}]*commonSubRoutes[^}]*}\s*from\s*["']([^"']+)["']/);
            if (commonSubRoutesImport) {
              const packagePath = commonSubRoutesImport[1];
              const packageName = packagePath.split('/').slice(0, packagePath.startsWith('@') ? 2 : 1).join('/');
              
              if (externalPackages.has(packageName)) {
                result.externalRoutes.push({
                  path: 'Common Sub Routes',
                  component: 'commonSubRoutes()',
                  package: packageName,
                  file: path.basename(routeFile)
                });
              }
            }
          }
        } catch (error) {
          // Skip files we can't parse
        }
      }

      // Calculate summary
      result.summary.total = result.externalRoutes.length + result.localRoutes.length;
      result.summary.external = result.externalRoutes.length;
      result.summary.local = result.localRoutes.length;
      result.summary.externalPackages = new Set(result.externalRoutes.map(r => r.package)).size;

      return result.summary.total > 0 ? result : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find route files in the project
   */
  private findRouteFiles(projectPath: string): string[] {
    const routeFiles: string[] = [];
    const routeFileNames = ['routes.jsx', 'routes.js', 'routes.tsx', 'routes.ts', 'App.jsx', 'App.tsx', 'router.jsx', 'router.tsx'];
    
    const searchDir = (dir: string) => {
      // No depth limit - will search entire directory tree
      
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            const skipDirs = ['node_modules', '.git', 'dist', 'build', 'target', '.next', 'out', 'coverage', '__pycache__', '.venv', 'venv'];
            if (!skipDirs.includes(item.name)) {
              searchDir(fullPath);
            }
          } else if (item.isFile() && routeFileNames.includes(item.name)) {
            routeFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    searchDir(projectPath);
    return routeFiles;
  }

  /**
   * Generate ASCII architecture diagram
   */
  private generateAsciiArchitectureDiagram(serviceName: string, dataFlowGraph: any): string {
    let diagram = '```\n';
    diagram += '┌─────────────────────────────────────────────────────────────┐\n';
    diagram += '│                    SYSTEM ARCHITECTURE                       │\n';
    diagram += '├─────────────────────────────────────────────────────────────┤\n';
    diagram += '│                                                              │\n';
    
    // Extract components from data flow
    const apiEndpoints = dataFlowGraph.nodes.filter((n: any) => n.type === 'api_endpoint');
    const apiClients = dataFlowGraph.nodes.filter((n: any) => n.type === 'api_client');
    const producers = dataFlowGraph.nodes.filter((n: any) => n.type === 'producer');
    const consumers = dataFlowGraph.nodes.filter((n: any) => n.type === 'consumer');
    const datastores = dataFlowGraph.nodes.filter((n: any) => n.type === 'datastore');
    
    // Incoming connections
    if (consumers.length > 0 || apiEndpoints.length > 0) {
      diagram += '│  INCOMING:                                                   │\n';
      
      if (consumers.length > 0) {
        const topic = consumers[0].details.topic || 'kafka-topic';
        diagram += `│  ┌──────────┐                                               │\n`;
        diagram += `│  │ Upstream │ --Kafka: ${topic.substring(0, 20).padEnd(20)}--> │\n`;
        diagram += `│  │ Services │                                               │\n`;
        diagram += `│  └──────────┘                                               │\n`;
      }
      
      if (apiEndpoints.length > 0) {
        diagram += `│  ┌──────────┐                                               │\n`;
        diagram += `│  │ Client/  │ --HTTP (${apiEndpoints.length} endpoints)${' '.repeat(Math.max(0, 18 - apiEndpoints.length.toString().length))}--> │\n`;
        diagram += `│  │   UI     │                                               │\n`;
        diagram += `│  └──────────┘                                               │\n`;
      }
      
      diagram += '│       │                                                      │\n';
      diagram += '│       ↓                                                      │\n';
    }
    
    // Main service
    diagram += '│  ┌─────────────────────────────────────────────┐            │\n';
    const serviceLabel = serviceName.substring(0, 40).padEnd(40);
    diagram += `│  │  ${serviceLabel} │            │\n`;
    diagram += '│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │            │\n';
    diagram += '│  │  │Controller│→ │ Service  │→ │Repository│  │            │\n';
    diagram += '│  │  └──────────┘  └──────────┘  └──────────┘  │            │\n';
    diagram += '│  └──────┬──────────────┬──────────────┬────────┘            │\n';
    diagram += '│         │              │              │                      │\n';
    diagram += '│         ↓              ↓              ↓                      │\n';
    
    // Outgoing connections
    diagram += '│  OUTGOING:                                                   │\n';
    
    if (apiClients.length > 0) {
      const services = apiClients.slice(0, 2);
      services.forEach((client: any) => {
        const serviceName = this.extractServiceName(client.details.url || '').substring(0, 10).padEnd(10);
        diagram += `│  ┌──────────┐  `;
      });
      diagram += '                                     │\n';
      
      services.forEach((client: any) => {
        const serviceName = this.extractServiceName(client.details.url || '').substring(0, 10).padEnd(10);
        diagram += `│  │${serviceName}│  `;
      });
      diagram += '                                     │\n';
      
      services.forEach(() => {
        diagram += `│  └──────────┘  `;
      });
      diagram += '                                     │\n';
    }
    
    if (datastores.length > 0) {
      const dbTypes: string[] = Array.from(new Set(datastores.map((n: any) => n.details.type as string)));
      dbTypes.slice(0, 2).forEach((dbType: string) => {
        const label = dbType.substring(0, 10).padEnd(10);
        diagram += `│  ┌──────────┐  `;
      });
      diagram += '                                     │\n';
      
      dbTypes.slice(0, 2).forEach((dbType: string) => {
        const label = dbType.substring(0, 10).padEnd(10);
        diagram += `│  │${label}│  `;
      });
      diagram += '                                     │\n';
      
      dbTypes.slice(0, 2).forEach(() => {
        diagram += `│  └──────────┘  `;
      });
      diagram += '                                     │\n';
    }
    
    // Kafka topics
    if (producers.length > 0 || consumers.length > 0) {
      diagram += '│                                                              │\n';
      diagram += '│  Kafka Topics:                                              │\n';
      
      if (consumers.length > 0) {
        consumers.slice(0, 2).forEach((node: any) => {
          const topic = (node.details.topic || node.label).substring(0, 35);
          diagram += `│  ← ${topic.padEnd(35)} (incoming)        │\n`;
        });
      }
      
      if (producers.length > 0) {
        producers.slice(0, 2).forEach((node: any) => {
          const topic = (node.details.topic || node.label).substring(0, 35);
          diagram += `│  → ${topic.padEnd(35)} (outgoing)        │\n`;
        });
      }
    }
    
    diagram += '│                                                              │\n';
    diagram += '└─────────────────────────────────────────────────────────────┘\n';
    diagram += '```\n\n';
    
    return diagram;
  }

  /**
   * Extract service name from URL
   */
  private extractServiceName(url: string): string {
    try {
      // Remove protocol
      let name = url.replace(/^https?:\/\//, '');
      
      // Extract hostname
      const parts = name.split('/');
      name = parts[0];
      
      // Remove port
      name = name.split(':')[0];
      
      // Remove domain extensions and convert to readable name
      name = name.replace(/\.(com|net|org|io|dev|local)$/, '');
      
      // Convert hyphens/dots to spaces and title case
      name = name.split(/[-.]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      return name || 'External Service';
    } catch (error) {
      return 'External Service';
    }
  }
}
