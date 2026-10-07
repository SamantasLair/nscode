const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const srcDir = path.resolve(__dirname, '..', 'src', 'workbench');
const destDir = path.resolve(__dirname, '..', 'dist', 'workbench');

fs.mkdirSync(destDir, { recursive: true });

function findPackageDir(pkgSubpath) {
  // Check local package node_modules first, then monorepo root node_modules
  const localPath = path.resolve(__dirname, '..', 'node_modules', pkgSubpath);
  if (fs.existsSync(localPath)) return localPath;
  const rootPath = path.resolve(rootDir, 'node_modules', pkgSubpath);
  if (fs.existsSync(rootPath)) return rootPath;
  return null;
}

const monacoMinVs = findPackageDir(path.join('monaco-editor', 'min', 'vs'));
const codiconsDist = findPackageDir(path.join('@vscode', 'codicons', 'dist'));

if (monacoMinVs) {
  const destVs = path.resolve(destDir, 'vs');
  fs.cpSync(monacoMinVs, destVs, { recursive: true });
  console.log('[copy-assets] Bundled monaco-editor min/vs to dist/workbench/vs');

  const srcVs = path.resolve(srcDir, 'vs');
  if (!fs.existsSync(srcVs)) {
    fs.cpSync(monacoMinVs, srcVs, { recursive: true });
    console.log('[copy-assets] Copied monaco-editor min/vs to src/workbench/vs for dev offline access');
  }
} else {
  console.warn('[copy-assets] monaco-editor min/vs not found in node_modules');
}

// Copy codicons dist directory to src and dist (skip .ts files)
if (codiconsDist) {
  const destCodicons = path.resolve(destDir, 'codicons');
  fs.cpSync(codiconsDist, destCodicons, {
    recursive: true,
    filter: (src) => !src.endsWith('.ts'),
  });
  console.log('[copy-assets] Bundled @vscode/codicons to dist/workbench/codicons');

  const srcCodicons = path.resolve(srcDir, 'codicons');
  if (!fs.existsSync(srcCodicons)) {
    fs.cpSync(codiconsDist, srcCodicons, {
      recursive: true,
      filter: (src) => !src.endsWith('.ts'),
    });
    console.log('[copy-assets] Copied @vscode/codicons to src/workbench/codicons for dev offline access');
  }
} else {
  console.warn('[copy-assets] @vscode/codicons dist not found in node_modules');
}

if (fs.existsSync(srcDir)) {
  fs.cpSync(srcDir, destDir, { recursive: true });
  console.log('[copy-assets] Copied workbench to dist/workbench');
} else {
  console.warn('[copy-assets] Source workbench directory not found:', srcDir);
}
