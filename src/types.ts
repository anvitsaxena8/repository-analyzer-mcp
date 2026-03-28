export interface Dependency {
  name: string;
  version: string;
  ecosystem: 'npm' | 'maven' | 'pip'; // package manager
  isDev?: boolean; // true if devDependency (npm) or test scope (maven)
}

export interface Module {
  id: string; // unique key: "package.json" or "pom.xml"
  path: string;
  ecosystem: string;
  dependencies: Dependency[];
  type: 'frontend' | 'backend' | 'library' | 'unknown';
}

export interface ProjectIndex {
  modules: Module[];
  createdAt: Date;
  scannedPath: string;
}

export interface DependencyNode {
  module: string;
  deps: string[]; // what this module depends on
}

export interface DependencyTreeNode {
  name: string;
  version: string;
  dependencies?: Map<string, DependencyTreeNode>;
  resolved?: string;
  dev?: boolean;
}

export interface PackageLockDependency {
  version: string;
  resolved?: string;
  dependencies?: Record<string, PackageLockDependency>;
  dev?: boolean;
}
