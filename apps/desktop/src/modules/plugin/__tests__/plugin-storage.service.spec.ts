import { Test, TestingModule } from '@nestjs/testing';
import { PluginStorageService } from '../plugin-storage.service';

// ---------------------------------------------------------------------------
// Mock electron-store with the shared mock pattern
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

describe('PluginStorageService', () => {
  let service: PluginStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PluginStorageService],
    }).compile();

    service = module.get<PluginStorageService>(PluginStorageService);
  });

  // ================================================================
  // getStore
  // ================================================================
  describe('getStore', () => {
    it('should create a store with plugin-<id> naming', () => {
      const store = service.getStore('my-plugin');
      expect(store).toBeDefined();
      expect(store.path).toBeDefined();
    });

    it('should return the same cached instance on repeated calls', () => {
      const store1 = service.getStore('my-plugin');
      const store2 = service.getStore('my-plugin');
      expect(store1).toBe(store2);
    });

    it('should throw for invalid plugin ID with special characters', () => {
      expect(() => service.getStore('my_plugin')).toThrow(/Invalid plugin ID for storage/);
    });

    it('should throw for invalid plugin ID with uppercase', () => {
      expect(() => service.getStore('MyPlugin')).toThrow(/Invalid plugin ID for storage/);
    });

    it('should throw for invalid plugin ID with path traversal', () => {
      expect(() => service.getStore('../evil')).toThrow(/Invalid plugin ID for storage/);
    });

    it('should accept valid lowercase alphanumeric with hyphens', () => {
      expect(() => service.getStore('valid-plugin-123')).not.toThrow();
    });
  });

  // ================================================================
  // createStorageInterface
  // ================================================================
  describe('createStorageInterface', () => {
    it('should return an object with get, set, delete, has methods', () => {
      const iface = service.createStorageInterface('test-plugin');

      expect(typeof iface.get).toBe('function');
      expect(typeof iface.set).toBe('function');
      expect(typeof iface.delete).toBe('function');
      expect(typeof iface.has).toBe('function');
    });

    it('should set and get values through the interface', () => {
      const iface = service.createStorageInterface('test-plugin');

      iface.set('key', 'value');
      expect(iface.get('key')).toBe('value');
    });

    it('should return default value when key does not exist', () => {
      const iface = service.createStorageInterface('test-plugin');

      expect(iface.get('missing', 'default')).toBe('default');
    });

    it('should report has correctly', () => {
      const iface = service.createStorageInterface('test-plugin');

      expect(iface.has('key')).toBe(false);
      iface.set('key', 'val');
      expect(iface.has('key')).toBe(true);
    });

    it('should delete keys through the interface', () => {
      const iface = service.createStorageInterface('test-plugin');

      iface.set('key', 'val');
      iface.delete('key');
      expect(iface.has('key')).toBe(false);
    });
  });

  // ================================================================
  // clearStore
  // ================================================================
  describe('clearStore', () => {
    it('should clear store data and remove from cache', () => {
      const store = service.getStore('test-plugin');
      store.set('key', 'val');

      service.clearStore('test-plugin');

      // A new call should create a fresh store (not the cached one)
      const newStore = service.getStore('test-plugin');
      expect(newStore).not.toBe(store);
      expect(newStore.has('key')).toBe(false);
    });

    it('should be a no-op when plugin has no store', () => {
      // Should not throw
      expect(() => service.clearStore('nonexistent')).not.toThrow();
    });
  });
});
