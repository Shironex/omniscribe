describe('backend-port', () => {
  let getBackendPort: typeof import('./backend-port').getBackendPort;
  let setBackendPort: typeof import('./backend-port').setBackendPort;

  beforeEach(() => {
    jest.resetModules();
    const mod = require('./backend-port');
    getBackendPort = mod.getBackendPort;
    setBackendPort = mod.setBackendPort;
  });

  // ================================================================
  // getBackendPort
  // ================================================================
  describe('getBackendPort', () => {
    it('should throw when port has not been set', () => {
      expect(() => getBackendPort()).toThrow('Backend port not set yet');
    });

    it('should return the port after it has been set', () => {
      setBackendPort(3000);

      expect(getBackendPort()).toBe(3000);
    });
  });

  // ================================================================
  // setBackendPort
  // ================================================================
  describe('setBackendPort', () => {
    it('should set a valid port', () => {
      setBackendPort(8080);

      expect(getBackendPort()).toBe(8080);
    });

    it('should throw when port is already set', () => {
      setBackendPort(3000);

      expect(() => setBackendPort(4000)).toThrow('Backend port already set');
    });

    it('should accept minimum valid port (1)', () => {
      setBackendPort(1);

      expect(getBackendPort()).toBe(1);
    });

    it('should accept maximum valid port (65535)', () => {
      setBackendPort(65535);

      expect(getBackendPort()).toBe(65535);
    });

    it('should reject port 0', () => {
      expect(() => setBackendPort(0)).toThrow('Invalid backend port: 0');
    });

    it('should reject negative port', () => {
      expect(() => setBackendPort(-1)).toThrow('Invalid backend port: -1');
    });

    it('should reject port above 65535', () => {
      expect(() => setBackendPort(65536)).toThrow('Invalid backend port: 65536');
    });

    it('should reject non-integer port', () => {
      expect(() => setBackendPort(1.5)).toThrow('Invalid backend port: 1.5');
    });

    it('should reject NaN', () => {
      expect(() => setBackendPort(NaN)).toThrow('Invalid backend port: NaN');
    });

    it('should not modify state when validation fails', () => {
      expect(() => setBackendPort(0)).toThrow();

      // Port should still be unset
      expect(() => getBackendPort()).toThrow('Backend port not set yet');
    });
  });
});
