import { validateManifest } from '../utils/validation';

describe('validateManifest', () => {
  const validManifest = {
    id: 'my-plugin',
    type: 'provider',
    displayName: 'My Plugin',
    description: 'A test plugin',
  };

  it('returns valid for a correct manifest', () => {
    const result = validateManifest(validManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns valid with optional icon as string', () => {
    const result = validateManifest({ ...validManifest, icon: './icon.svg' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts all valid types', () => {
    for (const type of ['provider', 'frontend', 'both']) {
      const result = validateManifest({ ...validManifest, type });
      expect(result.valid).toBe(true);
    }
  });

  // Null / undefined / non-object
  it('rejects null manifest', () => {
    const result = validateManifest(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('null');
  });

  it('rejects undefined manifest', () => {
    const result = validateManifest(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('undefined');
  });

  it('rejects non-object manifest (string)', () => {
    const result = validateManifest('not-an-object');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be an object');
  });

  it('rejects array manifest', () => {
    const result = validateManifest([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be an object');
  });

  // Missing id
  it('rejects missing id', () => {
    const { id: _, ...noId } = validManifest;
    const result = validateManifest(noId);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('id is required'))).toBe(true);
  });

  // Invalid id format
  it('rejects invalid id format (uppercase)', () => {
    const result = validateManifest({ ...validManifest, id: 'MyPlugin' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('lowercase alphanumeric'))).toBe(true);
  });

  it('rejects invalid id format (spaces)', () => {
    const result = validateManifest({ ...validManifest, id: 'my plugin' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('lowercase alphanumeric'))).toBe(true);
  });

  it('rejects empty id', () => {
    const result = validateManifest({ ...validManifest, id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('id is required'))).toBe(true);
  });

  // Invalid type
  it('rejects invalid type', () => {
    const result = validateManifest({ ...validManifest, type: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('type must be one of'))).toBe(true);
  });

  it('rejects missing type', () => {
    const { type: _, ...noType } = validManifest;
    const result = validateManifest(noType);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('type must be one of'))).toBe(true);
  });

  // Missing displayName
  it('rejects missing displayName', () => {
    const { displayName: _, ...noDisplayName } = validManifest;
    const result = validateManifest(noDisplayName);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('displayName is required'))).toBe(true);
  });

  it('rejects empty displayName', () => {
    const result = validateManifest({ ...validManifest, displayName: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('displayName is required'))).toBe(true);
  });

  // Missing description
  it('rejects missing description', () => {
    const { description: _, ...noDescription } = validManifest;
    const result = validateManifest(noDescription);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('description is required'))).toBe(true);
  });

  it('rejects empty description', () => {
    const result = validateManifest({ ...validManifest, description: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('description is required'))).toBe(true);
  });

  // Non-string icon
  it('rejects non-string icon', () => {
    const result = validateManifest({ ...validManifest, icon: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('icon must be a string'))).toBe(true);
  });

  // Multiple errors at once
  it('reports multiple errors at once', () => {
    const result = validateManifest({});
    expect(result.valid).toBe(false);
    // Should have errors for id, type, displayName, description
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('includes bad values in error messages for debugging', () => {
    const result = validateManifest({
      id: 123,
      type: 'invalid',
      displayName: null,
      description: undefined,
    });
    expect(result.valid).toBe(false);
    // Check that bad values are included for debugging
    expect(result.errors.some(e => e.includes('123'))).toBe(true);
    expect(result.errors.some(e => e.includes('"invalid"'))).toBe(true);
  });
});
