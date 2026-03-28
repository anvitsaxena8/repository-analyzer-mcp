import { ManifestParser } from './dist/manifest-parser.js';
import { Analyzer } from './dist/analyzer.js';
import { DBManager } from './dist/db-manager.js';

const testPath = './test-project';

async function testTree() {
  console.log('🌳 Testing Dependency Tree Feature...\n');
  
  const parser = new ManifestParser();
  const db = new DBManager(testPath);
  const analyzer = new Analyzer(db);
  
  // Test with test-project (has package.json but no package-lock.json)
  console.log('--- Test 1: Project without package-lock.json ---');
  const tree1 = parser.parsePackageLockTree(testPath);
  console.log(analyzer.formatDependencyTree(tree1));
  
  // Test with repo-lens-mcp itself (has package-lock.json)
  console.log('\n--- Test 2: Repo Lens MCP (with package-lock.json) ---');
  const tree2 = parser.parsePackageLockTree('.');
  const formatted = analyzer.formatDependencyTree(tree2);
  
  // Show first 50 lines to avoid overwhelming output
  const lines = formatted.split('\n');
  console.log(lines.slice(0, 50).join('\n'));
  
  if (lines.length > 50) {
    console.log(`\n... (${lines.length - 50} more lines)`);
  }
  
  console.log('\n✅ Dependency tree test complete!');
  
  db.close();
}

testTree().catch(console.error);
