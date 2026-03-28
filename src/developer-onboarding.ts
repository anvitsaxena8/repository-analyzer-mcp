import fs from 'fs';
import path from 'path';
import { AdvancedIntelligence } from './advanced-intelligence.js';
import { ASTAnalyzer } from './ast-analyzer.js';
import { CodeAnalyzer } from './code-analyzer.js';

export interface QuestionIntent {
  type: 'how_does_work' | 'where_is' | 'what_is' | 'show_me' | 'explain' | 'general';
  keywords: string[];
  feature?: string;
  component?: string;
}

export interface CodebaseContext {
  architecture: any;
  relevantFiles: string[];
  imports: any[];
  hotspots: any[];
  patterns: any[];
}

export class DeveloperOnboarding {
  constructor(
    private advancedIntel: AdvancedIntelligence,
    private astAnalyzer: ASTAnalyzer,
    private codeAnalyzer: CodeAnalyzer
  ) {}

  // Main entry point for developer questions
  async answerQuestion(question: string, repoPath: string): Promise<string> {
    // Parse the question to understand intent
    const intent = this.parseIntent(question);

    // Gather relevant context
    const context = await this.gatherContext(intent, repoPath);

    // Generate answer based on intent
    switch (intent.type) {
      case 'how_does_work':
        return this.explainFeature(intent, context, repoPath);
      case 'where_is':
        return this.locateComponent(intent, context, repoPath);
      case 'what_is':
        return this.describeComponent(intent, context, repoPath);
      case 'show_me':
        return this.showImplementation(intent, context, repoPath);
      case 'explain':
        return this.explainConcept(intent, context, repoPath);
      default:
        return this.generateOverview(context, repoPath);
    }
  }

  // Parse question to understand intent
  private parseIntent(question: string): QuestionIntent {
    const q = question.toLowerCase();

    // Extract keywords
    const keywords = this.extractKeywords(q);

    // Detect intent patterns
    if (q.match(/how (does|do|is|are).*(work|implement|handle)/)) {
      return {
        type: 'how_does_work',
        keywords,
        feature: this.extractFeature(q),
      };
    }

    if (q.match(/where (is|are|can i find).*(code|file|class|function|implementation)/)) {
      return {
        type: 'where_is',
        keywords,
        component: this.extractComponent(q),
      };
    }

    if (q.match(/what (is|are|does).*(do|mean|handle)/)) {
      return {
        type: 'what_is',
        keywords,
        component: this.extractComponent(q),
      };
    }

    if (q.match(/show me|find|list|display/)) {
      return {
        type: 'show_me',
        keywords,
      };
    }

    if (q.match(/explain|describe|tell me about/)) {
      return {
        type: 'explain',
        keywords,
      };
    }

    return {
      type: 'general',
      keywords,
    };
  }

  // Extract important keywords from question
  private extractKeywords(question: string): string[] {
    // Common technical terms and patterns
    const technicalTerms = [
      'auth', 'authentication', 'login', 'security', 'jwt', 'token',
      'database', 'db', 'sql', 'repository', 'dao', 'orm',
      'api', 'rest', 'endpoint', 'controller', 'route',
      'service', 'business logic', 'logic',
      'model', 'entity', 'dto', 'schema',
      'test', 'testing', 'unit test', 'integration',
      'config', 'configuration', 'settings',
      'middleware', 'interceptor', 'filter',
      'user', 'admin', 'role', 'permission',
      'payment', 'billing', 'subscription',
      'email', 'notification', 'messaging',
      'upload', 'download', 'file', 'storage',
      'cache', 'redis', 'session',
      'queue', 'job', 'worker', 'background',
    ];

    const keywords: string[] = [];
    for (const term of technicalTerms) {
      if (question.includes(term)) {
        keywords.push(term);
      }
    }

    // Also extract capitalized words (likely class/component names)
    const capitalizedWords = question.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g) || [];
    keywords.push(...capitalizedWords);

    return [...new Set(keywords)]; // Remove duplicates
  }

  // Extract feature name from question
  private extractFeature(question: string): string {
    const match = question.match(/how (?:does|do|is|are) (\w+(?:\s+\w+)*) (?:work|implement|handle)/);
    return match ? match[1] : '';
  }

  // Extract component name from question
  private extractComponent(question: string): string {
    const match = question.match(/(?:where is|what is|show me) (?:the )?(\w+(?:\s+\w+)*)/);
    return match ? match[1] : '';
  }

  // Gather relevant context from codebase
  private async gatherContext(intent: QuestionIntent, repoPath: string): Promise<CodebaseContext> {
    // Get architecture summary
    const architecture = this.advancedIntel.getArchitectureSummary(repoPath);

    // Find relevant files based on keywords
    const relevantFiles = this.findRelevantFiles(intent.keywords, repoPath);

    // Get imports for relevant files
    const astResult = this.astAnalyzer.analyzeAllAST(repoPath);
    const imports = astResult.imports.filter(imp => 
      intent.keywords.some(kw => imp.source.toLowerCase().includes(kw.toLowerCase()))
    );

    // Get hotspot files
    const hotspots = this.advancedIntel.findHotspotFiles(repoPath, 10);

    // Search for patterns in code
    const patterns = intent.keywords.length > 0
      ? this.codeAnalyzer.findPattern(repoPath, intent.keywords[0], ['.java', '.js', '.ts', '.py'])
      : [];

    return {
      architecture,
      relevantFiles,
      imports,
      hotspots,
      patterns,
    };
  }

  // Find files relevant to keywords
  private findRelevantFiles(keywords: string[], repoPath: string): string[] {
    const relevantFiles: string[] = [];
    const skipDirs = ['node_modules', 'dist', 'build', 'target', '.git', 'venv', '__pycache__'];

    const scanDir = (dir: string, relativePath: string = '') => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.join(relativePath, entry.name);

          if (entry.isDirectory() && !skipDirs.includes(entry.name)) {
            scanDir(fullPath, relPath);
          } else if (entry.isFile()) {
            // Check if filename or path matches keywords
            const pathLower = relPath.toLowerCase();
            if (keywords.some(kw => pathLower.includes(kw.toLowerCase()))) {
              relevantFiles.push(relPath);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    scanDir(repoPath);
    return relevantFiles.slice(0, 20); // Limit to 20 most relevant
  }

  // Explain how a feature works
  private explainFeature(intent: QuestionIntent, context: CodebaseContext, repoPath: string): string {
    let output = `🎯 ${intent.feature || 'Feature'} Implementation Analysis\n\n`;

    // Architecture context
    const relevantLayers = context.architecture.filter((layer: any) =>
      intent.keywords.some(kw => layer.name.toLowerCase().includes(kw.toLowerCase()))
    );

    if (relevantLayers.length > 0) {
      output += `📐 Architecture:\n`;
      for (const layer of relevantLayers) {
        output += `  - ${layer.name}: ${layer.description}\n`;
        output += `    Files: ${layer.files.length}\n`;
      }
      output += '\n';
    }

    // Key files
    if (context.relevantFiles.length > 0) {
      output += `📁 Key Files:\n`;
      for (const file of context.relevantFiles.slice(0, 10)) {
        output += `  - ${file}\n`;
        
        // Check if it's a hotspot
        const hotspot = context.hotspots.find((h: any) => h.filePath === file);
        if (hotspot) {
          output += `    ⚠️  High activity: ${hotspot.changeCount} changes\n`;
        }
      }
      output += '\n';
    }

    // Imports and dependencies
    if (context.imports.length > 0) {
      output += `📦 Key Dependencies:\n`;
      const uniqueSources = [...new Set(context.imports.map((i: any) => i.source))];
      for (const source of uniqueSources.slice(0, 10)) {
        output += `  - ${source}\n`;
      }
      output += '\n';
    }

    // Code patterns
    if (context.patterns.length > 0) {
      output += `💡 Code Patterns Found:\n`;
      const fileGroups = new Map<string, number>();
      for (const pattern of context.patterns) {
        fileGroups.set(pattern.file, (fileGroups.get(pattern.file) || 0) + 1);
      }

      const topFiles = Array.from(fileGroups.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      for (const [file, count] of topFiles) {
        output += `  - ${file}: ${count} occurrence(s)\n`;
      }
      output += '\n';
    }

    // Recommendations
    output += `💡 Next Steps:\n`;
    output += `  1. Start with: ${context.relevantFiles[0] || 'the main entry point'}\n`;
    output += `  2. Review the architecture layers above\n`;
    output += `  3. Trace the code flow through imports\n`;
    
    if (context.hotspots.length > 0) {
      output += `  4. ⚠️  Be careful with high-activity files\n`;
    }

    return output;
  }

  // Locate a component
  private locateComponent(intent: QuestionIntent, context: CodebaseContext, repoPath: string): string {
    let output = `📍 Location of "${intent.component || 'Component'}"\n\n`;

    if (context.relevantFiles.length === 0) {
      output += `❌ No files found matching "${intent.component}"\n\n`;
      output += `💡 Try searching for:\n`;
      output += `  - Different spelling or capitalization\n`;
      output += `  - Related terms or synonyms\n`;
      output += `  - Broader search terms\n`;
      return output;
    }

    output += `Found in ${context.relevantFiles.length} file(s):\n\n`;

    for (const file of context.relevantFiles.slice(0, 15)) {
      output += `📄 ${file}\n`;

      // Show file location in architecture
      const layer = context.architecture.find((l: any) =>
        l.files.some((f: string) => f === file)
      );
      if (layer) {
        output += `   Layer: ${layer.name}\n`;
      }

      // Show if it's a hotspot
      const hotspot = context.hotspots.find((h: any) => h.filePath === file);
      if (hotspot) {
        output += `   ⚠️  High activity: ${hotspot.changeCount} changes, Risk: ${hotspot.riskScore}/100\n`;
      }

      output += '\n';
    }

    if (context.relevantFiles.length > 15) {
      output += `... and ${context.relevantFiles.length - 15} more files\n\n`;
    }

    return output;
  }

  // Describe what a component is/does
  private describeComponent(intent: QuestionIntent, context: CodebaseContext, repoPath: string): string {
    let output = `📖 About "${intent.component || 'Component'}"\n\n`;

    // Find in architecture layers
    const layer = context.architecture.find((l: any) =>
      l.name.toLowerCase().includes(intent.component?.toLowerCase() || '')
    );

    if (layer) {
      output += `📐 Architecture Layer: ${layer.name}\n`;
      output += `   ${layer.description}\n`;
      output += `   Files: ${layer.files.length}\n\n`;
    }

    // Show relevant files
    if (context.relevantFiles.length > 0) {
      output += `📁 Implementation Files:\n`;
      for (const file of context.relevantFiles.slice(0, 5)) {
        output += `  - ${file}\n`;
      }
      output += '\n';
    }

    // Show dependencies
    if (context.imports.length > 0) {
      output += `📦 Dependencies:\n`;
      const uniqueSources = [...new Set(context.imports.map((i: any) => i.source))];
      for (const source of uniqueSources.slice(0, 5)) {
        output += `  - ${source}\n`;
      }
      output += '\n';
    }

    return output;
  }

  // Show implementation details
  private showImplementation(intent: QuestionIntent, context: CodebaseContext, repoPath: string): string {
    let output = `🔍 Implementation Details\n\n`;

    if (context.relevantFiles.length === 0) {
      output += `No relevant files found.\n`;
      return output;
    }

    output += `📁 Files (${context.relevantFiles.length}):\n`;
    for (const file of context.relevantFiles.slice(0, 20)) {
      output += `  - ${file}\n`;
    }
    output += '\n';

    if (context.patterns.length > 0) {
      output += `💡 Code Patterns:\n`;
      const grouped = new Map<string, any[]>();
      for (const pattern of context.patterns.slice(0, 20)) {
        if (!grouped.has(pattern.file)) {
          grouped.set(pattern.file, []);
        }
        grouped.get(pattern.file)!.push(pattern);
      }

      for (const [file, patterns] of grouped) {
        output += `\n  ${file}:\n`;
        for (const p of patterns.slice(0, 3)) {
          output += `    Line ${p.line}: ${p.content.trim()}\n`;
        }
      }
    }

    return output;
  }

  // Explain a concept
  private explainConcept(intent: QuestionIntent, context: CodebaseContext, repoPath: string): string {
    return this.explainFeature(intent, context, repoPath);
  }

  // Generate general overview
  private generateOverview(context: CodebaseContext, repoPath: string): string {
    let output = `📊 Codebase Overview\n\n`;

    // Architecture
    if (context.architecture.length > 0) {
      output += `🏗️  Architecture (${context.architecture.length} layers):\n`;
      for (const layer of context.architecture) {
        output += `  - ${layer.name}: ${layer.files.length} files\n`;
      }
      output += '\n';
    }

    // Hotspots
    if (context.hotspots.length > 0) {
      output += `🔥 Top Hotspot Files:\n`;
      for (const hotspot of context.hotspots.slice(0, 5)) {
        output += `  - ${hotspot.filePath} (${hotspot.changeCount} changes)\n`;
      }
      output += '\n';
    }

    output += `💡 Ask me specific questions like:\n`;
    output += `  - "How does authentication work?"\n`;
    output += `  - "Where is the database layer?"\n`;
    output += `  - "What is the API structure?"\n`;
    output += `  - "Show me the testing setup"\n`;

    return output;
  }

  // Format the answer for display
  formatAnswer(answer: string, question: string): string {
    let output = `🤖 Developer Onboarding Assistant\n\n`;
    output += `Question: "${question}"\n\n`;
    output += `${answer}\n`;
    output += `\n---\n`;
    output += `💬 Ask follow-up questions to learn more about the codebase!`;
    return output;
  }
}
