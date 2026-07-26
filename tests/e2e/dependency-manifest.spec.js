/**
 * Regression tests for the `fuse.js` dependency bump (package.json / package-lock.json).
 *
 * These tests don't require a running Hugo server or a browser - they validate
 * that the dependency manifest (`package.json`) and the lockfile
 * (`package-lock.json`) are internally consistent for the `fuse.js` package,
 * guarding against lockfile drift, malformed URLs/integrity hashes, or an
 * accidental revert to the previous version.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
const packageLockPath = path.join(__dirname, '..', '..', 'package-lock.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

/**
 * Minimal caret-range (`^x.y.z`) satisfaction check, sufficient for the
 * ranges used in this project's dependencies. Avoids pulling in a `semver`
 * dependency just for these tests.
 */
function satisfiesCaretRange(version, range) {
  const match = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (!match) {
    throw new Error(`Unsupported range format: ${range}`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  const vMatch = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!vMatch) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  const [vMajor, vMinor, vPatch] = vMatch.slice(1).map(Number);

  if (vMajor !== major) return false;
  if (vMajor === 0) {
    // For 0.x, caret ranges only allow patch bumps within the same minor.
    if (vMinor !== minor) return false;
    return vPatch >= patch;
  }
  if (vMinor > minor) return true;
  if (vMinor < minor) return false;
  return vPatch >= patch;
}

test.describe('package.json - fuse.js dependency', () => {
  test('declares fuse.js with the expected caret range', () => {
    expect(packageJson.dependencies).toHaveProperty('fuse.js');
    expect(packageJson.dependencies['fuse.js']).toBe('^7.5.0');
  });

  test('does not still point at the previous 7.4.2 range', () => {
    expect(packageJson.dependencies['fuse.js']).not.toBe('^7.4.2');
  });

  test('other existing dependencies were left untouched by the bump', () => {
    expect(packageJson.dependencies).toMatchObject({
      dompurify: '^3.4.12',
      'node-gyp': '^13.0.1',
      playwright: '^1.60.0',
    });
  });
});

test.describe('package-lock.json - fuse.js entry', () => {
  test('root package declares the same fuse.js range as package.json', () => {
    const rootPackage = packageLock.packages[''];
    expect(rootPackage).toBeDefined();
    expect(rootPackage.dependencies['fuse.js']).toBe(packageJson.dependencies['fuse.js']);
  });

  test('node_modules/fuse.js is pinned to version 7.5.0', () => {
    const fuseEntry = packageLock.packages['node_modules/fuse.js'];
    expect(fuseEntry).toBeDefined();
    expect(fuseEntry.version).toBe('7.5.0');
  });

  test('resolved tarball URL matches the pinned version', () => {
    const fuseEntry = packageLock.packages['node_modules/fuse.js'];
    expect(fuseEntry.resolved).toBe(
      'https://registry.npmjs.org/fuse.js/-/fuse.js-7.5.0.tgz'
    );
    // The version embedded in the tarball filename must match the "version" field.
    expect(fuseEntry.resolved).toContain(`fuse.js-${fuseEntry.version}.tgz`);
  });

  test('integrity hash is present and well-formed', () => {
    const fuseEntry = packageLock.packages['node_modules/fuse.js'];
    expect(fuseEntry.integrity).toBe(
      'sha512-sQtrEfA+ez/3G0cCZecF70oqpCRttCexYUG4mUrtWL49ULUzUyxokt5kyqwtKzj1270RaKih+hcP3qLcumccow=='
    );
    expect(fuseEntry.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
  });

  test('pinned version satisfies the range declared in package.json', () => {
    const fuseEntry = packageLock.packages['node_modules/fuse.js'];
    const range = packageJson.dependencies['fuse.js'];
    expect(satisfiesCaretRange(fuseEntry.version, range)).toBe(true);
  });

  test('pinned version does not regress to the previous 7.4.2 release', () => {
    const fuseEntry = packageLock.packages['node_modules/fuse.js'];
    expect(fuseEntry.version).not.toBe('7.4.2');
  });

  test('license metadata for fuse.js is preserved', () => {
    const fuseEntry = packageLock.packages['node_modules/fuse.js'];
    expect(fuseEntry.license).toBe('Apache-2.0');
  });
});

test.describe('satisfiesCaretRange helper', () => {
  test('accepts an equal version', () => {
    expect(satisfiesCaretRange('7.5.0', '^7.5.0')).toBe(true);
  });

  test('accepts a higher patch/minor version within the same major', () => {
    expect(satisfiesCaretRange('7.6.1', '^7.5.0')).toBe(true);
  });

  test('rejects a lower version than the range floor', () => {
    expect(satisfiesCaretRange('7.4.2', '^7.5.0')).toBe(false);
  });

  test('rejects a different major version', () => {
    expect(satisfiesCaretRange('8.0.0', '^7.5.0')).toBe(false);
  });
});