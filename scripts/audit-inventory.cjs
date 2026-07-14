'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outputName = 'AUDIT_INVENTORY.json';
const outputPath = path.join(root, outputName);

function runGit(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function categoryFor(relativePath) {
  if (relativePath.startsWith('api/')) return 'api';
  if (relativePath === 'lib/analytics-core.js') return 'analytics-core';
  if (relativePath.startsWith('lib/')) return 'library';
  if (relativePath.startsWith('test/')) return 'test';
  if (relativePath.startsWith('scripts/')) return 'tooling';
  if (relativePath.startsWith('.github/')) return 'ci';
  if (/\.(md)$/i.test(relativePath)) return 'documentation';
  if (/\.(html|css)$/i.test(relativePath)) return 'ui';
  if (/\.(json)$/i.test(relativePath)) return 'configuration';
  if (/\.(js|cjs)$/i.test(relativePath)) return 'application';
  return 'repository';
}

function requiredPasses(relativePath, category) {
  const passes = ['static', 'consistency'];
  if (/\.(js|cjs)$/i.test(relativePath)) passes.push('tests', 'security', 'performance');
  if (category === 'api') passes.push('integration', 'resilience');
  if (category === 'analytics-core') passes.push('property-tests', 'numerical');
  if (category === 'ui' || relativePath === 'app.js') passes.push('browser-desktop', 'browser-mobile', 'accessibility');
  if (category === 'documentation') passes.push('runtime-reconciliation');
  if (category === 'ci' || category === 'configuration') passes.push('release');
  return [...new Set(passes)];
}

function lineCount(buffer) {
  if (!buffer.length) return 0;
  const text = buffer.toString('utf8');
  return text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0);
}

function listAuditableFiles() {
  const trackedAndUntracked = runGit(['ls-files', '--cached', '--others', '--exclude-standard'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((entry) => entry.replace(/\\/g, '/'));

  return [...new Set(trackedAndUntracked)]
    .filter((entry) => entry !== outputName)
    .filter((entry) => !entry.startsWith('.gitdir/'))
    .sort((a, b) => a.localeCompare(b));
}

function buildInventory() {
  const files = listAuditableFiles().map((relativePath) => {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const data = fs.readFileSync(absolutePath);
    const category = categoryFor(relativePath);
    return {
      path: relativePath,
      category,
      lines: lineCount(data),
      bytes: data.length,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
      requiredPasses: requiredPasses(relativePath, category)
    };
  });

  const byCategory = {};
  for (const file of files) {
    const current = byCategory[file.category] || { files: 0, lines: 0, bytes: 0 };
    current.files += 1;
    current.lines += file.lines;
    current.bytes += file.bytes;
    byCategory[file.category] = current;
  }

  return {
    schemaVersion: 1,
    branch: runGit(['branch', '--show-current']),
    head: runGit(['rev-parse', 'HEAD']),
    totals: {
      files: files.length,
      lines: files.reduce((sum, file) => sum + file.lines, 0),
      bytes: files.reduce((sum, file) => sum + file.bytes, 0)
    },
    byCategory,
    files
  };
}

const inventory = buildInventory();
const serialized = `${JSON.stringify(inventory, null, 2)}\n`;

if (process.argv.includes('--write')) {
  fs.writeFileSync(outputPath, serialized, 'utf8');
  process.stdout.write(`Inventario gravado em ${outputName}: ${inventory.totals.files} arquivos, ${inventory.totals.lines} linhas.\n`);
} else {
  process.stdout.write(serialized);
}
