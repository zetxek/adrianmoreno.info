/**
 * Dependency manifest consistency tests.
 *
 * These tests are version-agnostic — they contain no hardcoded package names
 * or version literals. Instead, they read `package.json` and `package-lock.json`
 * at repo root and verify, for every declared dependency:
 *
 *  1. The lockfile root package (`packages['']`) declares the exact same range
 *     string as `package.json` (no manifest drift).
 *  2. A `packages['node_modules/<name>']` entry exists in the lockfile.
 *  3. That entry's `version` satisfies the range declared in `package.json`
 *     (caret ranges `^x.y.z` and exact pins `x.y.z` are both supported).
 *  4. That entry has a non-empty `resolved` URL and `integrity` hash.
 *
 * Additionally, the reverse direction is checked: no dependency should appear
 * in the lockfile root that is absent from `package.json` (lockfile drift
 * without a corresponding manifest entry).
 *
 * These tests don't require a running Hugo server or a browser — they are pure
 * Node `fs`/JSON assertions and run in milliseconds.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
const packageLockPath = path.join(__dirname, '..', '..', 'package-lock.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

/**
 * Check whether a concrete version satisfies a semver range.
 *
 * Supports caret ranges (`^x.y.z`) and exact pins (`x.y.z`).
 * Avoids pulling in a `semver` dependency just for these tests.
 *
 * @param {string} version - concrete version, e.g. "7.5.0"
 * @param {string} range   - range string from package.json, e.g. "^7.5.0" or "7.5.0"
 * @returns {boolean}
 */
function satisfiesRange(version, range) {
  // Exact pin (no caret, no tilde, no comparator) — version must match exactly.
  if (/^\d+\.\d+\.\d+/.test(range)) {
    return version === range;
  }

  // Caret range ^x.y.z
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
    // For 0.0.x, caret ranges pin the exact version (semver: ^0.0.5 := =0.0.5).
    if (minor === 0) {
      return vMinor === 0 && vPatch === patch;
    }
    // For 0.x.y (x > 0), caret ranges only allow patch bumps within the same minor.
    if (vMinor !== minor) return false;
    return vPatch >= patch;
  }
  if (vMinor > minor) return true;
  if (vMinor < minor) return false;
  return vPatch >= patch;
}

// ---------------------------------------------------------------------------
// Collect all declared dependencies from package.json (runtime + dev).
// ---------------------------------------------------------------------------

const pkgDeps = {
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {}),
};
const pkgDepNames = Object.keys(pkgDeps);

// Lockfile root package entry.
const rootPkg = packageLock.packages[''];
const rootDeps = {
  ...(rootPkg.dependencies || {}),
  ...(rootPkg.devDependencies || {}),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('dependency manifest consistency', () => {
  test.describe('package.json ↔ package-lock.json root ranges', () => {
    for (const name of pkgDepNames) {
      test(`lockfile root declares the same range for "${name}"`, () => {
        expect(rootDeps).toHaveProperty([name]);
        expect(rootDeps[name]).toBe(pkgDeps[name]);
      });
    }
  });

  test.describe('lockfile node_modules entries', () => {
    for (const name of pkgDepNames) {
      const lockKey = `node_modules/${name}`;

      test(`"${name}" has a lockfile entry at ${lockKey}`, () => {
        expect(packageLock.packages[lockKey]).toBeDefined();
      });

      test(`"${name}" locked version satisfies the declared range`, () => {
        const entry = packageLock.packages[lockKey];
        expect(entry).toBeDefined();
        expect(satisfiesRange(entry.version, pkgDeps[name])).toBe(true);
      });

      test(`"${name}" has a non-empty resolved URL`, () => {
        const entry = packageLock.packages[lockKey];
        expect(entry).toBeDefined();
        expect(typeof entry.resolved).toBe('string');
        expect(entry.resolved.length).toBeGreaterThan(0);
      });

      test(`"${name}" has a non-empty integrity hash`, () => {
        const entry = packageLock.packages[lockKey];
        expect(entry).toBeDefined();
        expect(typeof entry.integrity).toBe('string');
        expect(entry.integrity.length).toBeGreaterThan(0);
      });
    }
  });

  test.describe('reverse drift: lockfile root ↔ package.json', () => {
    test('no lockfile root dependencies are absent from package.json', () => {
      const rootOnly = Object.keys(rootDeps).filter(
        (name) => !(name in pkgDeps)
      );
      expect(rootOnly).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Helper unit tests — keep the satisfiesRange helper honest.
// ---------------------------------------------------------------------------

test.describe('satisfiesRange helper', () => {
  test('caret: accepts an equal version', () => {
    expect(satisfiesRange('7.5.0', '^7.5.0')).toBe(true);
  });

  test('caret: accepts a higher patch version within the same minor', () => {
    expect(satisfiesRange('7.5.1', '^7.5.0')).toBe(true);
  });

  test('caret: accepts a higher minor version within the same major', () => {
    expect(satisfiesRange('7.6.0', '^7.5.0')).toBe(true);
  });

  test('caret: rejects a lower version than the range floor', () => {
    expect(satisfiesRange('7.4.9', '^7.5.0')).toBe(false);
  });

  test('caret: rejects a different major version', () => {
    expect(satisfiesRange('8.0.0', '^7.5.0')).toBe(false);
  });

  test('caret: for 0.x, rejects a different minor', () => {
    expect(satisfiesRange('0.2.0', '^0.1.5')).toBe(false);
  });

  test('caret: for 0.x, accepts a higher patch in same minor', () => {
    expect(satisfiesRange('0.1.9', '^0.1.5')).toBe(true);
  });

  test('caret: for 0.0.x, accepts only the exact version', () => {
    expect(satisfiesRange('0.0.5', '^0.0.5')).toBe(true);
  });

  test('caret: for 0.0.x, rejects a higher patch', () => {
    expect(satisfiesRange('0.0.6', '^0.0.5')).toBe(false);
  });

  test('caret: for 0.0.x, rejects a higher minor', () => {
    expect(satisfiesRange('0.1.0', '^0.0.5')).toBe(false);
  });

  test('exact pin: accepts a matching version', () => {
    expect(satisfiesRange('5.3.8', '5.3.8')).toBe(true);
  });

  test('exact pin: rejects a non-matching version', () => {
    expect(satisfiesRange('5.3.9', '5.3.8')).toBe(false);
  });
});
