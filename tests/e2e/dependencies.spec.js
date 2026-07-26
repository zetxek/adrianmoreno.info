const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
const packageLockPath = path.join(__dirname, '..', '..', 'package-lock.json');
const installedFusePkgPath = path.join(__dirname, '..', '..', 'node_modules', 'fuse.js', 'package.json');

test.describe('fuse.js dependency manifest (package.json / package-lock.json)', () => {
  let packageJson;
  let packageLock;

  test.beforeAll(() => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  });

  test('package.json declares fuse.js with the expected semver range', () => {
    // Array form: a plain 'fuse.js' string would be parsed as the nested
    // path dependencies.fuse.js instead of the literal key "fuse.js".
    expect(packageJson.dependencies).toHaveProperty(['fuse.js'], '^7.5.0');
  });

  test('package-lock.json root entry mirrors the range declared in package.json', () => {
    const rootEntry = packageLock.packages[''];
    expect(rootEntry.dependencies['fuse.js']).toBe(packageJson.dependencies['fuse.js']);
  });

  test('package-lock.json pins fuse.js to a resolvable 7.5.0 registry tarball', () => {
    const lockEntry = packageLock.packages['node_modules/fuse.js'];

    expect(lockEntry).toBeDefined();
    expect(lockEntry.version).toBe('7.5.0');
    expect(lockEntry.resolved).toBe('https://registry.npmjs.org/fuse.js/-/fuse.js-7.5.0.tgz');
    expect(lockEntry.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
  });

  test('locked fuse.js version satisfies the caret range declared in package.json', () => {
    const range = packageJson.dependencies['fuse.js']; // e.g. "^7.5.0"
    const lockedVersion = packageLock.packages['node_modules/fuse.js'].version;

    const [rangeMajor, rangeMinor, rangePatch] = range.replace('^', '').split('.').map(Number);
    const [major, minor, patch] = lockedVersion.split('.').map(Number);

    // A caret range requires the same major version, and a minor.patch
    // combination that is greater than or equal to the one declared.
    expect(major).toBe(rangeMajor);
    expect(minor > rangeMinor || (minor === rangeMinor && patch >= rangePatch)).toBe(true);
  });

  test('locked fuse.js version is not a downgrade from the previous pinned release (7.4.2)', () => {
    const lockedVersion = packageLock.packages['node_modules/fuse.js'].version;
    const [major, minor, patch] = lockedVersion.split('.').map(Number);
    const previous = { major: 7, minor: 4, patch: 2 };

    const isNewerOrEqual =
      major > previous.major ||
      (major === previous.major && minor > previous.minor) ||
      (major === previous.major && minor === previous.minor && patch >= previous.patch);

    expect(isNewerOrEqual).toBe(true);
    expect(lockedVersion).not.toBe('7.4.2');
  });
});

test.describe('fuse.js module (installed package)', () => {
  let Fuse;

  test.beforeAll(() => {
    // Guard the require so a missing/uninstalled node_modules tree does not
    // crash test collection for this whole file; individual tests below
    // skip themselves when the module could not be loaded.
    try {
      Fuse = require('fuse.js');
    } catch (err) {
      Fuse = null;
    }
  });

  test('resolves to a constructor function', () => {
    test.skip(!Fuse, 'fuse.js is not installed in node_modules');

    expect(typeof Fuse).toBe('function');
  });

  test('installed package version matches the version pinned in package-lock.json', () => {
    test.skip(!Fuse, 'fuse.js is not installed in node_modules');
    test.skip(!fs.existsSync(installedFusePkgPath), 'fuse.js package.json not found in node_modules');

    const installedPkg = JSON.parse(fs.readFileSync(installedFusePkgPath, 'utf8'));
    expect(installedPkg.version).toBe('7.5.0');
  });

  test('performs a basic fuzzy search and returns the best match first', () => {
    test.skip(!Fuse, 'fuse.js is not installed in node_modules');

    const list = [
      { title: "Old Man's War", author: 'John Scalzi' },
      { title: 'The Lock Artist', author: 'Steve Hamilton' },
      { title: 'HTML5', author: 'Remy Sharp' },
    ];
    const fuse = new Fuse(list, { keys: ['title', 'author'] });

    const results = fuse.search('Scalzi');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.author).toBe('John Scalzi');
  });

  test('returns an empty array when nothing matches within the threshold', () => {
    test.skip(!Fuse, 'fuse.js is not installed in node_modules');

    const list = [{ title: "Old Man's War" }, { title: 'HTML5' }];
    const fuse = new Fuse(list, { keys: ['title'], threshold: 0.1 });

    const results = fuse.search('zzzzzzzzzzzzzzz-not-in-list');

    expect(results).toEqual([]);
  });

  test('returns an empty array when searching an empty list', () => {
    test.skip(!Fuse, 'fuse.js is not installed in node_modules');

    const fuse = new Fuse([], { keys: ['title'] });

    expect(fuse.search('anything')).toEqual([]);
  });
});