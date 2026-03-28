import fs from 'fs';
import path from 'path';
import { ASTAnalyzer } from './ast-analyzer.js';

export interface MessageQueueProducer {
  file: string;
  line: number;
  topic: string;
  messageType?: string;
  framework: 'kafka' | 'rabbitmq' | 'sqs' | 'pubsub';
  code: string;
}

export interface MessageQueueConsumer {
  file: string;
  line: number;
  topic: string;
  messageType?: string;
  framework: 'kafka' | 'rabbitmq' | 'sqs' | 'pubsub';
  handler: string;
  code: string;
}

export interface APIEndpoint {
  file: string;
  line: number;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: string;
  requestType?: string;
  responseType?: string;
  code: string;
}

export interface APIClient {
  file: string;
  line: number;
  method: string;
  url: string;
  framework: 'axios' | 'fetch' | 'resttemplate' | 'httpclient';
  code: string;
}

export interface DataStore {
  file: string;
  line: number;
  type: 'elasticsearch' | 'mongodb' | 'redis' | 'postgres' | 'mysql';
  operation: 'read' | 'write' | 'update' | 'delete';
  collection?: string;
  code: string;
}

export interface DataFlowNode {
  id: string;
  type: 'producer' | 'consumer' | 'api_endpoint' | 'api_client' | 'datastore' | 'ui_component';
  label: string;
  file: string;
  line: number;
  details: any;
}

export interface DataFlowEdge {
  from: string;
  to: string;
  label: string;
  type: 'message_queue' | 'http' | 'database' | 'internal';
}

export interface DataFlowGraph {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
}

export class DataFlowAnalyzer {
  constructor(private astAnalyzer: ASTAnalyzer) {}

  // Helper to get relative path
  private getRelativePath(repoPath: string, filePath: string): string {
    if (filePath.startsWith(repoPath)) {
      return filePath.substring(repoPath.length + 1);
    }
    return filePath;
  }

  // Analyze complete data flow in the codebase
  analyzeDataFlow(repoPath: string): DataFlowGraph {
    const producers = this.findMessageQueueProducers(repoPath);
    const consumers = this.findMessageQueueConsumers(repoPath);
    const endpoints = this.findAPIEndpoints(repoPath);
    const clients = this.findAPIClients(repoPath);
    const datastores = this.findDataStores(repoPath);

    return this.buildDataFlowGraph(producers, consumers, endpoints, clients, datastores);
  }

  // Find Kafka/RabbitMQ/SQS producers
  findMessageQueueProducers(repoPath: string): MessageQueueProducer[] {
    const producers: MessageQueueProducer[] = [];
    const files = this.getAllCodeFiles(repoPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Kafka patterns
        if (line.match(/kafkaTemplate\.send|producer\.send|KafkaProducer/)) {
          const topic = this.extractTopicName(line, lines, i);
          if (topic) {
            producers.push({
              file: this.getRelativePath(repoPath, file),
              line: i + 1,
              topic,
              framework: 'kafka',
              code: line.trim(),
            });
          }
        }

        // RabbitMQ patterns
        if (line.match(/rabbitTemplate\.convertAndSend|channel\.basicPublish/)) {
          const topic = this.extractTopicName(line, lines, i);
          if (topic) {
            producers.push({
              file: this.getRelativePath(repoPath, file),
              line: i + 1,
              topic,
              framework: 'rabbitmq',
              code: line.trim(),
            });
          }
        }

        // AWS SQS patterns
        if (line.match(/sqs\.sendMessage|sqsTemplate\.send/)) {
          const topic = this.extractTopicName(line, lines, i);
          if (topic) {
            producers.push({
              file: this.getRelativePath(repoPath, file),
              line: i + 1,
              topic,
              framework: 'sqs',
              code: line.trim(),
            });
          }
        }

        // Google Pub/Sub patterns
        if (line.match(/publisher\.publish|pubsubTemplate\.publish/)) {
          const topic = this.extractTopicName(line, lines, i);
          if (topic) {
            producers.push({
              file: this.getRelativePath(repoPath, file),
              line: i + 1,
              topic,
              framework: 'pubsub',
              code: line.trim(),
            });
          }
        }
      }
    }

    return producers;
  }

  // Find Kafka/RabbitMQ/SQS consumers
  findMessageQueueConsumers(repoPath: string): MessageQueueConsumer[] {
    const consumers: MessageQueueConsumer[] = [];
    const files = this.getAllCodeFiles(repoPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Kafka @KafkaListener annotation
        if (line.match(/@KafkaListener|@Consumer/)) {
          const topic = this.extractTopicName(line, lines, i);
          const handler = this.extractHandlerName(lines, i);
          if (topic) {
            consumers.push({
              file: this.getRelativePath(repoPath, file),
              line: i + 1,
              topic,
              framework: 'kafka',
              handler: handler || 'unknown',
              code: line.trim(),
            });
          }
        }

        // RabbitMQ @RabbitListener
        if (line.match(/@RabbitListener|@QueueListener/)) {
          const topic = this.extractTopicName(line, lines, i);
          const handler = this.extractHandlerName(lines, i);
          if (topic) {
            consumers.push({
              file: this.getRelativePath(repoPath, file),
              line: i + 1,
              topic,
              framework: 'rabbitmq',
              handler: handler || 'unknown',
              code: line.trim(),
            });
          }
        }

        // SQS @SqsListener
        if (line.match(/@SqsListener|sqsListener/)) {
          const topic = this.extractTopicName(line, lines, i);
          const handler = this.extractHandlerName(lines, i);
          if (topic) {
            consumers.push({
              file: this.getRelativePath(repoPath, file),
              line: i + 1,
              topic,
              framework: 'sqs',
              handler: handler || 'unknown',
              code: line.trim(),
            });
          }
        }
      }
    }

    return consumers;
  }

  // Find REST API endpoints
  findAPIEndpoints(repoPath: string): APIEndpoint[] {
    const endpoints: APIEndpoint[] = [];
    const files = this.getAllCodeFiles(repoPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Spring annotations
        const springMatch = line.match(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*\(\s*["']([^"']+)["']/);
        if (springMatch) {
          const method = springMatch[1].replace('Mapping', '').toUpperCase() as any;
          const path = springMatch[2];
          const handler = this.extractHandlerName(lines, i);

          endpoints.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            method: method === 'REQUEST' ? 'GET' : method,
            path,
            handler: handler || 'unknown',
            code: line.trim(),
          });
        }

        // Express.js patterns
        const expressMatch = line.match(/app\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/);
        if (expressMatch) {
          endpoints.push({
            file: file.replace(repoPath + '/', ''),
            line: i + 1,
            method: expressMatch[1].toUpperCase() as any,
            path: expressMatch[2],
            handler: 'express_handler',
            code: line.trim(),
          });
        }

        // FastAPI patterns
        const fastApiMatch = line.match(/@app\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/);
        if (fastApiMatch) {
          endpoints.push({
            file: file.replace(repoPath + '/', ''),
            line: i + 1,
            method: fastApiMatch[1].toUpperCase() as any,
            path: fastApiMatch[2],
            handler: 'fastapi_handler',
            code: line.trim(),
          });
        }
      }
    }

    return endpoints;
  }

  // Find HTTP client calls
  findAPIClients(repoPath: string): APIClient[] {
    const clients: APIClient[] = [];
    const files = this.getAllCodeFiles(repoPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Axios
        const axiosMatch = line.match(/axios\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/);
        if (axiosMatch) {
          clients.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            method: axiosMatch[1].toUpperCase(),
            url: axiosMatch[2],
            framework: 'axios',
            code: line.trim(),
          });
        }

        // Fetch API
        const fetchMatch = line.match(/fetch\s*\(\s*["']([^"']+)["']/);
        if (fetchMatch) {
          clients.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            method: 'GET',
            url: fetchMatch[1],
            framework: 'fetch',
            code: line.trim(),
          });
        }

        // RestTemplate (Spring)
        const restTemplateMatch = line.match(/restTemplate\.(get|post|put|delete|exchange).*["']([^"']+)["']/);
        if (restTemplateMatch) {
          clients.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            method: restTemplateMatch[1].toUpperCase(),
            url: restTemplateMatch[2],
            framework: 'resttemplate',
            code: line.trim(),
          });
        }

        // HttpClient (Java)
        const httpClientMatch = line.match(/httpClient\.send.*["']([^"']+)["']/);
        if (httpClientMatch) {
          clients.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            method: 'GET',
            url: httpClientMatch[1],
            framework: 'httpclient',
            code: line.trim(),
          });
        }
      }
    }

    return clients;
  }

  // Find database operations
  findDataStores(repoPath: string): DataStore[] {
    const datastores: DataStore[] = [];
    const files = this.getAllCodeFiles(repoPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Elasticsearch
        if (line.match(/elasticsearchTemplate|restHighLevelClient|elasticClient/)) {
          const operation = line.match(/\.(index|search|update|delete)\s*\(/) ? 
            line.match(/\.(index|search|update|delete)\s*\(/)?.[1] as any : 'read';
          
          datastores.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            type: 'elasticsearch',
            operation: operation || 'read',
            code: line.trim(),
          });
        }

        // MongoDB
        if (line.match(/mongoTemplate|collection\.(find|insert|update|delete)/)) {
          const operation = line.match(/\.(find|insert|update|delete|save)\s*\(/)?.[1] as any || 'read';
          datastores.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            type: 'mongodb',
            operation: operation === 'find' ? 'read' : operation === 'insert' || operation === 'save' ? 'write' : operation,
            code: line.trim(),
          });
        }

        // Redis
        if (line.match(/redisTemplate|jedis\.(get|set|del)/)) {
          const operation = line.match(/\.(get|set|del|hget|hset)\s*\(/)?.[1] as any || 'read';
          datastores.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            type: 'redis',
            operation: operation.startsWith('get') || operation.startsWith('hget') ? 'read' : 'write',
            code: line.trim(),
          });
        }

        // SQL databases
        if (line.match(/jdbcTemplate|entityManager|@Query/)) {
          const operation = line.match(/SELECT/i) ? 'read' : 
                          line.match(/INSERT/i) ? 'write' :
                          line.match(/UPDATE/i) ? 'update' : 
                          line.match(/DELETE/i) ? 'delete' : 'read';
          
          datastores.push({
            file: this.getRelativePath(repoPath, file),
            line: i + 1,
            type: 'postgres',
            operation: operation as any,
            code: line.trim(),
          });
        }
      }
    }

    return datastores;
  }

  // Build data flow graph
  private buildDataFlowGraph(
    producers: MessageQueueProducer[],
    consumers: MessageQueueConsumer[],
    endpoints: APIEndpoint[],
    clients: APIClient[],
    datastores: DataStore[]
  ): DataFlowGraph {
    const nodes: DataFlowNode[] = [];
    const edges: DataFlowEdge[] = [];
    let nodeId = 0;

    // Add producer nodes
    for (const producer of producers) {
      nodes.push({
        id: `producer_${nodeId++}`,
        type: 'producer',
        label: `Producer: ${producer.topic}`,
        file: producer.file,
        line: producer.line,
        details: producer,
      });
    }

    // Add consumer nodes
    for (const consumer of consumers) {
      nodes.push({
        id: `consumer_${nodeId++}`,
        type: 'consumer',
        label: `Consumer: ${consumer.topic}`,
        file: consumer.file,
        line: consumer.line,
        details: consumer,
      });
    }

    // Add API endpoint nodes
    for (const endpoint of endpoints) {
      nodes.push({
        id: `endpoint_${nodeId++}`,
        type: 'api_endpoint',
        label: `${endpoint.method} ${endpoint.path}`,
        file: endpoint.file,
        line: endpoint.line,
        details: endpoint,
      });
    }

    // Add API client nodes
    for (const client of clients) {
      nodes.push({
        id: `client_${nodeId++}`,
        type: 'api_client',
        label: `${client.method} ${client.url}`,
        file: client.file,
        line: client.line,
        details: client,
      });
    }

    // Add datastore nodes
    for (const datastore of datastores) {
      nodes.push({
        id: `datastore_${nodeId++}`,
        type: 'datastore',
        label: `${datastore.type} ${datastore.operation}`,
        file: datastore.file,
        line: datastore.line,
        details: datastore,
      });
    }

    // Build edges by matching topics and URLs
    this.connectMessageQueueNodes(nodes, edges, producers, consumers);
    this.connectAPINodes(nodes, edges, endpoints, clients);
    this.connectDataStoreNodes(nodes, edges);

    return { nodes, edges };
  }

  // Connect producers to consumers via topics
  private connectMessageQueueNodes(
    nodes: DataFlowNode[],
    edges: DataFlowEdge[],
    producers: MessageQueueProducer[],
    consumers: MessageQueueConsumer[]
  ) {
    for (const producer of producers) {
      const producerNode = nodes.find(n => n.details === producer);
      if (!producerNode) continue;

      for (const consumer of consumers) {
        if (this.topicsMatch(producer.topic, consumer.topic)) {
          const consumerNode = nodes.find(n => n.details === consumer);
          if (consumerNode) {
            edges.push({
              from: producerNode.id,
              to: consumerNode.id,
              label: producer.topic,
              type: 'message_queue',
            });
          }
        }
      }
    }
  }

  // Connect API endpoints to clients
  private connectAPINodes(
    nodes: DataFlowNode[],
    edges: DataFlowEdge[],
    endpoints: APIEndpoint[],
    clients: APIClient[]
  ) {
    for (const client of clients) {
      const clientNode = nodes.find(n => n.details === client);
      if (!clientNode) continue;

      for (const endpoint of endpoints) {
        if (this.urlsMatch(client.url, endpoint.path)) {
          const endpointNode = nodes.find(n => n.details === endpoint);
          if (endpointNode) {
            edges.push({
              from: clientNode.id,
              to: endpointNode.id,
              label: `${client.method} ${endpoint.path}`,
              type: 'http',
            });
          }
        }
      }
    }
  }

  // Connect nodes to datastores
  private connectDataStoreNodes(nodes: DataFlowNode[], edges: DataFlowEdge[]) {
    // Connect consumers and endpoints to datastores in same file
    for (const node of nodes) {
      if (node.type === 'consumer' || node.type === 'api_endpoint') {
        const datastoresInSameFile = nodes.filter(
          n => n.type === 'datastore' && n.file === node.file
        );

        for (const ds of datastoresInSameFile) {
          edges.push({
            from: node.id,
            to: ds.id,
            label: (ds.details as DataStore).operation,
            type: 'database',
          });
        }
      }
    }
  }

  // Helper methods
  private extractTopicName(line: string, lines: string[], index: number): string | null {
    // Try to extract from current line
    const match = line.match(/["']([a-zA-Z0-9_.-]+)["']/);
    if (match) return match[1];

    // Try to extract from annotation on previous lines
    for (let i = Math.max(0, index - 3); i < index; i++) {
      const prevLine = lines[i];
      const topicMatch = prevLine.match(/topics?\s*=\s*["']([^"']+)["']/);
      if (topicMatch) return topicMatch[1];
    }

    return null;
  }

  private extractHandlerName(lines: string[], index: number): string | null {
    // Look for method name in next few lines
    for (let i = index; i < Math.min(lines.length, index + 5); i++) {
      const match = lines[i].match(/(?:public|private|protected)?\s+\w+\s+(\w+)\s*\(/);
      if (match) return match[1];
    }
    return null;
  }

  private topicsMatch(topic1: string, topic2: string): boolean {
    return topic1.toLowerCase() === topic2.toLowerCase();
  }

  private urlsMatch(url: string, path: string): boolean {
    // Remove protocol and domain from URL
    const cleanUrl = url.replace(/^https?:\/\/[^/]+/, '');
    return cleanUrl.includes(path) || path.includes(cleanUrl);
  }

  private getAllCodeFiles(repoPath: string): string[] {
    const files: string[] = [];
    const skipDirs = ['node_modules', 'dist', 'build', 'target', '.git', 'venv', '__pycache__'];
    const codeExtensions = ['.java', '.js', '.ts', '.tsx', '.py', '.go', '.kt'];

    const scanDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !skipDirs.includes(entry.name)) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (codeExtensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    scanDir(repoPath);
    return files;
  }

  // Generate Mermaid diagram
  generateMermaidDiagram(graph: DataFlowGraph): string {
    let mermaid = 'graph LR\n';

    // Add nodes
    for (const node of graph.nodes) {
      const shape = this.getMermaidShape(node.type);
      mermaid += `  ${node.id}${shape[0]}"${node.label}"${shape[1]}\n`;
    }

    // Add edges
    for (const edge of graph.edges) {
      mermaid += `  ${edge.from} -->|${edge.label}| ${edge.to}\n`;
    }

    return mermaid;
  }

  private getMermaidShape(type: string): [string, string] {
    switch (type) {
      case 'producer': return ['[', ']'];
      case 'consumer': return ['[', ']'];
      case 'api_endpoint': return ['(', ')'];
      case 'api_client': return ['(', ')'];
      case 'datastore': return ['[(', ')]'];
      default: return ['[', ']'];
    }
  }

  // Format data flow report
  formatDataFlowReport(graph: DataFlowGraph): string {
    let output = '🔄 Data Flow Analysis\n\n';

    // Group nodes by type
    const byType = new Map<string, DataFlowNode[]>();
    for (const node of graph.nodes) {
      if (!byType.has(node.type)) {
        byType.set(node.type, []);
      }
      byType.get(node.type)!.push(node);
    }

    // Message Queue Producers
    const producers = byType.get('producer') || [];
    if (producers.length > 0) {
      output += `📤 Message Queue Producers (${producers.length}):\n`;
      for (const node of producers) {
        const p = node.details as MessageQueueProducer;
        output += `  - ${p.topic} (${p.framework})\n`;
        output += `    File: ${node.file}:${node.line}\n`;
      }
      output += '\n';
    }

    // Message Queue Consumers
    const consumers = byType.get('consumer') || [];
    if (consumers.length > 0) {
      output += `📥 Message Queue Consumers (${consumers.length}):\n`;
      for (const node of consumers) {
        const c = node.details as MessageQueueConsumer;
        output += `  - ${c.topic} (${c.framework}) → ${c.handler}\n`;
        output += `    File: ${node.file}:${node.line}\n`;
      }
      output += '\n';
    }

    // API Endpoints
    const endpoints = byType.get('api_endpoint') || [];
    if (endpoints.length > 0) {
      output += `🌐 API Endpoints (${endpoints.length}):\n`;
      for (const node of endpoints) {
        const e = node.details as APIEndpoint;
        output += `  - ${e.method} ${e.path}\n`;
        output += `    File: ${node.file}:${node.line}\n`;
      }
      output += '\n';
    }

    // API Clients
    const clients = byType.get('api_client') || [];
    if (clients.length > 0) {
      output += `📡 API Clients (${clients.length}):\n`;
      for (const node of clients) {
        const c = node.details as APIClient;
        output += `  - ${c.method} ${c.url} (${c.framework})\n`;
        output += `    File: ${node.file}:${node.line}\n`;
      }
      output += '\n';
    }

    // Data Stores
    const datastores = byType.get('datastore') || [];
    if (datastores.length > 0) {
      output += `💾 Data Store Operations (${datastores.length}):\n`;
      const byStoreType = new Map<string, number>();
      for (const node of datastores) {
        const ds = node.details as DataStore;
        byStoreType.set(ds.type, (byStoreType.get(ds.type) || 0) + 1);
      }
      for (const [type, count] of byStoreType) {
        output += `  - ${type}: ${count} operation(s)\n`;
      }
      output += '\n';
    }

    // Data Flow Paths
    if (graph.edges.length > 0) {
      output += `🔀 Data Flow Paths (${graph.edges.length}):\n`;
      for (const edge of graph.edges.slice(0, 20)) {
        const fromNode = graph.nodes.find(n => n.id === edge.from);
        const toNode = graph.nodes.find(n => n.id === edge.to);
        if (fromNode && toNode) {
          output += `  ${fromNode.label} → ${toNode.label}\n`;
          output += `    Via: ${edge.label} (${edge.type})\n`;
        }
      }
      if (graph.edges.length > 20) {
        output += `  ... and ${graph.edges.length - 20} more paths\n`;
      }
      output += '\n';
    }

    return output;
  }
}
