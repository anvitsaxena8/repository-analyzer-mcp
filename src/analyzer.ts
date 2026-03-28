import { DBManager } from './db-manager.js';
import { DependencyTreeNode } from './types.js';

export class Analyzer {
  constructor(private db: DBManager) {}

  // Format dependency tree as readable text
  formatDependencyTree(tree: DependencyTreeNode | null): string {
    if (!tree) {
      return 'No dependency tree available. Make sure package-lock.json exists in the project.';
    }

    let result = `Dependency Tree for ${tree.name}@${tree.version}\n\n`;
    
    if (!tree.dependencies || tree.dependencies.size === 0) {
      return result + '(No dependencies)';
    }

    const depArray = Array.from(tree.dependencies.entries());
    for (let i = 0; i < depArray.length; i++) {
      const [name, node] = depArray[i];
      const isLast = i === depArray.length - 1;
      result += this.formatTreeNode(name, node, '', isLast);
    }

    return result;
  }

  private formatTreeNode(name: string, node: DependencyTreeNode, prefix: string, isLast: boolean): string {
    const connector = isLast ? '└── ' : '├── ';
    const devTag = node.dev ? ' [dev]' : '';
    let result = `${prefix}${connector}${name}@${node.version}${devTag}\n`;

    if (node.dependencies && node.dependencies.size > 0) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      const depArray = Array.from(node.dependencies.entries());
      
      for (let i = 0; i < depArray.length; i++) {
        const [childName, childNode] = depArray[i];
        const childIsLast = i === depArray.length - 1;
        result += this.formatTreeNode(childName, childNode, newPrefix, childIsLast);
      }
    }

    return result;
  }

  // Get a summary of the entire project
  getProjectSummary(): string {
    const modules = this.db.getAllModules();
    
    if (modules.length === 0) {
      return 'No manifest files found in this repository.';
    }

    let summary = `Found ${modules.length} module(s):\n\n`;

    for (const module of modules) {
      const deps = this.db.getDependencies(module.id);
      const prodDeps = deps.filter(d => !d.isDev).length;
      const devDeps = deps.filter(d => d.isDev).length;

      summary += `**${module.id}** (${module.ecosystem})\n`;
      summary += `  Path: ${module.path}\n`;
      summary += `  Type: ${module.type}\n`;
      summary += `  Dependencies: ${prodDeps} production, ${devDeps} dev\n\n`;
    }

    return summary;
  }

  // Get what depends on a specific dependency
  getWhoDepends(depName: string): string {
    const modules = this.db.getWhoDepends(depName);
    
    if (modules.length === 0) {
      return `No modules depend on "${depName}".`;
    }

    return `The following modules depend on "${depName}":\n${modules.join('\n')}`;
  }

  // List all dependencies
  listAllDependencies(): string {
    const modules = this.db.getAllModules();
    let result = 'All Dependencies by Module:\n\n';

    for (const module of modules) {
      const deps = this.db.getDependencies(module.id);
      result += `**${module.id}**\n`;
      
      if (deps.length === 0) {
        result += '  (No dependencies)\n\n';
      } else {
        for (const dep of deps) {
          const tag = dep.isDev ? '[dev]' : '[prod]';
          result += `  - ${dep.name}@${dep.version} ${tag}\n`;
        }
        result += '\n';
      }
    }

    return result;
  }

  // Get stats
  getStats(): {
    totalModules: number;
    totalDependencies: number;
    ecosystems: Set<string>;
  } {
    const modules = this.db.getAllModules();
    const ecosystems = new Set<string>();
    let totalDeps = 0;

    for (const module of modules) {
      ecosystems.add(module.ecosystem);
      totalDeps += this.db.getDependencies(module.id).length;
    }

    return {
      totalModules: modules.length,
      totalDependencies: totalDeps,
      ecosystems,
    };
  }
}
