const fs = require('fs');
const path = require('path');

/**
 * Automatically inspects the release/ directory and removes obsolete installer/portable
 * binaries from previous versions to conserve disk space.
 */
function cleanLegacyReleases(options = {}) {
  const currentVersion = options.currentVersion || (() => {
    const pkgPath = options.pkgPath || path.resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  })();

  const currentProductName = options.currentProductName || (() => {
    try {
      const pkgPath = options.pkgPath || path.resolve(__dirname, '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.build?.productName || 'NSCode';
    } catch {
      return 'NSCode';
    }
  })();

  const releaseDir = options.releaseDir || path.resolve(__dirname, '..', 'release');

  if (!fs.existsSync(releaseDir)) {
    if (!options.silent) console.log('[auto-clean] Release directory does not exist, nothing to clean.');
    return { cleanedCount: 0, bytesFreed: 0, mbFreed: '0.00', cleanedFiles: [] };
  }

  const files = fs.readdirSync(releaseDir);
  let cleanedCount = 0;
  let bytesFreed = 0;
  const cleanedFiles = [];

  const versionRegex = /(\d+\.\d+\.\d+)/;

  for (const file of files) {
    const filePath = path.join(releaseDir, file);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      continue;
    }

    if (file.startsWith('__uninstaller') || file === 'builder-debug.yml') {
      try {
        bytesFreed += stat.size;
        fs.unlinkSync(filePath);
        cleanedCount++;
        cleanedFiles.push(file);
        if (!options.silent) console.log(`[auto-clean] Removed transient file: ${file} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
      } catch (err) {
        if (!options.silent) console.warn(`[auto-clean] Could not remove ${file}:`, err.message);
      }
      continue;
    }

    const isExeOrArtifact = file.endsWith('.exe') || file.endsWith('.blockmap');
    const match = file.match(versionRegex);

    if (isExeOrArtifact && match) {
      const fileVersion = match[1];
      const isOutdatedVersion = fileVersion !== currentVersion;
      const isOutdatedBrand = currentProductName && !file.startsWith(currentProductName);

      if (isOutdatedVersion || isOutdatedBrand) {
        try {
          bytesFreed += stat.size;
          fs.unlinkSync(filePath);
          cleanedCount++;
          cleanedFiles.push(file);
          const reason = isOutdatedBrand ? `legacy brand (${file.split(' ')[0]})` : `version ${fileVersion}`;
          if (!options.silent) console.log(`[auto-clean] Deleted ${reason} file: ${file} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
        } catch (err) {
          if (!options.silent) console.warn(`[auto-clean] Could not remove legacy file ${file}:`, err.message);
        }
      }
    }
  }

  const mbFreed = (bytesFreed / (1024 * 1024)).toFixed(2);
  if (!options.silent) {
    console.log(`[auto-clean] Done. Cleaned ${cleanedCount} legacy files. Storage freed: ${mbFreed} MB (Active version: ${currentVersion}).`);
  }
  return { cleanedCount, bytesFreed, mbFreed, cleanedFiles };
}

if (require.main === module) {
  cleanLegacyReleases();
}

module.exports = { cleanLegacyReleases };
