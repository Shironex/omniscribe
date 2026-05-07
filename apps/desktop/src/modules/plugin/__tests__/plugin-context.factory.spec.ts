import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createPluginContext } from '../plugin-context.factory';
import { PluginStorageService } from '../plugin-storage.service';
import { ChangelogRegistryService } from '../../changelog/changelog-registry.service';

// ---------------------------------------------------------------------------
// Mock electron-store (required by PluginStorageService)
// ---------------------------------------------------------------------------
jest.mock('electron-store', () => {
  return {
    __esModule: true,
    default: class MockStore {
      private data: Map<string, unknown>;
      readonly path = '/mock/store/path.json';

      constructor(options?: { name?: string; defaults?: Record<string, unknown> }) {
        this.data = new Map();
        if (options?.defaults) {
          for (const [key, value] of Object.entries(options.defaults)) {
            this.data.set(key, JSON.parse(JSON.stringify(value)));
          }
        }
      }

      get(key: string, defaultValue?: unknown): unknown {
        if (this.data.has(key)) {
          return JSON.parse(JSON.stringify(this.data.get(key)));
        }
        return defaultValue;
      }

      set(key: string, value: unknown): void {
        this.data.set(key, JSON.parse(JSON.stringify(value)));
      }

      has(key: string): boolean {
        return this.data.has(key);
      }

      delete(key: string): void {
        this.data.delete(key);
      }

      clear(): void {
        this.data.clear();
      }
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPluginContext — registerCustomChangelogFetcher', () => {
  let storageService: PluginStorageService;
  let changelogRegistry: ChangelogRegistryService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PluginStorageService,
        ChangelogRegistryService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn(),
          },
        },
      ],
    }).compile();

    storageService = module.get(PluginStorageService);
    changelogRegistry = module.get(ChangelogRegistryService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should expose registerCustomChangelogFetcher on the context', () => {
    const context = createPluginContext(
      'test-plugin',
      eventEmitter,
      storageService,
      changelogRegistry
    );
    expect(typeof context.registerCustomChangelogFetcher).toBe('function');
  });

  it('should register the fetcher in ChangelogRegistryService', () => {
    const context = createPluginContext(
      'test-plugin',
      eventEmitter,
      storageService,
      changelogRegistry
    );

    const stubFetcher = jest.fn().mockResolvedValue([]);
    context.registerCustomChangelogFetcher('my-token', stubFetcher);

    expect(changelogRegistry.getCustomFetcher('my-token')).toBe(stubFetcher);
  });

  it('should return a Disposable that unregisters the fetcher', () => {
    const context = createPluginContext(
      'test-plugin',
      eventEmitter,
      storageService,
      changelogRegistry
    );

    const stubFetcher = jest.fn().mockResolvedValue([]);
    const disposable = context.registerCustomChangelogFetcher('my-token', stubFetcher);

    expect(changelogRegistry.getCustomFetcher('my-token')).toBe(stubFetcher);

    disposable.dispose();

    expect(changelogRegistry.getCustomFetcher('my-token')).toBeUndefined();
  });

  it('should unregister only the disposed token, leaving other fetchers intact', () => {
    const context = createPluginContext(
      'test-plugin',
      eventEmitter,
      storageService,
      changelogRegistry
    );

    const fetcherA = jest.fn().mockResolvedValue([]);
    const fetcherB = jest.fn().mockResolvedValue([]);

    const disposableA = context.registerCustomChangelogFetcher('token-a', fetcherA);
    context.registerCustomChangelogFetcher('token-b', fetcherB);

    disposableA.dispose();

    expect(changelogRegistry.getCustomFetcher('token-a')).toBeUndefined();
    expect(changelogRegistry.getCustomFetcher('token-b')).toBe(fetcherB);
  });
});
