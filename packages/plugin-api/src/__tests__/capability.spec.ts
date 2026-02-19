import { hasCapability, supportsOperation, getCapabilities } from '../utils/capability';
import type { AiProviderPlugin } from '../types/provider';
import type { ProviderCapabilities, SessionOperation } from '../types/capabilities';

function makeProviderPlugin(caps: Partial<ProviderCapabilities> = {}): AiProviderPlugin {
  const defaultCaps: ProviderCapabilities = {
    supportsMcp: false,
    supportsUsage: false,
    supportsSessionHistory: false,
    supportedOperations: new Set<SessionOperation>(),
    ...caps,
  };

  return {
    id: 'test-provider',
    type: 'provider',
    displayName: 'Test Provider',
    aiMode: 'test',
    activationEvents: [],
    capabilities: defaultCaps,
    detectCli: jest.fn(),
    buildLaunchCommand: jest.fn(),
    parseTerminalStatus: jest.fn(),
    activate: jest.fn().mockResolvedValue(undefined),
    deactivate: jest.fn().mockResolvedValue(undefined),
  };
}

describe('hasCapability', () => {
  it('returns true for boolean capability set to true', () => {
    const plugin = makeProviderPlugin({ supportsMcp: true });
    expect(hasCapability(plugin, 'supportsMcp')).toBe(true);
  });

  it('returns false for boolean capability set to false', () => {
    const plugin = makeProviderPlugin({ supportsMcp: false });
    expect(hasCapability(plugin, 'supportsMcp')).toBe(false);
  });

  it('returns true for non-empty Set capability', () => {
    const plugin = makeProviderPlugin({
      supportedOperations: new Set<SessionOperation>(['resume']),
    });
    expect(hasCapability(plugin, 'supportedOperations')).toBe(true);
  });

  it('returns false for empty Set capability', () => {
    const plugin = makeProviderPlugin({
      supportedOperations: new Set<SessionOperation>(),
    });
    expect(hasCapability(plugin, 'supportedOperations')).toBe(false);
  });

  it('checks each boolean capability independently', () => {
    const plugin = makeProviderPlugin({
      supportsMcp: true,
      supportsUsage: false,
      supportsSessionHistory: true,
    });
    expect(hasCapability(plugin, 'supportsMcp')).toBe(true);
    expect(hasCapability(plugin, 'supportsUsage')).toBe(false);
    expect(hasCapability(plugin, 'supportsSessionHistory')).toBe(true);
  });
});

describe('supportsOperation', () => {
  it('returns true when operation is in the set', () => {
    const plugin = makeProviderPlugin({
      supportedOperations: new Set<SessionOperation>(['resume', 'fork']),
    });
    expect(supportsOperation(plugin, 'resume')).toBe(true);
    expect(supportsOperation(plugin, 'fork')).toBe(true);
  });

  it('returns false when operation is not in the set', () => {
    const plugin = makeProviderPlugin({
      supportedOperations: new Set<SessionOperation>(['resume']),
    });
    expect(supportsOperation(plugin, 'fork')).toBe(false);
    expect(supportsOperation(plugin, 'continue')).toBe(false);
  });

  it('returns false for empty operations set', () => {
    const plugin = makeProviderPlugin({
      supportedOperations: new Set<SessionOperation>(),
    });
    expect(supportsOperation(plugin, 'resume')).toBe(false);
  });
});

describe('getCapabilities', () => {
  it('returns the plugin capabilities object', () => {
    const ops = new Set<SessionOperation>(['resume', 'fork', 'continue']);
    const plugin = makeProviderPlugin({
      supportsMcp: true,
      supportsUsage: true,
      supportsSessionHistory: true,
      supportedOperations: ops,
    });
    const caps = getCapabilities(plugin);
    expect(caps.supportsMcp).toBe(true);
    expect(caps.supportsUsage).toBe(true);
    expect(caps.supportsSessionHistory).toBe(true);
    expect(caps.supportedOperations).toBe(ops);
  });
});
