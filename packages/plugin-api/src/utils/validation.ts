/**
 * Manifest Validation
 *
 * Validates a plugin manifest object (the `omniscribe` field in package.json).
 * Used during plugin discovery to reject malformed manifests with
 * descriptive error messages for debugging.
 */

import type { ManifestValidationResult } from '../types/manifest';

/** Valid plugin types */
const VALID_TYPES = ['provider', 'frontend', 'both'] as const;

/** Pattern for valid plugin IDs: lowercase alphanumeric with hyphens */
const ID_PATTERN = /^[a-z0-9-]+$/;

/** Pattern for valid semver strings (e.g., '1.0.0', '2.3.1-beta.1') */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+/;

/**
 * Validate a plugin manifest object.
 *
 * Checks that the manifest has all required fields with correct types and formats.
 * Returns all validation errors at once (not just the first one) to help
 * plugin authors fix multiple issues in a single pass.
 *
 * @param manifest - The manifest object to validate (typically from package.json `omniscribe` field)
 * @returns Validation result with `valid` flag and array of error messages
 *
 * @example
 * ```typescript
 * const result = validateManifest(pkg.omniscribe);
 * if (!result.valid) {
 *   console.error('Invalid plugin manifest:', result.errors);
 * }
 * ```
 */
export function validateManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];

  // Check non-null object
  if (manifest === null || manifest === undefined) {
    return { valid: false, errors: ['Manifest is required but got ' + String(manifest)] };
  }

  if (typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      valid: false,
      errors: ['Manifest must be an object but got ' + typeof manifest],
    };
  }

  const obj = manifest as Record<string, unknown>;

  // id: required, non-empty, matches pattern
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    errors.push('id is required and must be a non-empty string, got: ' + JSON.stringify(obj.id));
  } else if (!ID_PATTERN.test(obj.id)) {
    errors.push(
      `id must match /^[a-z0-9-]+$/ (lowercase alphanumeric with hyphens), got: "${obj.id}"`
    );
  }

  // type: must be 'provider' | 'frontend' | 'both'
  if (typeof obj.type !== 'string' || !(VALID_TYPES as readonly string[]).includes(obj.type)) {
    errors.push(`type must be one of ${VALID_TYPES.join(', ')}, got: ${JSON.stringify(obj.type)}`);
  }

  // displayName: required, non-empty
  if (typeof obj.displayName !== 'string' || obj.displayName.length === 0) {
    errors.push(
      'displayName is required and must be a non-empty string, got: ' +
        JSON.stringify(obj.displayName)
    );
  }

  // description: required, non-empty
  if (typeof obj.description !== 'string' || obj.description.length === 0) {
    errors.push(
      'description is required and must be a non-empty string, got: ' +
        JSON.stringify(obj.description)
    );
  }

  // icon: optional, but if provided must be string
  if (obj.icon !== undefined && typeof obj.icon !== 'string') {
    errors.push('icon must be a string if provided, got: ' + typeof obj.icon);
  }

  // version: required, non-empty, valid semver
  if (typeof obj.version !== 'string' || obj.version.length === 0) {
    errors.push(
      'version is required and must be a non-empty string, got: ' + JSON.stringify(obj.version)
    );
  } else if (!SEMVER_PATTERN.test(obj.version)) {
    errors.push(`version must be a valid semver string (e.g., '1.0.0'), got: "${obj.version}"`);
  }

  // apiVersion: optional, but if provided must be a valid semver string
  if (obj.apiVersion !== undefined) {
    if (typeof obj.apiVersion !== 'string' || obj.apiVersion.length === 0) {
      errors.push(
        'apiVersion must be a non-empty string if provided, got: ' + JSON.stringify(obj.apiVersion)
      );
    } else if (!SEMVER_PATTERN.test(obj.apiVersion)) {
      errors.push(
        `apiVersion must be a valid semver string (e.g., '1.0.0'), got: "${obj.apiVersion}"`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
