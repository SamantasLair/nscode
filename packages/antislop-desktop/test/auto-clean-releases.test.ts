import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Import CommonJS module
const { cleanLegacyReleases } = require('../scripts/clean-legacy-releases.js');

describe('Auto-Clean Legacy Releases Suite', () => {
  let tempReleaseDir: string;

  beforeEach(() => {
    tempReleaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antislop-release-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempReleaseDir)) {
      fs.rmSync(tempReleaseDir, { recursive: true, force: true });
    }
  });

  it('gracefully handles missing release directory', () => {
    const nonExistentDir = path.join(tempReleaseDir, 'does-not-exist');
    const result = cleanLegacyReleases({
      releaseDir: nonExistentDir,
      currentVersion: '0.1.1',
      silent: true,
    });

    expect(result.cleanedCount).toBe(0);
    expect(result.bytesFreed).toBe(0);
    expect(result.cleanedFiles).toEqual([]);
  });

  it('prunes older version executables and blockmaps while preserving active version', () => {
    // Mock legacy files
    fs.writeFileSync(path.join(tempReleaseDir, 'NSCode 0.1.0.exe'), 'dummy-exe-010');
    fs.writeFileSync(path.join(tempReleaseDir, 'NSCode Setup 0.1.0.exe'), 'dummy-setup-010');
    fs.writeFileSync(path.join(tempReleaseDir, 'NSCode Setup 0.1.0.exe.blockmap'), 'dummy-blockmap-010');

    // Mock active files
    fs.writeFileSync(path.join(tempReleaseDir, 'NSCode 0.1.1.exe'), 'dummy-exe-011');
    fs.writeFileSync(path.join(tempReleaseDir, 'NSCode Setup 0.1.1.exe'), 'dummy-setup-011');
    fs.writeFileSync(path.join(tempReleaseDir, 'NSCode Setup 0.1.1.exe.blockmap'), 'dummy-blockmap-011');

    // Mock directory
    fs.mkdirSync(path.join(tempReleaseDir, 'win-unpacked'));

    const result = cleanLegacyReleases({
      releaseDir: tempReleaseDir,
      currentVersion: '0.1.1',
      silent: true,
    });

    expect(result.cleanedCount).toBe(3);
    expect(result.cleanedFiles).toContain('NSCode 0.1.0.exe');
    expect(result.cleanedFiles).toContain('NSCode Setup 0.1.0.exe');
    expect(result.cleanedFiles).toContain('NSCode Setup 0.1.0.exe.blockmap');

    // Verify disk state
    expect(fs.existsSync(path.join(tempReleaseDir, 'NSCode 0.1.0.exe'))).toBe(false);
    expect(fs.existsSync(path.join(tempReleaseDir, 'NSCode Setup 0.1.0.exe'))).toBe(false);
    expect(fs.existsSync(path.join(tempReleaseDir, 'NSCode 0.1.1.exe'))).toBe(true);
    expect(fs.existsSync(path.join(tempReleaseDir, 'NSCode Setup 0.1.1.exe'))).toBe(true);
    expect(fs.existsSync(path.join(tempReleaseDir, 'win-unpacked'))).toBe(true);
  });

  it('removes transient installer debug and uninstaller artifacts', () => {
    fs.writeFileSync(path.join(tempReleaseDir, '__uninstaller-nsis-temp.exe'), 'uninstaller');
    fs.writeFileSync(path.join(tempReleaseDir, 'builder-debug.yml'), 'debug: true');
    fs.writeFileSync(path.join(tempReleaseDir, 'NSCode 0.1.1.exe'), 'active-version');

    const result = cleanLegacyReleases({
      releaseDir: tempReleaseDir,
      currentVersion: '0.1.1',
      silent: true,
    });

    expect(result.cleanedCount).toBe(2);
    expect(result.cleanedFiles).toContain('__uninstaller-nsis-temp.exe');
    expect(result.cleanedFiles).toContain('builder-debug.yml');

    expect(fs.existsSync(path.join(tempReleaseDir, '__uninstaller-nsis-temp.exe'))).toBe(false);
    expect(fs.existsSync(path.join(tempReleaseDir, 'builder-debug.yml'))).toBe(false);
    expect(fs.existsSync(path.join(tempReleaseDir, 'NSCode 0.1.1.exe'))).toBe(true);
  });
});
