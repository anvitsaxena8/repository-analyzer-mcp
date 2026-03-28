import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface Vulnerability {
  package: string;
  version: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  title: string;
  description?: string;
  cve?: string;
  cvss?: number;
  fixedIn?: string;
  ecosystem: 'npm' | 'maven' | 'pip';
}

export interface SecurityReport {
  totalVulnerabilities: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  vulnerabilities: Vulnerability[];
  scannedAt: Date;
  ecosystem: string;
}

export class SecurityScanner {
  // Scan npm project for vulnerabilities
  async scanNpmVulnerabilities(repoPath: string): Promise<SecurityReport | null> {
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    try {
      console.error('[repository-analyzer-mcp] Running npm audit...');
      const output = execSync('npm audit --json', {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000,
      });

      return this.parseNpmAudit(output);
    } catch (error: any) {
      // npm audit returns non-zero exit code if vulnerabilities found
      if (error.stdout) {
        return this.parseNpmAudit(error.stdout);
      }
      console.error('Error running npm audit:', error.message);
      return null;
    }
  }

  private parseNpmAudit(output: string): SecurityReport {
    try {
      const data = JSON.parse(output);
      const vulnerabilities: Vulnerability[] = [];

      // npm audit v7+ format
      if (data.vulnerabilities) {
        for (const [pkgName, vuln] of Object.entries(data.vulnerabilities as any)) {
          const v = vuln as any;
          vulnerabilities.push({
            package: pkgName,
            version: v.range || 'unknown',
            severity: this.normalizeSeverity(v.severity),
            title: v.via?.[0]?.title || 'Vulnerability found',
            description: v.via?.[0]?.url,
            cve: v.via?.[0]?.cve?.[0],
            cvss: v.via?.[0]?.cvss?.score,
            fixedIn: v.fixAvailable ? 'Available' : undefined,
            ecosystem: 'npm',
          });
        }
      }

      const metadata = data.metadata || {};
      return {
        totalVulnerabilities: vulnerabilities.length,
        critical: metadata.vulnerabilities?.critical || 0,
        high: metadata.vulnerabilities?.high || 0,
        moderate: metadata.vulnerabilities?.moderate || 0,
        low: metadata.vulnerabilities?.low || 0,
        vulnerabilities,
        scannedAt: new Date(),
        ecosystem: 'npm',
      };
    } catch (error) {
      console.error('Error parsing npm audit output:', error);
      return {
        totalVulnerabilities: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        vulnerabilities: [],
        scannedAt: new Date(),
        ecosystem: 'npm',
      };
    }
  }

  // Scan Maven project for vulnerabilities using OWASP Dependency-Check
  async scanMavenVulnerabilities(repoPath: string): Promise<SecurityReport | null> {
    const pomPath = path.join(repoPath, 'pom.xml');
    if (!fs.existsSync(pomPath)) {
      return null;
    }

    try {
      console.error('[repository-analyzer-mcp] Running Maven dependency-check...');
      // Check if dependency-check plugin is available
      const output = execSync(
        'mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=11 -Dformat=JSON',
        {
          cwd: repoPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120000, // 2 minutes
        }
      );

      // Parse the generated JSON report
      const reportPath = path.join(repoPath, 'target', 'dependency-check-report.json');
      if (fs.existsSync(reportPath)) {
        const reportData = fs.readFileSync(reportPath, 'utf-8');
        return this.parseDependencyCheckReport(reportData);
      }

      return null;
    } catch (error: any) {
      console.error('Error running Maven dependency-check:', error.message);
      // Try alternative: mvn versions:display-dependency-updates
      return this.scanMavenAlternative(repoPath);
    }
  }

  private scanMavenAlternative(repoPath: string): SecurityReport | null {
    try {
      console.error('[repository-analyzer-mcp] Using alternative Maven vulnerability check...');
      // This won't give CVEs but can show outdated dependencies
      execSync('mvn versions:display-dependency-updates', {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 60000,
      });

      return {
        totalVulnerabilities: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        vulnerabilities: [],
        scannedAt: new Date(),
        ecosystem: 'maven',
      };
    } catch (error) {
      return null;
    }
  }

  private parseDependencyCheckReport(reportData: string): SecurityReport {
    try {
      const data = JSON.parse(reportData);
      const vulnerabilities: Vulnerability[] = [];

      if (data.dependencies) {
        for (const dep of data.dependencies) {
          if (dep.vulnerabilities) {
            for (const vuln of dep.vulnerabilities) {
              vulnerabilities.push({
                package: dep.fileName || dep.name,
                version: dep.version || 'unknown',
                severity: this.normalizeSeverity(vuln.severity),
                title: vuln.name || 'Vulnerability found',
                description: vuln.description,
                cve: vuln.name,
                cvss: vuln.cvssv3?.baseScore || vuln.cvssv2?.score,
                ecosystem: 'maven',
              });
            }
          }
        }
      }

      const severityCounts = this.countBySeverity(vulnerabilities);

      return {
        totalVulnerabilities: vulnerabilities.length,
        ...severityCounts,
        vulnerabilities,
        scannedAt: new Date(),
        ecosystem: 'maven',
      };
    } catch (error) {
      console.error('Error parsing dependency-check report:', error);
      return {
        totalVulnerabilities: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        vulnerabilities: [],
        scannedAt: new Date(),
        ecosystem: 'maven',
      };
    }
  }

  // Scan Python project for vulnerabilities
  async scanPipVulnerabilities(repoPath: string): Promise<SecurityReport | null> {
    const reqPath = path.join(repoPath, 'requirements.txt');
    if (!fs.existsSync(reqPath)) {
      return null;
    }

    try {
      console.error('[repository-analyzer-mcp] Running pip-audit...');
      // Try pip-audit first
      try {
        const output = execSync('pip-audit --format json', {
          cwd: repoPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000,
        });

        return this.parsePipAudit(output);
      } catch {
        // Fallback to safety
        console.error('[repository-analyzer-mcp] Trying safety as fallback...');
        const output = execSync('safety check --json', {
          cwd: repoPath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000,
        });

        return this.parseSafetyCheck(output);
      }
    } catch (error: any) {
      console.error('Error running Python vulnerability scan:', error.message);
      return null;
    }
  }

  private parsePipAudit(output: string): SecurityReport {
    try {
      const data = JSON.parse(output);
      const vulnerabilities: Vulnerability[] = [];

      if (data.vulnerabilities) {
        for (const vuln of data.vulnerabilities) {
          vulnerabilities.push({
            package: vuln.name,
            version: vuln.version,
            severity: this.normalizeSeverity(vuln.severity || 'moderate'),
            title: vuln.id || 'Vulnerability found',
            description: vuln.description,
            cve: vuln.id,
            fixedIn: vuln.fix_versions?.[0],
            ecosystem: 'pip',
          });
        }
      }

      const severityCounts = this.countBySeverity(vulnerabilities);

      return {
        totalVulnerabilities: vulnerabilities.length,
        ...severityCounts,
        vulnerabilities,
        scannedAt: new Date(),
        ecosystem: 'pip',
      };
    } catch (error) {
      console.error('Error parsing pip-audit output:', error);
      return {
        totalVulnerabilities: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        vulnerabilities: [],
        scannedAt: new Date(),
        ecosystem: 'pip',
      };
    }
  }

  private parseSafetyCheck(output: string): SecurityReport {
    try {
      const data = JSON.parse(output);
      const vulnerabilities: Vulnerability[] = [];

      for (const vuln of data) {
        vulnerabilities.push({
          package: vuln[0],
          version: vuln[2],
          severity: 'moderate', // safety doesn't provide severity
          title: vuln[3] || 'Vulnerability found',
          description: vuln[4],
          cve: vuln[1],
          ecosystem: 'pip',
        });
      }

      const severityCounts = this.countBySeverity(vulnerabilities);

      return {
        totalVulnerabilities: vulnerabilities.length,
        ...severityCounts,
        vulnerabilities,
        scannedAt: new Date(),
        ecosystem: 'pip',
      };
    } catch (error) {
      console.error('Error parsing safety output:', error);
      return {
        totalVulnerabilities: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        vulnerabilities: [],
        scannedAt: new Date(),
        ecosystem: 'pip',
      };
    }
  }

  // Universal vulnerability scanner
  async scanAllVulnerabilities(repoPath: string): Promise<SecurityReport[]> {
    const reports: SecurityReport[] = [];

    const npmReport = await this.scanNpmVulnerabilities(repoPath);
    if (npmReport) reports.push(npmReport);

    const mavenReport = await this.scanMavenVulnerabilities(repoPath);
    if (mavenReport) reports.push(mavenReport);

    const pipReport = await this.scanPipVulnerabilities(repoPath);
    if (pipReport) reports.push(pipReport);

    return reports;
  }

  private normalizeSeverity(severity: string): 'critical' | 'high' | 'moderate' | 'low' | 'info' {
    const s = severity.toLowerCase();
    if (s.includes('critical')) return 'critical';
    if (s.includes('high')) return 'high';
    if (s.includes('moderate') || s.includes('medium')) return 'moderate';
    if (s.includes('low')) return 'low';
    return 'info';
  }

  private countBySeverity(vulnerabilities: Vulnerability[]) {
    return {
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      moderate: vulnerabilities.filter(v => v.severity === 'moderate').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length,
    };
  }

  // Format security report as readable text
  formatSecurityReport(reports: SecurityReport[]): string {
    if (reports.length === 0) {
      return 'No security vulnerabilities found or no supported package managers detected.';
    }

    let output = '🔒 Security Vulnerability Report\n';
    output += `Scanned at: ${reports[0].scannedAt.toISOString()}\n\n`;

    for (const report of reports) {
      output += `=== ${report.ecosystem.toUpperCase()} Security Scan ===\n\n`;
      output += `Total Vulnerabilities: ${report.totalVulnerabilities}\n`;
      output += `  🔴 Critical: ${report.critical}\n`;
      output += `  🟠 High: ${report.high}\n`;
      output += `  🟡 Moderate: ${report.moderate}\n`;
      output += `  🟢 Low: ${report.low}\n\n`;

      if (report.vulnerabilities.length > 0) {
        output += 'Vulnerabilities:\n\n';

        // Sort by severity
        const sorted = report.vulnerabilities.sort((a, b) => {
          const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        });

        for (const vuln of sorted.slice(0, 50)) { // Limit to 50 for readability
          const icon = vuln.severity === 'critical' ? '🔴' :
                       vuln.severity === 'high' ? '🟠' :
                       vuln.severity === 'moderate' ? '🟡' : '🟢';
          
          output += `${icon} ${vuln.severity.toUpperCase()}: ${vuln.package}@${vuln.version}\n`;
          output += `   ${vuln.title}\n`;
          if (vuln.cve) output += `   CVE: ${vuln.cve}\n`;
          if (vuln.cvss) output += `   CVSS Score: ${vuln.cvss}\n`;
          if (vuln.fixedIn) output += `   Fixed in: ${vuln.fixedIn}\n`;
          if (vuln.description) output += `   ${vuln.description.slice(0, 200)}...\n`;
          output += '\n';
        }

        if (sorted.length > 50) {
          output += `... and ${sorted.length - 50} more vulnerabilities\n\n`;
        }
      }
    }

    return output;
  }
}
