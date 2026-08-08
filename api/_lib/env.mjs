/**
 * Environment validation.
 *
 * Checking variables one at a time — as `requireEnv(a), requireEnv(b)` does —
 * only ever reports the first missing one, so configuring a fresh deployment
 * becomes a fix / redeploy / discover-the-next-one loop. These helpers report
 * everything that is missing in one pass.
 *
 * Names only. Values are never returned, logged, or included in errors.
 */

export class MissingEnvError extends Error {
  constructor(missing) {
    super(`Missing environment variable(s): ${missing.join(', ')}`);
    this.name = 'MissingEnvError';
    this.missing = missing;
  }
}

/** @returns {string[]} the names that are unset or empty, in the order given. */
export function missingEnv(names, env = process.env) {
  return names.filter((name) => {
    const value = env[name];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

/**
 * @throws {MissingEnvError} listing every missing name.
 * @returns {Record<string,string>} the requested values.
 */
export function requireEnv(names, env = process.env) {
  const missing = missingEnv(names, env);
  if (missing.length > 0) throw new MissingEnvError(missing);
  return Object.fromEntries(names.map((name) => [name, env[name]]));
}
