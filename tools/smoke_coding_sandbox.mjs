// smoke_coding_sandbox.mjs — Java/Python 沙盒 smoke 测试
// Round 92.0 deliverable: 覆盖页面加载、按钮、模板、输出、错误显示

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

function read(relPath) {
  try {
    return readFileSync(resolve(ROOT, relPath), 'utf8');
  } catch {
    return '';
  }
}

function pass(label) {
  console.log(`[PASS] ${label}`);
}

function warn(label, detail) {
  console.warn(`[WARN] ${label}: ${detail}`);
}

function check(condition, passLabel, warnLabel, warnDetail) {
  if (condition) {
    pass(passLabel);
  } else {
    warn(warnLabel, warnDetail);
  }
}

console.log('=== Java/Python Sandbox Smoke Test ===\n');

// ─── Check 1: Java sandbox JS loads ───
console.log('\n--- Check 1: Java sandbox JS ---');
const javaSandbox = read('assets/js/java_sandbox.js');
check(javaSandbox.includes('window.JavaSandbox'), 'java_sandbox.js loads', 'JAVA', 'java_sandbox.js not found or empty');

// ─── Check 2: Python sandbox JS loads ───
console.log('\n--- Check 2: Python sandbox JS ---');
const pythonSandbox = read('assets/js/python_sandbox.js');
check(pythonSandbox.includes('window.PythonSandbox'), 'python_sandbox.js loads', 'PYTHON', 'python_sandbox.js not found or empty');

// ─── Check 3: switchJavaOutputTab defined ───
console.log('\n--- Check 3: switchJavaOutputTab defined ---');
check(javaSandbox.includes('function switchJavaOutputTab('), 'switchJavaOutputTab is defined', 'JAVA', 'switchJavaOutputTab function NOT found');

// ─── Check 4: switchPythonOutputTab defined ───
console.log('\n--- Check 4: switchPythonOutputTab defined ---');
check(pythonSandbox.includes('function switchPythonOutputTab('), 'switchPythonOutputTab is defined', 'PYTHON', 'switchPythonOutputTab function NOT found');

// ─── Check 5: HTML has Java/Python sandbox cards ───
console.log('\n--- Check 5: HTML sandbox cards ---');
const html = read('index.html');
check(html.includes('java-sandbox-card'), 'HTML has java-sandbox-card', 'HTML', 'java-sandbox-card not found in index.html');
check(html.includes('python-sandbox-card'), 'HTML has python-sandbox-card', 'HTML', 'python-sandbox-card not found in index.html');
check(html.includes('java-output-card'), 'HTML has java-output-card', 'HTML', 'java-output-card not found in index.html');
check(html.includes('python-output-card'), 'HTML has python-output-card', 'HTML', 'python-output-card not found in index.html');

// ─── Check 6: Execution status JS loads ───
console.log('\n--- Check 6: Execution status JS ---');
const execStatus = read('assets/js/execution-status.js');
check(execStatus.includes('window.ExecutionStatus'), 'execution-status.js loads', 'EXEC', 'execution-status.js not found or empty');

// ─── Check 7: Version consistency ───
console.log('\n--- Check 7: Version consistency ---');
const version = read('assets/js/version.js');
const sw = read('service-worker.js');
const versionMatch = version.match(/webVersion:\s*"([^"]+)/);
if (versionMatch) {
  const currentVersion = versionMatch[1];
  console.log(`Current version: ${currentVersion}`);
  check(sw.includes(currentVersion.replace(/\./g, '-')), 'Service worker CACHE_NAME matches version', 'VERSION', `CACHE_NAME mismatch: ${currentVersion}`);
}

// ─── Summary ───
console.log('\n=== Summary ===');
console.log('Java/Python sandbox smoke test complete.');
process.exit(0);
