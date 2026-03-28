import fs from 'fs';
import path from 'path';

export interface ImportStatement {
  source: string;
  imported: string[];
  filePath: string;
  lineNumber: number;
}

export interface ClassUsage {
  className: string;
  filePath: string;
  lineNumber: number;
  usageType: 'import' | 'instantiation' | 'static_call' | 'reference';
}

export interface CodeAnalysisResult {
  imports: ImportStatement[];
  classUsages: ClassUsage[];
  totalFiles: number;
  filesByType: Record<string, number>;
}

export class CodeAnalyzer {
  // Analyze Java code for imports and class usage
  analyzeJavaCode(repoPath: string): CodeAnalysisResult {
    const result: CodeAnalysisResult = {
      imports: [],
      classUsages: [],
      totalFiles: 0,
      filesByType: {},
    };

    this.scanDirectory(repoPath, result, ['.java']);
    return result;
  }

  // Analyze JavaScript/TypeScript code
  analyzeJavaScriptCode(repoPath: string): CodeAnalysisResult {
    const result: CodeAnalysisResult = {
      imports: [],
      classUsages: [],
      totalFiles: 0,
      filesByType: {},
    };

    this.scanDirectory(repoPath, result, ['.js', '.jsx', '.ts', '.tsx']);
    return result;
  }

  // Analyze Python code
  analyzePythonCode(repoPath: string): CodeAnalysisResult {
    const result: CodeAnalysisResult = {
      imports: [],
      classUsages: [],
      totalFiles: 0,
      filesByType: {},
    };

    this.scanDirectory(repoPath, result, ['.py']);
    return result;
  }

  // Analyze all code in the repository
  analyzeAllCode(repoPath: string): CodeAnalysisResult {
    const result: CodeAnalysisResult = {
      imports: [],
      classUsages: [],
      totalFiles: 0,
      filesByType: {},
    };

    this.scanDirectory(repoPath, result, ['.java', '.js', '.jsx', '.ts', '.tsx', '.py']);
    return result;
  }

  private scanDirectory(dir: string, result: CodeAnalysisResult, extensions: string[]) {
    // Skip common directories that shouldn't be analyzed
    const skipDirs = ['node_modules', 'dist', 'build', 'target', '.git', 'venv', '__pycache__', 'coverage'];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!skipDirs.includes(entry.name)) {
            this.scanDirectory(fullPath, result, extensions);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            this.analyzeFile(fullPath, ext, result);
            result.totalFiles++;
            result.filesByType[ext] = (result.filesByType[ext] || 0) + 1;
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
  }

  private analyzeFile(filePath: string, ext: string, result: CodeAnalysisResult) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      if (ext === '.java') {
        this.analyzeJavaFile(filePath, lines, result);
      } else if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
        this.analyzeJavaScriptFile(filePath, lines, result);
      } else if (ext === '.py') {
        this.analyzePythonFile(filePath, lines, result);
      }
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
    }
  }

  private analyzeJavaFile(filePath: string, lines: string[], result: CodeAnalysisResult) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Match import statements: import com.company.module.*;
      const importMatch = line.match(/^import\s+(static\s+)?([a-zA-Z0-9_.]+)(\.\*)?;/);
      if (importMatch) {
        const fullImport = importMatch[2];
        const parts = fullImport.split('.');
        const className = importMatch[3] ? '*' : parts[parts.length - 1];

        result.imports.push({
          source: fullImport,
          imported: [className],
          filePath,
          lineNumber,
        });

        // Track class usage from import
        if (className !== '*') {
          result.classUsages.push({
            className,
            filePath,
            lineNumber,
            usageType: 'import',
          });
        }
      }

      // Match class instantiation: new QasClient()
      const newMatch = line.match(/new\s+([A-Z][a-zA-Z0-9_]*)\s*\(/);
      if (newMatch) {
        result.classUsages.push({
          className: newMatch[1],
          filePath,
          lineNumber,
          usageType: 'instantiation',
        });
      }

      // Match static method calls: VaultUtils.getSecret()
      const staticMatch = line.match(/([A-Z][a-zA-Z0-9_]*)\.[a-zA-Z0-9_]+\s*\(/);
      if (staticMatch) {
        result.classUsages.push({
          className: staticMatch[1],
          filePath,
          lineNumber,
          usageType: 'static_call',
        });
      }
    }
  }

  private analyzeJavaScriptFile(filePath: string, lines: string[], result: CodeAnalysisResult) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Match ES6 imports: import { Component } from 'react'
      const es6ImportMatch = line.match(/^import\s+(?:{([^}]+)}|([a-zA-Z0-9_]+))\s+from\s+['"]([^'"]+)['"]/);
      if (es6ImportMatch) {
        const imported = es6ImportMatch[1] 
          ? es6ImportMatch[1].split(',').map(s => s.trim())
          : [es6ImportMatch[2]];
        
        result.imports.push({
          source: es6ImportMatch[3],
          imported,
          filePath,
          lineNumber,
        });
      }

      // Match require: const express = require('express')
      const requireMatch = line.match(/(?:const|let|var)\s+(?:{([^}]+)}|([a-zA-Z0-9_]+))\s*=\s*require\s*\(['"]([^'"]+)['"]\)/);
      if (requireMatch) {
        const imported = requireMatch[1]
          ? requireMatch[1].split(',').map(s => s.trim())
          : [requireMatch[2]];

        result.imports.push({
          source: requireMatch[3],
          imported,
          filePath,
          lineNumber,
        });
      }

      // Match class instantiation: new ClassName()
      const newMatch = line.match(/new\s+([A-Z][a-zA-Z0-9_]*)\s*\(/);
      if (newMatch) {
        result.classUsages.push({
          className: newMatch[1],
          filePath,
          lineNumber,
          usageType: 'instantiation',
        });
      }
    }
  }

  private analyzePythonFile(filePath: string, lines: string[], result: CodeAnalysisResult) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Match import: import numpy as np
      const importMatch = line.match(/^import\s+([a-zA-Z0-9_.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?/);
      if (importMatch) {
        result.imports.push({
          source: importMatch[1],
          imported: [importMatch[2] || importMatch[1]],
          filePath,
          lineNumber,
        });
      }

      // Match from import: from flask import Flask, request
      const fromImportMatch = line.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+(.+)/);
      if (fromImportMatch) {
        const imported = fromImportMatch[2]
          .split(',')
          .map(s => s.trim().split(' as ')[0]);

        result.imports.push({
          source: fromImportMatch[1],
          imported,
          filePath,
          lineNumber,
        });
      }

      // Match class instantiation: obj = ClassName()
      const classMatch = line.match(/=\s*([A-Z][a-zA-Z0-9_]*)\s*\(/);
      if (classMatch) {
        result.classUsages.push({
          className: classMatch[1],
          filePath,
          lineNumber,
          usageType: 'instantiation',
        });
      }
    }
  }

  // Find specific pattern in code
  findPattern(repoPath: string, pattern: string, fileExtensions: string[]): Array<{file: string, line: number, content: string}> {
    const results: Array<{file: string, line: number, content: string}> = [];
    const regex = new RegExp(pattern, 'i');

    const scanForPattern = (dir: string) => {
      const skipDirs = ['node_modules', 'dist', 'build', 'target', '.git', 'venv', '__pycache__'];
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !skipDirs.includes(entry.name)) {
            scanForPattern(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (fileExtensions.includes(ext)) {
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lines = content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                  if (regex.test(lines[i])) {
                    results.push({
                      file: fullPath,
                      line: i + 1,
                      content: lines[i].trim(),
                    });
                  }
                }
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    scanForPattern(repoPath);
    return results;
  }
}
