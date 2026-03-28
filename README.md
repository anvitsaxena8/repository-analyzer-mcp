# Repository Analyzer MCP

> **Intelligent codebase analysis and documentation generation for modern development teams**

An MCP (Model Context Protocol) server that provides deep codebase intelligence through dependency analysis, architecture detection, security scanning, and automatic documentation generation.

[![npm version](https://img.shields.io/npm/v/repository-analyzer-mcp.svg)](https://www.npmjs.com/package/repository-analyzer-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

### Core Capabilities
- 🔍 **Multi-Ecosystem Dependency Scanning** - Supports npm, Maven, pip, and more
- 💾 **Local SQLite Database** - Fast, indexed dependency queries
- 🏗️ **Architecture Analysis** - Detects patterns, layers, and structural issues
- 📊 **Dependency Intelligence** - Tree visualization, reverse lookups, circular detection
- 🔒 **Security Scanning** - Vulnerability detection and outdated package alerts
- 📄 **Auto Documentation** - Generate comprehensive markdown docs automatically
- 🔄 **Data Flow Tracing** - Track data across microservices, queues, and APIs
- 🎯 **Code Analysis** - AST-based import analysis and class usage tracking
- 🏢 **Multi-Repository Workspace Analysis** - Analyze multiple repos at once (IntelliJ, monorepos)

### Advanced Features
- **Hotspot Detection** - Find frequently changed, high-risk files
- **Unused Dependencies** - Identify and remove bloat
- **Developer Onboarding** - AI-powered Q&A about your codebase
- **Performance Optimization** - Suggestions for improving code quality
- **Refactoring Candidates** - Identify code that needs attention

## 📦 Installation

### Prerequisites

**Node.js Version Requirement**: This package requires Node.js version **>=18 and <=22**. Using other Node.js versions may cause installation failures due to native module compilation issues with `better-sqlite3`.

Check your Node.js version:
```bash
node --version
```

If you need to switch Node.js versions, consider using [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager):
```bash
# Install and use Node.js 22
nvm install 22
nvm use 22
```

### From npm (Recommended)
```bash
npm install -g repository-analyzer-mcp
```

### From Source
```bash
# Clone or download the source code
npm install
npm run build
```

### Finding Installation Path

After installing globally, you need to find where npm installed the package. Use this command:

```bash
npm root -g
```

This will output something like:
- **macOS (Homebrew)**: `/opt/homebrew/lib/node_modules`
- **macOS (nvm)**: `/Users/username/.nvm/versions/node/vX.X.X/lib/node_modules`
- **Linux**: `/usr/local/lib/node_modules`
- **Windows**: `C:\Users\username\AppData\Roaming\npm\node_modules`

Your full path will be: `<npm-root>/repository-analyzer-mcp/dist/index.js`

**Example:**
```bash
# Find your npm global root
npm root -g
# Output: /opt/homebrew/lib/node_modules

# Your full path:
# /opt/homebrew/lib/node_modules/repository-analyzer-mcp/dist/index.js
```

### Troubleshooting Installation

**Issue: `npm install` fails with node-gyp errors**
```
gyp info using node@25.6.1
gyp ERR! configure error
gyp ERR! stack Error: Can't find Python executable
```

**Solution:** This occurs when using an unsupported Node.js version. The package requires Node.js >=18 and <=22.

1. Check your Node.js version: `node --version`
2. If using Node.js 23+ or 17-, downgrade/upgrade to a supported version:
   ```bash
   # Using nvm
   nvm install 22
   nvm use 22
   ```
3. Clear npm cache and reinstall:
   ```bash
   npm cache clean --force
   npm install -g repository-analyzer-mcp
   ```

**Issue: Prebuild-install warnings**
```
prebuild-install warn install No prebuilt binaries found
```

This is normal on first install and will compile from source. Ensure you have the supported Node.js version installed.

## 🎯 Quick Start

### 1. Configure MCP Client

**For Claude Desktop** (`~/.config/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "repository-analyzer": {
      "command": "node",
      "args": ["/path/to/repository-analyzer-mcp/dist/index.js"]
    }
  }
}
```

**For Windsurf Cascade** (`~/.codeium/windsurf/mcp_config.json`):
```json
{
  "mcpServers": {
    "repository-analyzer": {
      "command": "node",
      "args": ["/path/to/repository-analyzer-mcp/dist/index.js"]
    }
  }
}
```

> **Note:** Replace `/path/to/repository-analyzer-mcp/` with the actual path where you installed the package.

### 2. Start Using

Ask your AI assistant:
- *"Scan this project and show me the dependencies"*
- *"Generate architecture documentation for this repo"*
- *"What modules depend on React?"*
- *"Find security vulnerabilities in my dependencies"*
- *"Show me the data flow through this system"*

## 📚 All 20 Available Tools

### 1. Dependency Management (5 tools)

#### `scan_project`
Scan and index all dependency manifests (package.json, pom.xml, requirements.txt).
```javascript
scan_project({ project_path: "/path/to/project" })
```
**Use case:** First step when analyzing a new repository

#### `get_project_summary`
Get an overview of all modules and dependencies in the project.
```javascript
get_project_summary()
```
**Returns:** Module count, ecosystems detected, dependency statistics

#### `what_depends_on`
Find which modules depend on a specific library/package.
```javascript
what_depends_on({ dependency_name: "react" })
```
**Example:** Find all modules using "lodash" or "spring-boot-starter-web"

#### `get_dependency_tree`
Visualize the complete dependency tree with transitive dependencies.
```javascript
get_dependency_tree({ project_path: "/path/to/project" })
```
**Supports:** npm (package-lock.json), Maven (mvn dependency:tree), Gradle, pip
**Output:** Tree structure showing nested dependencies

#### `detect_circular_dependencies`
Detect circular dependencies in the dependency graph using DFS traversal.
```javascript
detect_circular_dependencies()
```
**Critical for:** Java/Spring projects where circular dependencies cause build failures
**Shows:** Complete dependency cycles like "Module A → B → C → A"

### 2. Code Analysis (3 tools)

#### `analyze_code_imports`
Analyze actual import statements across the codebase.
```javascript
analyze_code_imports({ 
  project_path: "/path/to/project",
  language: "javascript"  // or "java", "python", "all"
})
```
**Supports:** Java, JavaScript/TypeScript, Python
**Returns:** Import statements, imported modules, file locations

#### `find_class_usage`
Find where specific classes or modules are used in the codebase.
```javascript
find_class_usage({ 
  class_name: "AuthService",
  project_path: "/path/to/project"
})
```
**Use case:** "Which files use QasClient?" or "Where is VaultUtils called?"

#### `analyze_code_ast`
Perform AST (Abstract Syntax Tree) analysis using tree-sitter for maximum accuracy.
```javascript
analyze_code_ast({ 
  project_path: "/path/to/project",
  language: "all",  // or "java", "javascript", "python"
  analysis_type: "all"  // or "imports", "calls", "classes"
})
```
**Supports:** Java, JavaScript/TypeScript, Python
**Returns:** Precise import analysis, function calls, semantic understanding

### 3. Architecture & Intelligence (4 tools)

#### `get_architecture_summary`
Detect and summarize architectural patterns from file/folder structure.
```javascript
get_architecture_summary({ project_path: "/path/to/project" })
```
**Detects:** MVC (controllers/, services/, repositories/), layered architecture, component patterns

#### `find_hotspot_files`
Find files changed most frequently using git history.
```javascript
find_hotspot_files({ 
  project_path: "/path/to/project",
  limit: 20
})
```
**Returns:** High-risk files with change frequency and risk scores
**Use case:** Identify files that need extra caution when modifying

#### `suggest_refactor_candidates`
Suggest files that may benefit from refactoring based on coupling and churn.
```javascript
suggest_refactor_candidates({ 
  project_path: "/path/to/project",
  limit: 10
})
```
**Combines:** AST analysis + git history to identify refactor targets

#### `find_unused_dependencies`
Find dependencies declared in manifests but never imported in code.
```javascript
find_unused_dependencies({ project_path: "/path/to/project" })
```
**Cross-references:** package.json/pom.xml/requirements.txt against actual imports
**Use case:** Reduce bundle size and clean up dependency bloat

### 4. Security & Performance (2 tools)

#### `scan_security_vulnerabilities`
Scan for security vulnerabilities using industry-standard tools.
```javascript
scan_security_vulnerabilities({ project_path: "/path/to/project" })
```
**Uses:** npm audit (Node.js), OWASP Dependency-Check (Java), pip-audit/safety (Python)
**Detects:** CVEs, severity ratings, outdated packages
**Returns:** Vulnerability report with fix suggestions

#### `detect_performance_bottlenecks`
Detect performance bottlenecks in the codebase.
```javascript
detect_performance_bottlenecks({ project_path: "/path/to/project" })
```
**Analyzes:** Code complexity, coupling, and cohesion
**Returns:** Performance optimization suggestions

### 5. Data Flow & Tracing (1 tool)

#### `trace_data_flow`
Trace data flow across distributed systems and microservices. Includes Mermaid diagram visualization.
```javascript
trace_data_flow({ 
  project_path: "/path/to/project",
  include_diagram: true  // optional, default: true
})
```
**Detects:** Kafka/RabbitMQ producers/consumers, API endpoints/clients, database operations
**Use case:** Understand how data moves through Module A → Kafka → Module B → Elasticsearch → API → UI
**Output:** Data flow analysis + Mermaid diagram that can be rendered in mermaid.live, Notion, Confluence, and most markdown viewers

### 6. Documentation & Onboarding (2 tools)

#### `generate_repo_document`
Auto-generate comprehensive markdown documentation for a single repository.
```javascript
generate_repo_document({ 
  output_type: "summary",  // or "architecture" or "full"
  output_file: "/path/to/custom-name.md",  // optional
  project_path: "/path/to/project"
})
```
**Output Types:**
- **`summary`** - Quick onboarding doc with tech stack and dependencies
- **`architecture`** - Detailed structural analysis with patterns and hotspots  
- **`full`** - Comprehensive report combining both

**Default filename:** `CODEBASE_MEMORY.md` (saved in project root)

**Generated docs include:**
- Project overview and tech stack detection (React, Spring Boot, Django, etc.)
- Dependency analysis (production vs dev)
- Architecture patterns and layers
- Risk assessment for high-dependency files
- Circular dependency warnings
- Hotspot files (most frequently changed)
- Dependency graphs with risk levels

**Perfect for:** Developer onboarding, architecture reviews, living documentation

#### `onboard_new_developer`
AI-powered Q&A about your codebase for new team members.
```javascript
onboard_new_developer({ 
  question: "How does authentication work in this project?",
  project_path: "/path/to/project"
})
```
**Combines:** Architecture analysis, AST data, dependency trees, code patterns
**Example questions:**
- "How does authentication work?"
- "Where is the database layer?"
- "What files handle user management?"
- "What is the testing setup?"

### 7. Call Graph & Method Analysis (1 tool) 🆕

#### `analyze_call_graph`
Comprehensive call graph analysis with multiple analysis types: build, chains, callers, callees, stats, and export.
```javascript
// Build call graph
analyze_call_graph({ 
  analysis_type: "build",
  project_path: "/path/to/project" 
})

// Find call chains
analyze_call_graph({ 
  analysis_type: "chains",
  from_method: "handleRequest",
  to_method: "saveToDatabase",
  max_depth: 10
})

// Get method callers (reverse lookup)
analyze_call_graph({ 
  analysis_type: "callers",
  method_name: "authenticate"
})

// Get method callees (forward lookup)
analyze_call_graph({ 
  analysis_type: "callees",
  method_name: "processPayment"
})

// Get statistics
analyze_call_graph({ 
  analysis_type: "stats",
  project_path: "/path/to/project"
})

// Export to JSON
analyze_call_graph({ 
  analysis_type: "export",
  output_file: "/path/to/call-graph.json"
})
```
**Analysis Types:**
- **build** - Create complete call graph with method relationships
- **chains** - Find execution paths from method A to method B
- **callers** - Reverse lookup (who calls this method?)
- **callees** - Forward lookup (what does this method call?)
- **stats** - Get complexity metrics and architecture insights
- **export** - Export to JSON for external visualization

**Use cases:** Understanding code flow, impact analysis, refactoring support, reducing AI hallucination
**Supports:** JavaScript, TypeScript, Java, Python

### 8. Multi-Repository Workspace Analysis (3 tools)

#### `detect_workspace_repos`
Auto-detect all repositories in a workspace directory (IntelliJ, monorepos).
```javascript
detect_workspace_repos({ 
  workspace_path: "/path/to/workspace",
  max_depth: 3  // optional, default: 3
})
```
**Detects:** Repositories with `package.json`, `pom.xml`, `build.gradle`, `requirements.txt`
**Use case:** Discover all repos in an IntelliJ multi-module project or monorepo
**Output:** Table showing repository name, type (npm/maven/gradle/python), and manifest files

#### `scan_workspace_dependencies`
Scan and index dependencies for all repositories in a workspace simultaneously.
```javascript
scan_workspace_dependencies({ 
  workspace_path: "/path/to/workspace",
  repo_names: ["repo1", "repo2"]  // optional, auto-detects if not provided
})
```
**Scans:** Multiple repositories simultaneously
**Indexes:** Dependencies for all repos in the workspace
**Use case:** Quickly index an entire IntelliJ workspace or monorepo
**Output:** Summary of scanned repositories with module counts

#### `generate_cross_repo_documentation`
Generate comprehensive cross-repository workflow documentation.
```javascript
generate_cross_repo_documentation({ 
  workspace_path: "/path/to/workspace",
  repo_names: ["ui-commons", "service", "ui-app"],  // optional
  output_file: "/path/to/WORKSPACE_MEMORY.md"  // optional
})
```

**Generated `WORKSPACE_MEMORY.md` includes:**
- 📊 **Repository Overview** - Table of all repos with types and manifests
- 🏗️ **ASCII Architecture Diagram** - Visual representation of repo ecosystem
- 🔗 **Cross-Repository Dependencies** - How repos depend on each other (npm packages, Maven artifacts)
- 📦 **Shared Packages** - Common dependencies used across multiple repos
- 🔄 **Integration Patterns** - Detected patterns (React, Redux, Spring Boot, Kafka, etc.)
- 🛠️ **Tech Stack Summary** - Consolidated view of all technologies
- 👨‍💻 **Development Workflow** - How to work across multiple repos
- 💡 **Recommendations** - Where to add new features, best practices

**Perfect for:** 
- Understanding multi-repo projects (microservices, monorepos)
- IntelliJ multi-module projects
- Developer onboarding across multiple repositories
- Architecture documentation for distributed systems

**Example output:**
```markdown
# Cross-Repository Workflow Documentation

## Repository Overview
| Repository | Type | Manifest Files |
|------------|------|----------------|
| ui-commons | npm | package.json |
| auth-service | maven | pom.xml |
| ui-app | npm | package.json |

## Architecture Diagram
┌─────────────────────────────────────┐
│         Frontend Layer              │
├─────────────────────────────────────┤
│  📱 ui-app                          │
└─────────────────────────────────────┘
              ↓ HTTP/REST
┌─────────────────────────────────────┐
│         Backend Layer               │
├─────────────────────────────────────┤
│  ⚙️  auth-service                   │
└─────────────────────────────────────┘
```

## 🗂️ Supported Ecosystems

| Ecosystem | Manifest File | Status |
|-----------|--------------|--------|
| npm | `package.json` | ✅ Full support |
| Maven | `pom.xml` | ✅ Full support |
| pip | `requirements.txt` | ✅ Full support |
| Gradle | `build.gradle` | ✅ Supported |

## 🏗️ Project Structure

```
repository-analyzer-mcp/
├── src/
│   ├── index.ts                    # MCP server & tool registration
│   ├── manifest-parser.ts          # Multi-ecosystem manifest parsing
│   ├── db-manager.ts               # SQLite database operations
│   ├── analyzer.ts                 # Dependency query logic
│   ├── code-analyzer.ts            # Code pattern analysis
│   ├── ast-analyzer.ts             # AST-based code analysis
│   ├── advanced-intelligence.ts    # Architecture & hotspot detection
│   ├── security-scanner.ts         # Vulnerability scanning
│   ├── data-flow-analyzer.ts       # Data flow tracing
│   ├── documentation-generator.ts  # Auto documentation
│   ├── developer-onboarding.ts     # AI-powered Q&A
│   └── types.ts                    # TypeScript definitions
├── dist/                           # Compiled JavaScript
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
└── CONTRIBUTING.md
```

## 💾 Database Schema

### How the Database Works

The `.repo-lens.db` SQLite database serves as a **local cache/index** for your project's dependency information:

**🎯 Why We Use a Database:**
1. **Performance** - Parse manifests once, query instantly (no re-parsing on every request)
2. **Complex Queries** - SQL enables fast reverse dependency lookups, joins, and filtering
3. **Persistence** - Data survives MCP server restarts
4. **Scalability** - Handles large monorepos with hundreds of modules efficiently

**🔄 Workflow:**
```
1. Run: scan_project()
   → Scans repo → Parses package.json, pom.xml, etc.
   → Stores in .repo-lens.db

2. Ask: "What depends on React?"
   → Queries .repo-lens.db → Instant results!
   → No need to re-parse files
```

**📝 Important Notes:**
- ✅ **Already in `.gitignore`** - The `*.db` pattern excludes it from git
- ✅ **User-specific** - Each developer generates their own local database
- ✅ **Regenerable** - Can be recreated anytime by running `scan_project()`
- ✅ **Location** - Created in the scanned project's root directory (not in repository-analyzer-mcp)

### Schema Details

SQLite database (`.repo-lens.db`) created in the **scanned project's root**:

**`modules` table**
- `id` - Unique identifier (e.g., "package.json", "pom.xml")
- `path` - Full path to manifest file
- `ecosystem` - Package manager (npm, maven, pip)
- `type` - Module type (frontend, backend, library)
- `created_at` - Timestamp of when module was indexed

**`dependencies` table**
- `id` - Auto-increment primary key
- `module_id` - Foreign key to modules table
- `dep_name` - Dependency name (e.g., "react", "spring-boot-starter-web")
- `dep_version` - Version string (e.g., "18.2.0", "3.2.0")
- `is_dev` - Boolean flag (1 for dev dependencies, 0 for production)
- `ecosystem` - Package manager type

**Example Query:**
```sql
-- Find all modules that depend on "react"
SELECT DISTINCT m.path, m.ecosystem 
FROM modules m
JOIN dependencies d ON m.id = d.module_id
WHERE d.dep_name = 'react';
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Development mode with auto-reload
npm run dev

# Build for production
npm run build

# Run the built version
npm start
```

## 📄 License

MIT © Anvit Saxena

## 📞 Support

- **Contact:** For support and questions, reach out via npm or email

---

**Built with ❤️ using the Model Context Protocol (MCP)**
