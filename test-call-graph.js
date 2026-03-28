#!/usr/bin/env node

/**
 * Test script for Call Graph Analyzer
 * Tests the call graph functionality with a simple test project
 */

import { CallGraphAnalyzer } from './dist/call-graph-analyzer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testCallGraph() {
  console.log('🧪 Testing Call Graph Analyzer\n');
  
  const analyzer = new CallGraphAnalyzer();
  const testProjectPath = path.join(__dirname, 'test-project');
  
  try {
    // Test 1: Build call graph
    console.log('Test 1: Building call graph...');
    const callGraph = analyzer.buildCallGraph(testProjectPath);
    console.log(`✅ Call graph built with ${callGraph.nodes.size} nodes and ${callGraph.edges.length} edges\n`);
    
    // Test 2: Get statistics
    console.log('Test 2: Getting statistics...');
    const stats = analyzer.getStatistics();
    console.log('Statistics:');
    console.log(`  - Total Methods: ${stats.totalMethods}`);
    console.log(`  - Total Call Relationships: ${stats.totalCallRelationships}`);
    console.log(`  - Entry Points: ${stats.entryPoints}`);
    console.log(`  - Leaf Nodes: ${stats.leafNodes}`);
    console.log(`  - Average Calls per Method: ${stats.averageCallsPerMethod}`);
    console.log(`  - Max Call Depth: ${stats.maxCallDepth}`);
    console.log(`  - Module Dependencies: ${stats.moduleDependencies}\n`);
    
    // Test 3: List some methods
    console.log('Test 3: Listing sample methods...');
    let count = 0;
    for (const [id, node] of callGraph.nodes.entries()) {
      if (count < 5) {
        console.log(`  - ${node.method.name} (${path.basename(node.method.filePath)}:${node.method.line})`);
        console.log(`    Callers: ${node.callers.length}, Callees: ${node.callees.length}`);
        count++;
      }
    }
    console.log('');
    
    // Test 4: Export to JSON
    console.log('Test 4: Exporting to JSON...');
    const json = analyzer.exportToJSON();
    const jsonObj = JSON.parse(json);
    console.log(`✅ Exported ${jsonObj.nodes.length} nodes and ${jsonObj.edges.length} edges\n`);
    
    // Test 5: Find entry points
    console.log('Test 5: Entry points (methods with no callers)...');
    if (callGraph.entryPoints.length > 0) {
      const sampleEntries = callGraph.entryPoints.slice(0, 3);
      for (const entryId of sampleEntries) {
        const node = callGraph.nodes.get(entryId);
        if (node) {
          console.log(`  - ${node.method.name} (${path.basename(node.method.filePath)}:${node.method.line})`);
        }
      }
      if (callGraph.entryPoints.length > 3) {
        console.log(`  ... and ${callGraph.entryPoints.length - 3} more`);
      }
    } else {
      console.log('  No entry points found');
    }
    console.log('');
    
    console.log('✅ All tests passed!\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCallGraph();
