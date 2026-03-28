import * as fs from 'fs';
import * as path from 'path';
import { ASTAnalyzer, ASTFunctionCall, ASTImport } from './ast-analyzer.js';

/**
 * Represents a method/function definition in the codebase
 */
export interface MethodDefinition {
  name: string;
  filePath: string;
  line: number;
  className?: string; // For class methods
  isStatic?: boolean;
  parameters?: string[];
  returnType?: string;
  visibility?: 'public' | 'private' | 'protected';
}

/**
 * Represents a call relationship between methods
 */
export interface CallRelationship {
  caller: string; // Unique identifier: filePath:line:methodName
  callee: string; // Unique identifier: filePath:line:methodName
  callSite: {
    filePath: string;
    line: number;
  };
  callType: 'direct' | 'method_chain' | 'callback' | 'constructor';
}

/**
 * Represents a node in the call graph
 */
export interface CallGraphNode {
  id: string; // Unique identifier
  method: MethodDefinition;
  callers: string[]; // IDs of methods that call this method
  callees: string[]; // IDs of methods this method calls
  module: string; // Module/file this belongs to
  depth?: number; // Depth in call hierarchy (for visualization)
}

/**
 * Complete call graph structure
 */
export interface CallGraph {
  nodes: Map<string, CallGraphNode>;
  edges: CallRelationship[];
  entryPoints: string[]; // Methods with no callers (potential entry points)
  leafNodes: string[]; // Methods that don't call anything
  moduleGraph: Map<string, Set<string>>; // Module-to-module dependencies
}

/**
 * Call chain representing a path through the call graph
 */
export interface CallChain {
  chain: MethodDefinition[];
  modules: string[];
  totalDepth: number;
}

/**
 * Method reference information
 */
export interface MethodReference {
  method: MethodDefinition;
  references: {
    filePath: string;
    line: number;
    context: string;
    type: 'call' | 'assignment' | 'parameter' | 'return';
  }[];
  usageCount: number;
}

/**
 * Analyzes call graphs and method relationships across the codebase
 */
export class CallGraphAnalyzer {
  private astAnalyzer: ASTAnalyzer;
  private methodDefinitions: Map<string, MethodDefinition>;
  private callGraph: CallGraph;

  constructor() {
    this.astAnalyzer = new ASTAnalyzer();
    this.methodDefinitions = new Map();
    this.callGraph = {
      nodes: new Map(),
      edges: [],
      entryPoints: [],
      leafNodes: [],
      moduleGraph: new Map(),
    };
  }

  /**
   * Build complete call graph for a repository
   */
  buildCallGraph(repoPath: string): CallGraph {
    console.log(`[CallGraphAnalyzer] Building call graph for ${repoPath}`);
    
    // Step 1: Extract all method definitions
    this.extractMethodDefinitions(repoPath);
    
    // Step 2: Extract all function calls
    const astResult = this.astAnalyzer.analyzeAllAST(repoPath);
    
    // Step 3: Build call relationships
    this.buildCallRelationships(astResult.functionCalls, astResult.imports);
    
    // Step 4: Identify entry points and leaf nodes
    this.identifySpecialNodes();
    
    // Step 5: Build module-level dependency graph
    this.buildModuleGraph();
    
    console.log(`[CallGraphAnalyzer] Call graph built: ${this.callGraph.nodes.size} nodes, ${this.callGraph.edges.length} edges`);
    
    return this.callGraph;
  }

  /**
   * Extract method definitions from the codebase
   */
  private extractMethodDefinitions(repoPath: string): void {
    this.scanForMethods(repoPath);
  }

  /**
   * Scan directory for method definitions
   */
  private scanForMethods(dir: string): void {
    const skipDirs = ['node_modules', 'dist', 'build', 'target', '.git', 'venv', '__pycache__', 'coverage'];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!skipDirs.includes(entry.name)) {
            this.scanForMethods(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (['.js', '.jsx', '.ts', '.tsx', '.java', '.py'].includes(ext)) {
            this.extractMethodsFromFile(fullPath, ext);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
  }

  /**
   * Extract method definitions from a single file
   */
  private extractMethodsFromFile(filePath: string, ext: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Simple regex-based extraction (can be enhanced with AST)
      const patterns = {
        // JavaScript/TypeScript: function name() {}, const name = () => {}, name: function() {}
        js: [
          /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
          /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
          /(\w+)\s*:\s*(?:async\s+)?function\s*\(/g,
          /(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/g,
        ],
        // Java: public/private/protected void/Type methodName()
        java: [
          /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*\{/g,
        ],
        // Python: def method_name():
        python: [
          /def\s+(\w+)\s*\(/g,
        ],
      };
      
      let applicablePatterns: RegExp[] = [];
      if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
        applicablePatterns = patterns.js;
      } else if (ext === '.java') {
        applicablePatterns = patterns.java;
      } else if (ext === '.py') {
        applicablePatterns = patterns.python;
      }
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        for (const pattern of applicablePatterns) {
          let match;
          pattern.lastIndex = 0; // Reset regex
          while ((match = pattern.exec(line)) !== null) {
            const methodName = match[1];
            if (methodName && !this.isCommonKeyword(methodName)) {
              const methodId = this.generateMethodId(filePath, i + 1, methodName);
              const methodDef: MethodDefinition = {
                name: methodName,
                filePath,
                line: i + 1,
              };
              
              this.methodDefinitions.set(methodId, methodDef);
              
              // Create call graph node
              this.callGraph.nodes.set(methodId, {
                id: methodId,
                method: methodDef,
                callers: [],
                callees: [],
                module: filePath,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error extracting methods from ${filePath}:`, error);
    }
  }

  /**
   * Build call relationships from AST function calls
   */
  private buildCallRelationships(functionCalls: ASTFunctionCall[], imports: ASTImport[]): void {
    // Build import map for resolving cross-file calls
    const importMap = new Map<string, Map<string, string>>();
    
    for (const imp of imports) {
      if (!importMap.has(imp.filePath)) {
        importMap.set(imp.filePath, new Map());
      }
      const fileImports = importMap.get(imp.filePath)!;
      for (const imported of imp.imported) {
        fileImports.set(imported, imp.source);
      }
    }
    
    // Process each function call
    for (const call of functionCalls) {
      // Find the caller method (the method containing this call)
      const callerMethod = this.findMethodContainingLine(call.filePath, call.line);
      
      if (!callerMethod) continue;
      
      // Find the callee method
      const calleeMethod = this.resolveCalleeMethod(call, importMap);
      
      if (calleeMethod) {
        // Create edge
        const edge: CallRelationship = {
          caller: callerMethod.id,
          callee: calleeMethod.id,
          callSite: {
            filePath: call.filePath,
            line: call.line,
          },
          callType: call.receiver ? 'method_chain' : 'direct',
        };
        
        this.callGraph.edges.push(edge);
        
        // Update nodes
        const callerNode = this.callGraph.nodes.get(callerMethod.id);
        const calleeNode = this.callGraph.nodes.get(calleeMethod.id);
        
        if (callerNode && calleeNode) {
          if (!callerNode.callees.includes(calleeMethod.id)) {
            callerNode.callees.push(calleeMethod.id);
          }
          if (!calleeNode.callers.includes(callerMethod.id)) {
            calleeNode.callers.push(callerMethod.id);
          }
        }
      }
    }
  }

  /**
   * Find the method definition that contains a specific line
   */
  private findMethodContainingLine(filePath: string, line: number): CallGraphNode | null {
    // Find methods in the same file
    const methodsInFile: CallGraphNode[] = [];
    
    for (const [id, node] of this.callGraph.nodes.entries()) {
      if (node.method.filePath === filePath) {
        methodsInFile.push(node);
      }
    }
    
    // Sort by line number
    methodsInFile.sort((a, b) => a.method.line - b.method.line);
    
    // Find the closest method before this line
    let containingMethod: CallGraphNode | null = null;
    for (const method of methodsInFile) {
      if (method.method.line <= line) {
        containingMethod = method;
      } else {
        break;
      }
    }
    
    return containingMethod;
  }

  /**
   * Resolve the callee method from a function call
   */
  private resolveCalleeMethod(
    call: ASTFunctionCall,
    importMap: Map<string, Map<string, string>>
  ): CallGraphNode | null {
    // First, try to find in the same file
    for (const [id, node] of this.callGraph.nodes.entries()) {
      if (node.method.filePath === call.filePath && node.method.name === call.functionName) {
        return node;
      }
    }
    
    // Try to resolve from imports
    const fileImports = importMap.get(call.filePath);
    if (fileImports && fileImports.has(call.functionName)) {
      const importSource = fileImports.get(call.functionName)!;
      
      // Try to find the method in the imported module
      for (const [id, node] of this.callGraph.nodes.entries()) {
        if (node.method.name === call.functionName) {
          // Check if the file path matches the import source
          if (this.matchesImportSource(node.method.filePath, importSource, call.filePath)) {
            return node;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a file path matches an import source
   */
  private matchesImportSource(filePath: string, importSource: string, importerPath: string): boolean {
    // Handle relative imports
    if (importSource.startsWith('.')) {
      const importerDir = path.dirname(importerPath);
      const resolvedPath = path.resolve(importerDir, importSource);
      
      // Check with various extensions
      const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
      for (const ext of extensions) {
        if (filePath === resolvedPath + ext) {
          return true;
        }
      }
    }
    
    // Handle absolute imports (simplified)
    return filePath.includes(importSource.replace(/\//g, path.sep));
  }

  /**
   * Identify entry points and leaf nodes
   */
  private identifySpecialNodes(): void {
    for (const [id, node] of this.callGraph.nodes.entries()) {
      if (node.callers.length === 0) {
        this.callGraph.entryPoints.push(id);
      }
      if (node.callees.length === 0) {
        this.callGraph.leafNodes.push(id);
      }
    }
  }

  /**
   * Build module-level dependency graph
   */
  private buildModuleGraph(): void {
    for (const edge of this.callGraph.edges) {
      const callerNode = this.callGraph.nodes.get(edge.caller);
      const calleeNode = this.callGraph.nodes.get(edge.callee);
      
      if (callerNode && calleeNode) {
        const callerModule = callerNode.module;
        const calleeModule = calleeNode.module;
        
        if (callerModule !== calleeModule) {
          if (!this.callGraph.moduleGraph.has(callerModule)) {
            this.callGraph.moduleGraph.set(callerModule, new Set());
          }
          this.callGraph.moduleGraph.get(callerModule)!.add(calleeModule);
        }
      }
    }
  }

  /**
   * Find all call chains from a method to another
   */
  findCallChains(fromMethodName: string, toMethodName: string, maxDepth: number = 10): CallChain[] {
    const chains: CallChain[] = [];
    
    // Find all nodes matching the from method
    const startNodes: CallGraphNode[] = [];
    for (const [id, node] of this.callGraph.nodes.entries()) {
      if (node.method.name === fromMethodName) {
        startNodes.push(node);
      }
    }
    
    // DFS to find paths
    for (const startNode of startNodes) {
      const visited = new Set<string>();
      const currentChain: MethodDefinition[] = [];
      const currentModules: string[] = [];
      
      this.dfsCallChain(
        startNode,
        toMethodName,
        visited,
        currentChain,
        currentModules,
        chains,
        maxDepth
      );
    }
    
    return chains;
  }

  /**
   * DFS helper for finding call chains
   */
  private dfsCallChain(
    node: CallGraphNode,
    targetMethodName: string,
    visited: Set<string>,
    currentChain: MethodDefinition[],
    currentModules: string[],
    chains: CallChain[],
    maxDepth: number
  ): void {
    if (currentChain.length >= maxDepth) return;
    if (visited.has(node.id)) return;
    
    visited.add(node.id);
    currentChain.push(node.method);
    if (!currentModules.includes(node.module)) {
      currentModules.push(node.module);
    }
    
    // Check if we found the target
    if (node.method.name === targetMethodName) {
      chains.push({
        chain: [...currentChain],
        modules: [...currentModules],
        totalDepth: currentChain.length,
      });
    } else {
      // Continue searching
      for (const calleeId of node.callees) {
        const calleeNode = this.callGraph.nodes.get(calleeId);
        if (calleeNode) {
          this.dfsCallChain(
            calleeNode,
            targetMethodName,
            visited,
            currentChain,
            currentModules,
            chains,
            maxDepth
          );
        }
      }
    }
    
    currentChain.pop();
    visited.delete(node.id);
  }

  /**
   * Get all methods that call a specific method
   */
  getMethodCallers(methodName: string): MethodReference[] {
    const references: MethodReference[] = [];
    
    for (const [id, node] of this.callGraph.nodes.entries()) {
      if (node.method.name === methodName) {
        const refs: MethodReference['references'] = [];
        
        for (const callerId of node.callers) {
          const callerNode = this.callGraph.nodes.get(callerId);
          if (callerNode) {
            // Find the specific call site
            const edge = this.callGraph.edges.find(
              e => e.caller === callerId && e.callee === id
            );
            
            if (edge) {
              refs.push({
                filePath: edge.callSite.filePath,
                line: edge.callSite.line,
                context: callerNode.method.name,
                type: 'call',
              });
            }
          }
        }
        
        references.push({
          method: node.method,
          references: refs,
          usageCount: refs.length,
        });
      }
    }
    
    return references;
  }

  /**
   * Get all methods called by a specific method
   */
  getMethodCallees(methodName: string): MethodDefinition[] {
    const callees: MethodDefinition[] = [];
    
    for (const [id, node] of this.callGraph.nodes.entries()) {
      if (node.method.name === methodName) {
        for (const calleeId of node.callees) {
          const calleeNode = this.callGraph.nodes.get(calleeId);
          if (calleeNode) {
            callees.push(calleeNode.method);
          }
        }
      }
    }
    
    return callees;
  }

  /**
   * Get call graph statistics
   */
  getStatistics(): {
    totalMethods: number;
    totalCallRelationships: number;
    entryPoints: number;
    leafNodes: number;
    averageCallsPerMethod: number;
    maxCallDepth: number;
    moduleDependencies: number;
  } {
    const totalCalls = this.callGraph.edges.length;
    const avgCalls = this.callGraph.nodes.size > 0 
      ? totalCalls / this.callGraph.nodes.size 
      : 0;
    
    return {
      totalMethods: this.callGraph.nodes.size,
      totalCallRelationships: totalCalls,
      entryPoints: this.callGraph.entryPoints.length,
      leafNodes: this.callGraph.leafNodes.length,
      averageCallsPerMethod: Math.round(avgCalls * 100) / 100,
      maxCallDepth: this.calculateMaxDepth(),
      moduleDependencies: this.callGraph.moduleGraph.size,
    };
  }

  /**
   * Calculate maximum call depth in the graph
   */
  private calculateMaxDepth(): number {
    let maxDepth = 0;
    
    for (const entryPointId of this.callGraph.entryPoints) {
      const depth = this.calculateNodeDepth(entryPointId, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }
    
    return maxDepth;
  }

  /**
   * Calculate depth from a specific node
   */
  private calculateNodeDepth(nodeId: string, visited: Set<string>): number {
    if (visited.has(nodeId)) return 0;
    
    visited.add(nodeId);
    const node = this.callGraph.nodes.get(nodeId);
    
    if (!node || node.callees.length === 0) {
      return 1;
    }
    
    let maxChildDepth = 0;
    for (const calleeId of node.callees) {
      const depth = this.calculateNodeDepth(calleeId, new Set(visited));
      maxChildDepth = Math.max(maxChildDepth, depth);
    }
    
    return 1 + maxChildDepth;
  }

  /**
   * Generate unique method ID
   */
  private generateMethodId(filePath: string, line: number, methodName: string): string {
    return `${filePath}:${line}:${methodName}`;
  }

  /**
   * Check if a word is a common keyword to filter out
   */
  private isCommonKeyword(word: string): boolean {
    const keywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'return', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'class', 'interface', 'enum', 'import', 'export', 'from', 'as', 'default'];
    return keywords.includes(word.toLowerCase());
  }

  /**
   * Export call graph to JSON
   */
  exportToJSON(): string {
    const exportData = {
      nodes: Array.from(this.callGraph.nodes.values()),
      edges: this.callGraph.edges,
      entryPoints: this.callGraph.entryPoints,
      leafNodes: this.callGraph.leafNodes,
      moduleGraph: Array.from(this.callGraph.moduleGraph.entries()).map(([module, deps]) => ({
        module,
        dependencies: Array.from(deps),
      })),
      statistics: this.getStatistics(),
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Get the current call graph
   */
  getCallGraph(): CallGraph {
    return this.callGraph;
  }
}
