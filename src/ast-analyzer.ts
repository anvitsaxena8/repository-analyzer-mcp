import fs from 'fs';
import path from 'path';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import Java from 'tree-sitter-java';
import Python from 'tree-sitter-python';

export interface ASTImport {
  source: string;
  imported: string[];
  filePath: string;
  startLine: number;
  endLine: number;
  isDefault?: boolean;
  isNamespace?: boolean;
}

export interface ASTClassUsage {
  className: string;
  filePath: string;
  line: number;
  usageType: 'import' | 'instantiation' | 'static_call' | 'method_call' | 'type_reference';
  context?: string; // surrounding code context
}

export interface ASTFunctionCall {
  functionName: string;
  filePath: string;
  line: number;
  arguments: string[];
  receiver?: string; // object.method -> receiver is 'object'
}

export interface ASTAnalysisResult {
  imports: ASTImport[];
  classUsages: ASTClassUsage[];
  functionCalls: ASTFunctionCall[];
  totalFiles: number;
  filesByType: Record<string, number>;
}

export class ASTAnalyzer {
  private jsParser: Parser;
  private tsParser: Parser;
  private javaParser: Parser;
  private pythonParser: Parser;

  constructor() {
    // Initialize parsers
    this.jsParser = new Parser();
    this.jsParser.setLanguage(JavaScript);

    this.tsParser = new Parser();
    this.tsParser.setLanguage(TypeScript.typescript);

    this.javaParser = new Parser();
    this.javaParser.setLanguage(Java);

    this.pythonParser = new Parser();
    this.pythonParser.setLanguage(Python);
  }

  // Analyze JavaScript/TypeScript code with AST
  analyzeJavaScriptAST(repoPath: string): ASTAnalysisResult {
    const result: ASTAnalysisResult = {
      imports: [],
      classUsages: [],
      functionCalls: [],
      totalFiles: 0,
      filesByType: {},
    };

    this.scanDirectory(repoPath, result, ['.js', '.jsx', '.ts', '.tsx'], 'javascript');
    return result;
  }

  // Analyze Java code with AST
  analyzeJavaAST(repoPath: string): ASTAnalysisResult {
    const result: ASTAnalysisResult = {
      imports: [],
      classUsages: [],
      functionCalls: [],
      totalFiles: 0,
      filesByType: {},
    };

    this.scanDirectory(repoPath, result, ['.java'], 'java');
    return result;
  }

  // Analyze Python code with AST
  analyzePythonAST(repoPath: string): ASTAnalysisResult {
    const result: ASTAnalysisResult = {
      imports: [],
      classUsages: [],
      functionCalls: [],
      totalFiles: 0,
      filesByType: {},
    };

    this.scanDirectory(repoPath, result, ['.py'], 'python');
    return result;
  }

  // Analyze all code with AST
  analyzeAllAST(repoPath: string): ASTAnalysisResult {
    const result: ASTAnalysisResult = {
      imports: [],
      classUsages: [],
      functionCalls: [],
      totalFiles: 0,
      filesByType: {},
    };

    this.scanDirectory(repoPath, result, ['.js', '.jsx', '.ts', '.tsx', '.java', '.py'], 'all');
    return result;
  }

  private scanDirectory(
    dir: string,
    result: ASTAnalysisResult,
    extensions: string[],
    language: string
  ) {
    const skipDirs = ['node_modules', 'dist', 'build', 'target', '.git', 'venv', '__pycache__', 'coverage'];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!skipDirs.includes(entry.name)) {
            this.scanDirectory(fullPath, result, extensions, language);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            this.analyzeFileAST(fullPath, ext, result);
            result.totalFiles++;
            result.filesByType[ext] = (result.filesByType[ext] || 0) + 1;
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
  }

  private analyzeFileAST(filePath: string, ext: string, result: ASTAnalysisResult) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      let tree: Parser.Tree;

      // Parse with appropriate parser
      if (['.js', '.jsx'].includes(ext)) {
        tree = this.jsParser.parse(content);
        this.extractJavaScriptInfo(tree, filePath, content, result);
      } else if (['.ts', '.tsx'].includes(ext)) {
        tree = this.tsParser.parse(content);
        this.extractTypeScriptInfo(tree, filePath, content, result);
      } else if (ext === '.java') {
        tree = this.javaParser.parse(content);
        this.extractJavaInfo(tree, filePath, content, result);
      } else if (ext === '.py') {
        tree = this.pythonParser.parse(content);
        this.extractPythonInfo(tree, filePath, content, result);
      }
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
    }
  }

  private extractJavaScriptInfo(
    tree: Parser.Tree,
    filePath: string,
    content: string,
    result: ASTAnalysisResult
  ) {
    const lines = content.split('\n');
    this.traverseTree(tree.rootNode, (node) => {
      // Extract imports
      if (node.type === 'import_statement') {
        const importInfo = this.extractJSImport(node, filePath, lines);
        if (importInfo) result.imports.push(importInfo);
      }

      // Extract class instantiation: new ClassName()
      if (node.type === 'new_expression') {
        const classNode = node.childForFieldName('constructor');
        if (classNode) {
          const className = classNode.text;
          result.classUsages.push({
            className,
            filePath,
            line: classNode.startPosition.row + 1,
            usageType: 'instantiation',
            context: node.text.slice(0, 100),
          });
        }
      }

      // Extract function calls
      if (node.type === 'call_expression') {
        const funcInfo = this.extractJSFunctionCall(node, filePath);
        if (funcInfo) result.functionCalls.push(funcInfo);
      }
    });
  }

  private extractTypeScriptInfo(
    tree: Parser.Tree,
    filePath: string,
    content: string,
    result: ASTAnalysisResult
  ) {
    // TypeScript has similar structure to JavaScript
    this.extractJavaScriptInfo(tree, filePath, content, result);
    
    const lines = content.split('\n');
    this.traverseTree(tree.rootNode, (node) => {
      // Extract type references
      if (node.type === 'type_identifier') {
        result.classUsages.push({
          className: node.text,
          filePath,
          line: node.startPosition.row + 1,
          usageType: 'type_reference',
        });
      }
    });
  }

  private extractJavaInfo(
    tree: Parser.Tree,
    filePath: string,
    content: string,
    result: ASTAnalysisResult
  ) {
    const lines = content.split('\n');
    this.traverseTree(tree.rootNode, (node) => {
      // Extract imports
      if (node.type === 'import_declaration') {
        const importInfo = this.extractJavaImport(node, filePath, lines);
        if (importInfo) result.imports.push(importInfo);
      }

      // Extract class instantiation: new ClassName()
      if (node.type === 'object_creation_expression') {
        const typeNode = node.childForFieldName('type');
        if (typeNode) {
          const className = typeNode.text;
          result.classUsages.push({
            className,
            filePath,
            line: typeNode.startPosition.row + 1,
            usageType: 'instantiation',
            context: node.text.slice(0, 100),
          });
        }
      }

      // Extract method calls
      if (node.type === 'method_invocation') {
        const funcInfo = this.extractJavaMethodCall(node, filePath);
        if (funcInfo) result.functionCalls.push(funcInfo);
      }
    });
  }

  private extractPythonInfo(
    tree: Parser.Tree,
    filePath: string,
    content: string,
    result: ASTAnalysisResult
  ) {
    const lines = content.split('\n');
    this.traverseTree(tree.rootNode, (node) => {
      // Extract imports: import x, from x import y
      if (node.type === 'import_statement' || node.type === 'import_from_statement') {
        const importInfo = this.extractPythonImport(node, filePath, lines);
        if (importInfo) result.imports.push(importInfo);
      }

      // Extract class instantiation: ClassName()
      if (node.type === 'call') {
        const funcNode = node.childForFieldName('function');
        if (funcNode && funcNode.type === 'identifier') {
          const name = funcNode.text;
          // Python classes typically start with uppercase
          if (name[0] === name[0].toUpperCase()) {
            result.classUsages.push({
              className: name,
              filePath,
              line: funcNode.startPosition.row + 1,
              usageType: 'instantiation',
              context: node.text.slice(0, 100),
            });
          }
        }

        const funcInfo = this.extractPythonFunctionCall(node, filePath);
        if (funcInfo) result.functionCalls.push(funcInfo);
      }
    });
  }

  private extractJSImport(node: Parser.SyntaxNode, filePath: string, lines: string[]): ASTImport | null {
    const source = node.descendantsOfType('string').find(n => n.parent?.type === 'import_statement');
    if (!source) return null;

    const sourceValue = source.text.replace(/['"]/g, '');
    const imported: string[] = [];

    // Extract imported names
    const importClause = node.childForFieldName('import_clause');
    if (importClause) {
      this.traverseTree(importClause, (n) => {
        if (n.type === 'identifier' || n.type === 'import_specifier') {
          imported.push(n.text);
        }
      });
    }

    return {
      source: sourceValue,
      imported,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractJavaImport(node: Parser.SyntaxNode, filePath: string, lines: string[]): ASTImport | null {
    const scopedIdentifier = node.descendantsOfType('scoped_identifier')[0];
    if (!scopedIdentifier) return null;

    const fullImport = scopedIdentifier.text;
    const parts = fullImport.split('.');
    const className = parts[parts.length - 1];

    return {
      source: fullImport,
      imported: [className],
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractPythonImport(node: Parser.SyntaxNode, filePath: string, lines: string[]): ASTImport | null {
    if (node.type === 'import_statement') {
      const names = node.descendantsOfType('dotted_name');
      if (names.length === 0) return null;

      return {
        source: names[0].text,
        imported: [names[0].text],
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      };
    } else if (node.type === 'import_from_statement') {
      const moduleNode = node.childForFieldName('module_name');
      const source = moduleNode ? moduleNode.text : '';
      
      const imported: string[] = [];
      const nameNodes = node.descendantsOfType('dotted_name');
      nameNodes.forEach(n => {
        if (n.parent?.type !== 'import_from_statement') {
          imported.push(n.text);
        }
      });

      return {
        source,
        imported,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      };
    }

    return null;
  }

  private extractJSFunctionCall(node: Parser.SyntaxNode, filePath: string): ASTFunctionCall | null {
    const funcNode = node.childForFieldName('function');
    if (!funcNode) return null;

    let functionName = '';
    let receiver: string | undefined;

    if (funcNode.type === 'member_expression') {
      const objectNode = funcNode.childForFieldName('object');
      const propertyNode = funcNode.childForFieldName('property');
      if (objectNode && propertyNode) {
        receiver = objectNode.text;
        functionName = propertyNode.text;
      }
    } else {
      functionName = funcNode.text;
    }

    const args: string[] = [];
    const argsNode = node.childForFieldName('arguments');
    if (argsNode) {
      argsNode.children.forEach(child => {
        if (child.type !== '(' && child.type !== ')' && child.type !== ',') {
          args.push(child.text);
        }
      });
    }

    return {
      functionName,
      filePath,
      line: node.startPosition.row + 1,
      arguments: args,
      receiver,
    };
  }

  private extractJavaMethodCall(node: Parser.SyntaxNode, filePath: string): ASTFunctionCall | null {
    const nameNode = node.childForFieldName('name');
    const objectNode = node.childForFieldName('object');
    
    if (!nameNode) return null;

    const functionName = nameNode.text;
    const receiver = objectNode ? objectNode.text : undefined;

    const args: string[] = [];
    const argsNode = node.childForFieldName('arguments');
    if (argsNode) {
      argsNode.children.forEach(child => {
        if (child.type !== '(' && child.type !== ')' && child.type !== ',') {
          args.push(child.text.slice(0, 50)); // Truncate long args
        }
      });
    }

    return {
      functionName,
      filePath,
      line: node.startPosition.row + 1,
      arguments: args,
      receiver,
    };
  }

  private extractPythonFunctionCall(node: Parser.SyntaxNode, filePath: string): ASTFunctionCall | null {
    const funcNode = node.childForFieldName('function');
    if (!funcNode) return null;

    let functionName = '';
    let receiver: string | undefined;

    if (funcNode.type === 'attribute') {
      const objectNode = funcNode.childForFieldName('object');
      const attrNode = funcNode.childForFieldName('attribute');
      if (objectNode && attrNode) {
        receiver = objectNode.text;
        functionName = attrNode.text;
      }
    } else {
      functionName = funcNode.text;
    }

    const args: string[] = [];
    const argsNode = node.childForFieldName('arguments');
    if (argsNode) {
      argsNode.children.forEach(child => {
        if (child.type !== '(' && child.type !== ')' && child.type !== ',') {
          args.push(child.text.slice(0, 50));
        }
      });
    }

    return {
      functionName,
      filePath,
      line: node.startPosition.row + 1,
      arguments: args,
      receiver,
    };
  }

  private traverseTree(node: Parser.SyntaxNode, callback: (node: Parser.SyntaxNode) => void) {
    callback(node);
    for (const child of node.children) {
      this.traverseTree(child, callback);
    }
  }

  // Find specific class/function usage with AST precision
  findClassUsageAST(repoPath: string, className: string, language?: string): ASTClassUsage[] {
    const result = language === 'java' 
      ? this.analyzeJavaAST(repoPath)
      : language === 'python'
      ? this.analyzePythonAST(repoPath)
      : language === 'javascript'
      ? this.analyzeJavaScriptAST(repoPath)
      : this.analyzeAllAST(repoPath);

    return result.classUsages.filter(u => u.className === className);
  }

  // Find function calls with AST precision
  findFunctionCallsAST(repoPath: string, functionName: string): ASTFunctionCall[] {
    const result = this.analyzeAllAST(repoPath);
    return result.functionCalls.filter(f => f.functionName === functionName);
  }
}
