#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { ManifestParser } from './manifest-parser.js';
import { DBManager } from './db-manager.js';
import { Analyzer } from './analyzer.js';
import { CodeAnalyzer } from './code-analyzer.js';
import { ASTAnalyzer } from './ast-analyzer.js';
import { SecurityScanner } from './security-scanner.js';
import { getPerformanceOptimizer } from './performance-optimizer.js';
import { AdvancedIntelligence } from './advanced-intelligence.js';
import { DeveloperOnboarding } from './developer-onboarding.js';
import { DataFlowAnalyzer } from './data-flow-analyzer.js';
import { DocumentationGenerator } from './documentation-generator.js';
import { WorkspaceManager } from './workspace-manager.js';
import { CrossRepoAnalyzer } from './cross-repo-analyzer.js';
import { CrossRepoDocGenerator } from './cross-repo-doc-generator.js';
import { CallGraphAnalyzer } from './call-graph-analyzer.js';

// Initialize environment - default to current working directory
const defaultRepoPath = process.env.REPO_PATH || process.cwd();

// Store current scanning context
let currentRepoPath = defaultRepoPath;
let manifestParser = new ManifestParser();
let dbManager = new DBManager(currentRepoPath);
let analyzer = new Analyzer(dbManager);
let codeAnalyzer = new CodeAnalyzer();
let astAnalyzer = new ASTAnalyzer();
let securityScanner = new SecurityScanner();
let perfOptimizer = getPerformanceOptimizer();
let advancedIntel = new AdvancedIntelligence(dbManager, astAnalyzer);
let devOnboarding = new DeveloperOnboarding(advancedIntel, astAnalyzer, codeAnalyzer);
let dataFlowAnalyzer = new DataFlowAnalyzer(astAnalyzer);
let docGenerator = new DocumentationGenerator(dbManager, astAnalyzer, advancedIntel, codeAnalyzer, manifestParser, dataFlowAnalyzer);
let workspaceManager = new WorkspaceManager();
let crossRepoAnalyzer = new CrossRepoAnalyzer();
let crossRepoDocGenerator = new CrossRepoDocGenerator();
let callGraphAnalyzer = new CallGraphAnalyzer();

// Create MCP server
const server = new Server(
  {
    name: 'repository-analyzer-mcp',
    version: '1.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'scan_project',
        description: 'Scan a repository and index all dependency manifests (package.json, pom.xml, requirements.txt). Optionally specify a project_path, otherwise uses the current working directory or REPO_PATH environment variable.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory to scan. If not provided, uses REPO_PATH environment variable or current working directory.',
            },
          },
        },
      },
      {
        name: 'get_project_summary',
        description: 'Get a summary of what modules and dependencies exist in the project.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'what_depends_on',
        description: 'Find which modules in the project depend on a specific library/package.',
        inputSchema: {
          type: 'object',
          properties: {
            dependency_name: {
              type: 'string',
              description: 'Name of the dependency/library to search for (e.g., "react", "lodash", "org.springframework.boot:spring-boot-starter")',
            },
          },
          required: ['dependency_name'],
        },
      },
      {
        name: 'get_dependency_tree',
        description: 'Get the full dependency tree showing all transitive dependencies. Automatically detects project type and uses the appropriate tool: npm (package-lock.json), Maven (mvn dependency:tree), Gradle (gradle dependencies), or pip (pipdeptree). Shows nested dependencies in a tree format with versions.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
          },
        },
      },
      {
        name: 'analyze_code_imports',
        description: 'Analyze actual code files to find import statements and class usages. Supports Java, JavaScript/TypeScript, and Python. This shows what packages/modules are actually imported and used in the code, not just declared in manifests.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
            language: {
              type: 'string',
              description: 'Optional: Language to analyze (java, javascript, python, all). Default is "all".',
              enum: ['java', 'javascript', 'python', 'all'],
            },
          },
        },
      },
      {
        name: 'find_class_usage',
        description: 'Find where specific classes or modules are used in the codebase. Useful for questions like "which files use QasClient?" or "where is VaultUtils called?"',
        inputSchema: {
          type: 'object',
          properties: {
            class_name: {
              type: 'string',
              description: 'Name of the class or module to search for (e.g., "QasClient", "VaultUtils", "CloudviewConfiguration")',
            },
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
          },
          required: ['class_name'],
        },
      },
      {
        name: 'analyze_code_ast',
        description: 'Analyze code using AST (Abstract Syntax Tree) parsing with tree-sitter for maximum accuracy. Provides precise import analysis, function call tracking, and semantic understanding. Much more accurate than regex-based analysis. Supports Java, JavaScript/TypeScript, and Python.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
            language: {
              type: 'string',
              description: 'Optional: Language to analyze (java, javascript, python, all). Default is "all".',
              enum: ['java', 'javascript', 'python', 'all'],
            },
            analysis_type: {
              type: 'string',
              description: 'Optional: Type of analysis (imports, calls, classes, all). Default is "all".',
              enum: ['imports', 'calls', 'classes', 'all'],
            },
          },
        },
      },
      {
        name: 'scan_security_vulnerabilities',
        description: 'Scan project for security vulnerabilities using industry-standard tools: npm audit (Node.js), OWASP Dependency-Check (Maven/Java), pip-audit/safety (Python). Detects CVEs, provides severity ratings, and suggests fixes. Essential for security audits and compliance.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
          },
        },
      },
      {
        name: 'detect_circular_dependencies',
        description: 'Detect circular dependencies in the dependency graph using DFS traversal. Critical for Java/Spring projects where circular dependencies cause build failures and runtime issues. Shows complete dependency cycles like "Module A → B → C → A".',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'find_unused_dependencies',
        description: 'Find dependencies declared in manifests but never imported in code. Cross-references package.json/pom.xml/requirements.txt against actual AST imports. Helps reduce bundle size and clean up dependency bloat.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
          },
        },
      },
      {
        name: 'get_architecture_summary',
        description: 'Infer project architecture from file and folder patterns. Detects common patterns like MVC (controllers/, services/, repositories/), layered architecture, and more. Powered by file structure analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
          },
        },
      },
      {
        name: 'find_hotspot_files',
        description: 'Find files changed most frequently using git history. Surfaces high-risk files that require extra caution when modifying. Uses git log to track change frequency and calculate risk scores.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
            limit: {
              type: 'number',
              description: 'Optional: Maximum number of hotspot files to return. Default is 20.',
            },
          },
        },
      },
      {
        name: 'suggest_refactor_candidates',
        description: 'Suggest files that may benefit from refactoring based on high import count (coupling) and high modification frequency (churn). Combines AST analysis with git history to identify refactor targets.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
            limit: {
              type: 'number',
              description: 'Optional: Maximum number of candidates to return. Default is 10.',
            },
          },
        },
      },
      {
        name: 'onboard_new_developer',
        description: 'Answer natural language questions about the codebase to help onboard new developers. Combines architecture analysis, AST data, dependency trees, and code patterns to provide comprehensive answers. Examples: "How does authentication work?", "Where is the database layer?", "What files handle user management?"',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Natural language question about the codebase. Examples: "How does authentication work?", "Where is the API layer?", "What is the testing setup?"',
            },
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'trace_data_flow',
        description: 'Trace data flow across distributed systems and microservices. Detects Kafka/RabbitMQ producers/consumers, API endpoints/clients, and database operations. Shows how data moves through the system. Includes Mermaid diagram visualization that can be rendered in markdown viewers.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
            include_diagram: {
              type: 'boolean',
              description: 'Optional: Include Mermaid diagram visualization (default: true)',
            },
          },
        },
      },
      {
        name: 'generate_repo_document',
        description: 'Generate comprehensive markdown documentation for the repository. Creates a summary document, architecture document, or full report with dependency analysis, tech stack detection, architecture patterns, hotspot files, and more. Perfect for onboarding new developers or creating living documentation.',
        inputSchema: {
          type: 'object',
          properties: {
            output_type: {
              type: 'string',
              description: 'Type of document to generate: "summary" (quick overview with dependencies), "architecture" (detailed structure and patterns), or "full" (comprehensive report combining both)',
              enum: ['summary', 'architecture', 'full'],
            },
            output_file: {
              type: 'string',
              description: 'Optional: Absolute path where the markdown file should be saved. If not provided, defaults to CODEBASE_MEMORY.md in the project root.',
            },
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
          },
          required: ['output_type'],
        },
      },
      {
        name: 'detect_workspace_repos',
        description: 'Auto-detect all repositories in a workspace directory (e.g., IntelliJ workspace, monorepo). Scans for directories containing package.json, pom.xml, build.gradle, or requirements.txt files.',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_path: {
              type: 'string',
              description: 'Absolute path to the workspace directory containing multiple repositories',
            },
            max_depth: {
              type: 'number',
              description: 'Optional: Maximum directory depth to scan (default: 3)',
            },
          },
          required: ['workspace_path'],
        },
      },
      {
        name: 'scan_workspace_dependencies',
        description: 'Scan and index dependencies for all repositories in a workspace simultaneously. Perfect for quickly indexing entire IntelliJ multi-module projects or monorepos. Scans multiple repositories at once and builds the dependency cache for all repos.',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_path: {
              type: 'string',
              description: 'Absolute path to the workspace directory containing multiple repositories',
            },
            repo_names: {
              type: 'array',
              description: 'Optional: Specific repository names to scan. If not provided, auto-detects and scans all repositories.',
              items: {
                type: 'string',
              },
            },
          },
          required: ['workspace_path'],
        },
      },
      {
        name: 'generate_cross_repo_documentation',
        description: 'Generate comprehensive cross-repository workflow documentation. Shows how repositories depend on each other, shared packages, integration patterns, architecture diagram, tech stack summary, and development workflow. Perfect for understanding multi-repo projects.',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_path: {
              type: 'string',
              description: 'Absolute path to the workspace directory containing multiple repositories',
            },
            repo_names: {
              type: 'array',
              description: 'Optional: Specific repository names to analyze. If not provided, auto-detects all repositories.',
              items: {
                type: 'string',
              },
            },
            output_file: {
              type: 'string',
              description: 'Optional: Absolute path where the markdown file should be saved. If not provided, defaults to WORKSPACE_MEMORY.md in the workspace root.',
            },
          },
          required: ['workspace_path'],
        },
      },
      {
        name: 'analyze_call_graph',
        description: 'Comprehensive call graph analysis tool that builds and queries method relationships across the codebase. Supports multiple analysis types: build (create call graph), chains (find execution paths), callers (reverse lookup), callees (forward lookup), stats (complexity metrics), and export (JSON output). Essential for understanding code flow, impact analysis, and reducing AI hallucination.',
        inputSchema: {
          type: 'object',
          properties: {
            analysis_type: {
              type: 'string',
              enum: ['build', 'chains', 'callers', 'callees', 'stats', 'export'],
              description: 'Type of analysis: "build" (build call graph), "chains" (find call chains), "callers" (who calls this method), "callees" (what this method calls), "stats" (get statistics), "export" (export to JSON)',
            },
            method_name: {
              type: 'string',
              description: 'Required for "callers" and "callees" types. Name of the method to analyze (e.g., "authenticate", "processOrder")',
            },
            from_method: {
              type: 'string',
              description: 'Required for "chains" type. Starting method name (e.g., "handleRequest")',
            },
            to_method: {
              type: 'string',
              description: 'Required for "chains" type. Target method name (e.g., "saveToDatabase")',
            },
            max_depth: {
              type: 'number',
              description: 'Optional for "chains" type. Maximum search depth (default: 10)',
            },
            output_file: {
              type: 'string',
              description: 'Optional for "export" type. Path to save JSON file. If not provided, returns JSON as text.',
            },
            project_path: {
              type: 'string',
              description: 'Optional: Absolute path to the project directory. If not provided, uses the most recently scanned project.',
            },
          },
          required: ['analysis_type'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'scan_project': {
        // Get project path from arguments or use default
        const { project_path } = args as { project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        // If scanning a different path, reinitialize components
        if (targetPath !== currentRepoPath) {
          currentRepoPath = targetPath;
          dbManager = new DBManager(currentRepoPath);
          analyzer = new Analyzer(dbManager);
        }
        
        dbManager.clearAll(); // Fresh scan
        const modules = await manifestParser.scanDirectory(currentRepoPath);
        
        for (const module of modules) {
          dbManager.insertModule(module);
        }

        const stats = analyzer.getStats();
        return {
          content: [
            {
              type: 'text',
              text: `✅ Scan complete!\nScanned: ${currentRepoPath}\nFound ${stats.totalModules} module(s) with ${stats.totalDependencies} total dependencies.\nEcosystems: ${Array.from(stats.ecosystems).join(', ')}`,
            },
          ],
        };
      }

      case 'get_project_summary': {
        const summary = analyzer.getProjectSummary();
        return {
          content: [{ type: 'text', text: summary }],
        };
      }

      case 'what_depends_on': {
        const { dependency_name } = args as { dependency_name: string };
        const result = analyzer.getWhoDepends(dependency_name);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'list_all_dependencies': {
        const result = analyzer.listAllDependencies();
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'what_does_file_do': {
        const { file_path } = args as { file_path: string };
        // Phase 1: Simple heuristic
        const baseName = path.basename(file_path);
        let guess = `${baseName} appears to be a utility or component file.`;

        if (baseName.includes('test') || baseName.includes('spec')) {
          guess = `${baseName} is a test file.`;
        } else if (baseName.includes('config') || baseName.includes('env')) {
          guess = `${baseName} likely contains configuration.`;
        } else if (baseName.startsWith('index')) {
          guess = `${baseName} is an entry point that likely exports other modules.`;
        }

        return {
          content: [{ type: 'text', text: guess }],
        };
      }

      case 'get_dependency_tree': {
        const { project_path } = args as { project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        // Parse the dependency tree - automatically detects project type
        const tree = manifestParser.parseUniversalDependencyTree(targetPath);
        const formattedTree = analyzer.formatDependencyTree(tree);
        
        return {
          content: [{ type: 'text', text: formattedTree }],
        };
      }

      case 'analyze_code_imports': {
        const { project_path, language = 'all' } = args as { project_path?: string; language?: string };
        const targetPath = project_path || currentRepoPath;
        
        let result;
        if (language === 'java') {
          result = codeAnalyzer.analyzeJavaCode(targetPath);
        } else if (language === 'javascript') {
          result = codeAnalyzer.analyzeJavaScriptCode(targetPath);
        } else if (language === 'python') {
          result = codeAnalyzer.analyzePythonCode(targetPath);
        } else {
          result = codeAnalyzer.analyzeAllCode(targetPath);
        }

        let output = `Code Analysis for ${targetPath}\n\n`;
        output += `Files analyzed: ${result.totalFiles}\n`;
        output += `Files by type: ${JSON.stringify(result.filesByType, null, 2)}\n\n`;
        output += `Total imports found: ${result.imports.length}\n`;
        output += `Total class usages found: ${result.classUsages.length}\n\n`;

        // Group imports by source
        const importsBySource = new Map<string, Set<string>>();
        for (const imp of result.imports) {
          if (!importsBySource.has(imp.source)) {
            importsBySource.set(imp.source, new Set());
          }
          imp.imported.forEach(i => importsBySource.get(imp.source)!.add(i));
        }

        output += `Unique packages/modules imported:\n`;
        const sortedSources = Array.from(importsBySource.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        for (const [source, imported] of sortedSources) {
          output += `  - ${source}: ${Array.from(imported).join(', ')}\n`;
        }

        // Show most used classes
        const classCount = new Map<string, number>();
        for (const usage of result.classUsages) {
          classCount.set(usage.className, (classCount.get(usage.className) || 0) + 1);
        }

        const topClasses = Array.from(classCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20);

        if (topClasses.length > 0) {
          output += `\nMost used classes/modules:\n`;
          for (const [className, count] of topClasses) {
            output += `  - ${className}: ${count} usage(s)\n`;
          }
        }

        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'find_class_usage': {
        const { class_name, project_path } = args as { class_name: string; project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        const result = codeAnalyzer.analyzeAllCode(targetPath);
        const usages = result.classUsages.filter(u => u.className === class_name);
        const imports = result.imports.filter(i => i.imported.includes(class_name));

        let output = `Usage of "${class_name}" in ${targetPath}\n\n`;

        if (imports.length > 0) {
          output += `Imported in ${imports.length} file(s):\n`;
          for (const imp of imports) {
            output += `  - ${imp.filePath}:${imp.lineNumber}\n`;
          }
          output += '\n';
        }

        if (usages.length > 0) {
          output += `Used in ${usages.length} location(s):\n`;
          const usagesByType = new Map<string, typeof usages>();
          for (const usage of usages) {
            if (!usagesByType.has(usage.usageType)) {
              usagesByType.set(usage.usageType, []);
            }
            usagesByType.get(usage.usageType)!.push(usage);
          }

          for (const [type, typeUsages] of usagesByType) {
            output += `\n  ${type}:\n`;
            for (const usage of typeUsages) {
              output += `    - ${usage.filePath}:${usage.lineNumber}\n`;
            }
          }
        }

        if (imports.length === 0 && usages.length === 0) {
          output += `No usages of "${class_name}" found in the codebase.`;
        }

        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'search_code_pattern': {
        const { pattern, file_extensions, project_path } = args as { 
          pattern: string; 
          file_extensions?: string;
          project_path?: string;
        };
        const targetPath = project_path || currentRepoPath;
        
        const extensions = file_extensions 
          ? file_extensions.split(',').map(e => e.trim())
          : ['.java', '.js', '.jsx', '.ts', '.tsx', '.py', '.kt', '.go'];

        const results = codeAnalyzer.findPattern(targetPath, pattern, extensions);

        let output = `Search results for pattern "${pattern}" in ${targetPath}\n\n`;
        output += `Found ${results.length} match(es)\n\n`;

        if (results.length > 0) {
          // Group by file
          const byFile = new Map<string, typeof results>();
          for (const result of results) {
            if (!byFile.has(result.file)) {
              byFile.set(result.file, []);
            }
            byFile.get(result.file)!.push(result);
          }

          for (const [file, fileResults] of byFile) {
            output += `${file}:\n`;
            for (const result of fileResults) {
              output += `  Line ${result.line}: ${result.content}\n`;
            }
            output += '\n';
          }
        } else {
          output += `No matches found for pattern "${pattern}".`;
        }

        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'analyze_code_ast': {
        const { project_path, language = 'all', analysis_type = 'all' } = args as { 
          project_path?: string; 
          language?: string;
          analysis_type?: string;
        };
        const targetPath = project_path || currentRepoPath;
        
        let result;
        if (language === 'java') {
          result = astAnalyzer.analyzeJavaAST(targetPath);
        } else if (language === 'javascript') {
          result = astAnalyzer.analyzeJavaScriptAST(targetPath);
        } else if (language === 'python') {
          result = astAnalyzer.analyzePythonAST(targetPath);
        } else {
          result = astAnalyzer.analyzeAllAST(targetPath);
        }

        let output = `AST-based Code Analysis for ${targetPath}\n`;
        output += `Using tree-sitter for accurate parsing\n\n`;
        output += `Files analyzed: ${result.totalFiles}\n`;
        output += `Files by type: ${JSON.stringify(result.filesByType, null, 2)}\n\n`;

        if (analysis_type === 'imports' || analysis_type === 'all') {
          output += `=== IMPORTS (${result.imports.length} found) ===\n\n`;
          
          // Group imports by source
          const importsBySource = new Map<string, Set<string>>();
          for (const imp of result.imports) {
            if (!importsBySource.has(imp.source)) {
              importsBySource.set(imp.source, new Set());
            }
            imp.imported.forEach(i => importsBySource.get(imp.source)!.add(i));
          }

          const sortedSources = Array.from(importsBySource.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(0, 50); // Limit to 50 for readability

          for (const [source, imported] of sortedSources) {
            output += `  ${source}\n`;
            output += `    Imports: ${Array.from(imported).join(', ')}\n`;
          }
          output += '\n';
        }

        if (analysis_type === 'classes' || analysis_type === 'all') {
          output += `=== CLASS USAGES (${result.classUsages.length} found) ===\n\n`;
          
          // Group by class name
          const usagesByClass = new Map<string, typeof result.classUsages>();
          for (const usage of result.classUsages) {
            if (!usagesByClass.has(usage.className)) {
              usagesByClass.set(usage.className, []);
            }
            usagesByClass.get(usage.className)!.push(usage);
          }

          const topClasses = Array.from(usagesByClass.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 20);

          for (const [className, usages] of topClasses) {
            output += `  ${className}: ${usages.length} usage(s)\n`;
            const byType = new Map<string, number>();
            usages.forEach(u => byType.set(u.usageType, (byType.get(u.usageType) || 0) + 1));
            output += `    Types: ${Array.from(byType.entries()).map(([t, c]) => `${t}(${c})`).join(', ')}\n`;
          }
          output += '\n';
        }

        if (analysis_type === 'calls' || analysis_type === 'all') {
          output += `=== FUNCTION CALLS (${result.functionCalls.length} found) ===\n\n`;
          
          // Group by function name
          const callsByFunc = new Map<string, typeof result.functionCalls>();
          for (const call of result.functionCalls) {
            const key = call.receiver ? `${call.receiver}.${call.functionName}` : call.functionName;
            if (!callsByFunc.has(key)) {
              callsByFunc.set(key, []);
            }
            callsByFunc.get(key)!.push(call);
          }

          const topCalls = Array.from(callsByFunc.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 20);

          for (const [funcName, calls] of topCalls) {
            output += `  ${funcName}: ${calls.length} call(s)\n`;
          }
          output += '\n';
        }

        output += `\n✅ AST analysis complete with tree-sitter precision!`;

        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'scan_security_vulnerabilities': {
        const { project_path } = args as { project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        const { result: reports, duration } = await perfOptimizer.measureTime(async () => {
          return await securityScanner.scanAllVulnerabilities(targetPath);
        });

        const formattedReport = securityScanner.formatSecurityReport(reports);
        const output = `${formattedReport}\n\nScan completed in ${(duration / 1000).toFixed(2)}s`;

        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'get_performance_stats': {
        const report = perfOptimizer.formatPerformanceReport();
        
        return {
          content: [{ type: 'text', text: report }],
        };
      }

      case 'detect_circular_dependencies': {
        const cycles = advancedIntel.detectCircularDependencies();
        const report = advancedIntel.formatCircularDependenciesReport(cycles);
        
        return {
          content: [{ type: 'text', text: report }],
        };
      }

      case 'find_unused_dependencies': {
        const { project_path } = args as { project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        const unused = await advancedIntel.findUnusedDependencies(targetPath);
        const report = advancedIntel.formatUnusedDependenciesReport(unused);
        
        return {
          content: [{ type: 'text', text: report }],
        };
      }

      case 'get_architecture_summary': {
        const { project_path } = args as { project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        const layers = advancedIntel.getArchitectureSummary(targetPath);
        const report = advancedIntel.formatArchitectureSummary(layers);
        
        return {
          content: [{ type: 'text', text: report }],
        };
      }

      case 'find_hotspot_files': {
        const { project_path, limit = 20 } = args as { project_path?: string; limit?: number };
        const targetPath = project_path || currentRepoPath;
        
        const hotspots = advancedIntel.findHotspotFiles(targetPath, limit);
        const report = advancedIntel.formatHotspotsReport(hotspots);
        
        return {
          content: [{ type: 'text', text: report }],
        };
      }

      case 'suggest_refactor_candidates': {
        const { project_path, limit = 10 } = args as { project_path?: string; limit?: number };
        const targetPath = project_path || currentRepoPath;
        
        const candidates = await advancedIntel.suggestRefactorCandidates(targetPath, limit);
        const report = advancedIntel.formatRefactorCandidatesReport(candidates);
        
        return {
          content: [{ type: 'text', text: report }],
        };
      }

      case 'onboard_new_developer': {
        const { question, project_path } = args as { question: string; project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        const answer = await devOnboarding.answerQuestion(question, targetPath);
        const formattedAnswer = devOnboarding.formatAnswer(answer, question);
        
        return {
          content: [{ type: 'text', text: formattedAnswer }],
        };
      }

      case 'trace_data_flow': {
        const { project_path } = args as { project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        const graph = dataFlowAnalyzer.analyzeDataFlow(targetPath);
        const report = dataFlowAnalyzer.formatDataFlowReport(graph);
        
        return {
          content: [{ type: 'text', text: report }],
        };
      }

      case 'visualize_data_flow': {
        const { project_path } = args as { project_path?: string };
        const targetPath = project_path || currentRepoPath;
        
        const graph = dataFlowAnalyzer.analyzeDataFlow(targetPath);
        const mermaid = dataFlowAnalyzer.generateMermaidDiagram(graph);
        
        let output = '📊 Data Flow Visualization\n\n';
        output += 'Mermaid Diagram:\n\n';
        output += '```mermaid\n';
        output += mermaid;
        output += '```\n\n';
        output += 'Copy the diagram above and paste it into:\n';
        output += '- https://mermaid.live (online editor)\n';
        output += '- GitHub/GitLab markdown (renders automatically)\n';
        output += '- Notion, Confluence, or other tools that support Mermaid\n';
        
        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'generate_repo_document': {
        const { output_type, output_file, project_path } = args as { 
          output_type: 'summary' | 'architecture' | 'full'; 
          output_file?: string; 
          project_path?: string 
        };
        const targetPath = project_path || currentRepoPath;
        
        const result = await docGenerator.generateDocument(targetPath, output_type, output_file);
        
        let output = '📄 Repository Documentation Generated\n\n';
        output += `**Document Type**: ${output_type}\n`;
        output += `**File Path**: ${result.filePath}\n\n`;
        output += '---\n\n';
        output += '**Preview:**\n\n';
        output += result.content;
        
        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'detect_workspace_repos': {
        const { workspace_path, max_depth } = args as { workspace_path: string; max_depth?: number };
        
        const repos = workspaceManager.detectRepositories(workspace_path, max_depth || 3);
        
        let output = '📂 Workspace Repository Detection\n\n';
        output += `**Workspace Path**: \`${workspace_path}\`\n`;
        output += `**Repositories Found**: ${repos.length}\n\n`;
        
        if (repos.length === 0) {
          output += 'No repositories detected in this workspace.\n';
        } else {
          output += '| Repository | Type | Manifest Files |\n';
          output += '|------------|------|----------------|\n';
          
          for (const repo of repos) {
            const manifests = [];
            if (repo.hasPackageJson) manifests.push('package.json');
            if (repo.hasPomXml) manifests.push('pom.xml');
            if (repo.hasBuildGradle) manifests.push('build.gradle');
            if (repo.hasRequirementsTxt) manifests.push('requirements.txt');
            
            output += `| **${repo.name}** | ${repo.type} | ${manifests.join(', ')} |\n`;
          }
        }
        
        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'scan_workspace_dependencies': {
        const { workspace_path, repo_names } = args as { workspace_path: string; repo_names?: string[] };
        
        // Detect or validate repositories
        const repos = repo_names 
          ? workspaceManager.validateRepositories(workspace_path, repo_names)
          : workspaceManager.detectRepositories(workspace_path);
        
        if (repos.length === 0) {
          return {
            content: [{ type: 'text', text: '❌ No repositories found to scan.' }],
          };
        }
        
        let output = '🔍 Scanning Workspace Repositories\n\n';
        output += `**Workspace**: \`${workspace_path}\`\n`;
        output += `**Repositories to Scan**: ${repos.length}\n\n`;
        
        // Scan each repository
        let scannedCount = 0;
        for (const repo of repos) {
          try {
            output += `\n📦 Scanning **${repo.name}**...\n`;
            
            // Update context to this repo
            currentRepoPath = repo.path;
            dbManager = new DBManager(repo.path);
            analyzer = new Analyzer(dbManager);
            
            // Scan the repository
            dbManager.clearAll(); // Fresh scan for this repo
            const modules = await manifestParser.scanDirectory(repo.path);
            
            for (const module of modules) {
              dbManager.insertModule(module);
            }
            
            output += `   ✅ Found ${modules.length} module(s)\n`;
            scannedCount++;
          } catch (error) {
            output += `   ❌ Error: ${error instanceof Error ? error.message : String(error)}\n`;
          }
        }
        
        output += `\n**Summary**: Successfully scanned ${scannedCount}/${repos.length} repositories\n`;
        
        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'generate_cross_repo_documentation': {
        const { workspace_path, repo_names, output_file } = args as { 
          workspace_path: string; 
          repo_names?: string[]; 
          output_file?: string 
        };
        
        // Detect or validate repositories
        const repos = repo_names 
          ? workspaceManager.validateRepositories(workspace_path, repo_names)
          : workspaceManager.detectRepositories(workspace_path);
        
        if (repos.length === 0) {
          return {
            content: [{ type: 'text', text: '❌ No repositories found to analyze.' }],
          };
        }
        
        // Analyze cross-repo dependencies
        const analysis = crossRepoAnalyzer.analyzeWorkspace(workspace_path, repos);
        
        // Generate documentation
        const documentation = crossRepoDocGenerator.generateCrossRepoDocumentation(analysis);
        
        // Save to file
        const defaultFileName = 'WORKSPACE_MEMORY.md';
        const filePath = output_file || path.join(workspace_path, defaultFileName);
        
        const fs = await import('fs');
        fs.writeFileSync(filePath, documentation, 'utf-8');
        
        let output = '📄 Cross-Repository Documentation Generated\n\n';
        output += `**Workspace**: \`${workspace_path}\`\n`;
        output += `**Repositories Analyzed**: ${repos.length}\n`;
        output += `**Cross-Repo Dependencies**: ${analysis.dependencies.length}\n`;
        output += `**Shared Packages**: ${analysis.sharedPackages.length}\n`;
        output += `**Integration Patterns**: ${analysis.integrationPatterns.length}\n`;
        output += `**File Path**: \`${filePath}\`\n\n`;
        output += '---\n\n';
        output += '**Preview:**\n\n';
        output += documentation.substring(0, 2000);
        
        if (documentation.length > 2000) {
          output += '\n\n*...document truncated, see full file for complete documentation*';
        }
        
        return {
          content: [{ type: 'text', text: output }],
        };
      }

      case 'analyze_call_graph': {
        const { 
          analysis_type, 
          method_name, 
          from_method, 
          to_method, 
          max_depth = 10, 
          output_file, 
          project_path 
        } = args as { 
          analysis_type: string;
          method_name?: string;
          from_method?: string;
          to_method?: string;
          max_depth?: number;
          output_file?: string;
          project_path?: string;
        };
        
        const targetPath = project_path || currentRepoPath;
        let output = '';
        
        switch (analysis_type) {
          case 'build': {
            output = '🔗 Building Call Graph\n\n';
            output += `**Project**: \`${targetPath}\`\n\n`;
            output += 'Analyzing method definitions and call relationships...\n\n';
            
            const callGraph = callGraphAnalyzer.buildCallGraph(targetPath);
            const stats = callGraphAnalyzer.getStatistics();
            
            output += '**Call Graph Statistics:**\n';
            output += `- Total Methods: ${stats.totalMethods}\n`;
            output += `- Total Call Relationships: ${stats.totalCallRelationships}\n`;
            output += `- Entry Points (methods with no callers): ${stats.entryPoints}\n`;
            output += `- Leaf Nodes (methods that don't call anything): ${stats.leafNodes}\n`;
            output += `- Average Calls per Method: ${stats.averageCallsPerMethod}\n`;
            output += `- Maximum Call Depth: ${stats.maxCallDepth}\n`;
            output += `- Module Dependencies: ${stats.moduleDependencies}\n\n`;
            
            output += '✅ Call graph built successfully!\n';
            output += 'Use `analyze_call_graph` with different analysis types to query the graph.\n';
            break;
          }
          
          case 'chains': {
            if (!from_method || !to_method) {
              throw new Error('from_method and to_method are required for chains analysis');
            }
            
            // Ensure call graph is built
            if (callGraphAnalyzer.getCallGraph().nodes.size === 0) {
              callGraphAnalyzer.buildCallGraph(targetPath);
            }
            
            const chains = callGraphAnalyzer.findCallChains(from_method, to_method, max_depth);
            
            output = `🔍 Call Chains from "${from_method}" to "${to_method}"\n\n`;
            
            if (chains.length === 0) {
              output += `No call chains found from "${from_method}" to "${to_method}".\n`;
              output += `This could mean:\n`;
              output += `- The methods are not connected\n`;
              output += `- The path exceeds max depth (${max_depth})\n`;
              output += `- One or both methods don't exist in the codebase\n`;
            } else {
              output += `Found ${chains.length} call chain(s):\n\n`;
              
              for (let i = 0; i < chains.length; i++) {
                const chain = chains[i];
                output += `**Chain ${i + 1}** (Depth: ${chain.totalDepth}, Modules: ${chain.modules.length}):\n`;
                
                for (let j = 0; j < chain.chain.length; j++) {
                  const method = chain.chain[j];
                  const indent = '  '.repeat(j);
                  output += `${indent}${j > 0 ? '↓ ' : ''}${method.name} (${method.filePath}:${method.line})\n`;
                }
                
                output += `\n  Modules involved: ${chain.modules.map(m => path.basename(m)).join(' → ')}\n\n`;
              }
            }
            break;
          }
          
          case 'callers': {
            if (!method_name) {
              throw new Error('method_name is required for callers analysis');
            }
            
            // Ensure call graph is built
            if (callGraphAnalyzer.getCallGraph().nodes.size === 0) {
              callGraphAnalyzer.buildCallGraph(targetPath);
            }
            
            const callers = callGraphAnalyzer.getMethodCallers(method_name);
            
            output = `📞 Methods Calling "${method_name}"\n\n`;
            
            if (callers.length === 0) {
              output += `No callers found for method "${method_name}".\n`;
              output += `This could mean:\n`;
              output += `- The method is an entry point (not called by other methods)\n`;
              output += `- The method doesn't exist in the codebase\n`;
              output += `- The method is only called dynamically (not detectable by static analysis)\n`;
            } else {
              output += `Found ${callers.length} instance(s) of "${method_name}":\n\n`;
              
              for (const caller of callers) {
                output += `**${caller.method.name}** at \`${caller.method.filePath}:${caller.method.line}\`\n`;
                output += `  Called by ${caller.usageCount} method(s):\n`;
                
                for (const ref of caller.references) {
                  output += `  - ${ref.context} (\`${ref.filePath}:${ref.line}\`)\n`;
                }
                output += '\n';
              }
            }
            break;
          }
          
          case 'callees': {
            if (!method_name) {
              throw new Error('method_name is required for callees analysis');
            }
            
            // Ensure call graph is built
            if (callGraphAnalyzer.getCallGraph().nodes.size === 0) {
              callGraphAnalyzer.buildCallGraph(targetPath);
            }
            
            const callees = callGraphAnalyzer.getMethodCallees(method_name);
            
            output = `📤 Methods Called by "${method_name}"\n\n`;
            
            if (callees.length === 0) {
              output += `Method "${method_name}" doesn't call any other methods.\n`;
              output += `This could mean:\n`;
              output += `- The method is a leaf node (doesn't call anything)\n`;
              output += `- The method doesn't exist in the codebase\n`;
            } else {
              output += `"${method_name}" calls ${callees.length} method(s):\n\n`;
              
              // Group by file
              const byFile = new Map<string, typeof callees>();
              for (const callee of callees) {
                if (!byFile.has(callee.filePath)) {
                  byFile.set(callee.filePath, []);
                }
                byFile.get(callee.filePath)!.push(callee);
              }
              
              for (const [file, methods] of byFile) {
                output += `**${path.basename(file)}** (\`${file}\`):\n`;
                for (const method of methods) {
                  output += `  - ${method.name} (line ${method.line})\n`;
                }
                output += '\n';
              }
            }
            break;
          }
          
          case 'stats': {
            // Ensure call graph is built
            if (callGraphAnalyzer.getCallGraph().nodes.size === 0) {
              callGraphAnalyzer.buildCallGraph(targetPath);
            }
            
            const stats = callGraphAnalyzer.getStatistics();
            const callGraph = callGraphAnalyzer.getCallGraph();
            
            output = '📊 Call Graph Statistics\n\n';
            output += `**Project**: \`${targetPath}\`\n\n`;
            
            output += '**Overall Metrics:**\n';
            output += `- Total Methods: ${stats.totalMethods}\n`;
            output += `- Total Call Relationships: ${stats.totalCallRelationships}\n`;
            output += `- Average Calls per Method: ${stats.averageCallsPerMethod}\n`;
            output += `- Maximum Call Depth: ${stats.maxCallDepth}\n\n`;
            
            output += '**Special Nodes:**\n';
            output += `- Entry Points: ${stats.entryPoints} (methods with no callers)\n`;
            output += `- Leaf Nodes: ${stats.leafNodes} (methods that don't call anything)\n\n`;
            
            output += '**Module Dependencies:**\n';
            output += `- Total Module Relationships: ${stats.moduleDependencies}\n\n`;
            
            // Top entry points
            if (callGraph.entryPoints.length > 0) {
              output += '**Top Entry Points:**\n';
              const topEntries = callGraph.entryPoints.slice(0, 10);
              for (const entryId of topEntries) {
                const node = callGraph.nodes.get(entryId);
                if (node) {
                  output += `  - ${node.method.name} (\`${node.method.filePath}:${node.method.line}\`)\n`;
                }
              }
              if (callGraph.entryPoints.length > 10) {
                output += `  ... and ${callGraph.entryPoints.length - 10} more\n`;
              }
              output += '\n';
            }
            break;
          }
          
          case 'export': {
            // Ensure call graph is built
            if (callGraphAnalyzer.getCallGraph().nodes.size === 0) {
              callGraphAnalyzer.buildCallGraph(targetPath);
            }
            
            const json = callGraphAnalyzer.exportToJSON();
            
            output = '📦 Call Graph Export\n\n';
            
            if (output_file) {
              const fs = await import('fs');
              fs.writeFileSync(output_file, json, 'utf-8');
              output += `**Exported to**: \`${output_file}\`\n\n`;
              output += 'The call graph has been saved in JSON format.\n';
            } else {
              output += '**Call Graph JSON:**\n\n';
              output += '```json\n';
              output += json.substring(0, 5000); // Limit preview
              if (json.length > 5000) {
                output += '\n... (truncated, use output_file parameter to save complete graph)\n';
              }
              output += '\n```\n';
            }
            break;
          }
          
          default:
            throw new Error(`Unknown analysis_type: ${analysis_type}. Must be one of: build, chains, callers, callees, stats, export`);
        }
        
        return {
          content: [{ type: 'text', text: output }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[repository-analyzer-mcp] Server running on stdio');
  console.error(`[repository-analyzer-mcp] Default repository path: ${currentRepoPath}`);
  console.error('[repository-analyzer-mcp] You can scan any project by providing project_path parameter');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
