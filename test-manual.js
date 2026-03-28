import { ManifestParser } from './dist/manifest-parser.js';
import { DBManager } from './dist/db-manager.js';
import { Analyzer } from './dist/analyzer.js';

const testPath = './test-project';

async function test() {
  console.log('🔍 Testing Repo Lens MCP...\n');
  
  // Initialize components
  const parser = new ManifestParser();
  const db = new DBManager(testPath);
  const analyzer = new Analyzer(db);
  
  // Clear and scan
  db.clearAll();
  const modules = await parser.scanDirectory(testPath);
  
  console.log(`Found ${modules.length} modules:`);
  for (const module of modules) {
    console.log(`  - ${module.id} (${module.ecosystem}): ${module.dependencies.length} dependencies`);
    db.insertModule(module);
  }
  
  // Get summary
  console.log('\n--- Project Summary ---');
  console.log(analyzer.getProjectSummary());
  
  // Test reverse dependency lookup
  console.log('\n--- Who depends on "react"? ---');
  console.log(analyzer.getWhoDepends('react'));
  
  // Test stats
  const stats = analyzer.getStats();
  console.log('\n--- Statistics ---');
  console.log(`Total Modules: ${stats.totalModules}`);
  console.log(`Total Dependencies: ${stats.totalDependencies}`);
  console.log(`Ecosystems: ${Array.from(stats.ecosystems).join(', ')}`);
  
  // List all dependencies
  console.log('\n--- All Dependencies ---');
  console.log(analyzer.listAllDependencies());
  
  db.close();
  console.log('✅ Test complete!');
}

test().catch(console.error);
