import { CodexUsageParserService } from '../services/usage-parser.service';
import type { CodexUsageData } from '../types';

describe('CodexUsageParserService', () => {
  let parser: CodexUsageParserService;

  beforeEach(() => {
    parser = new CodexUsageParserService();
  });

  // ================================================================
  // toProviderUsageData -- full data
  // ================================================================
  describe('toProviderUsageData with full data', () => {
    it('should map primary and secondary rate limits to metrics', () => {
      const now = Math.floor(Date.now() / 1000);
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 60,
            remaining: 40,
            usedPercent: 60,
            windowDurationMins: 60,
            resetsAt: now + 1800,
          },
          secondary: {
            limit: 50,
            used: 10,
            remaining: 40,
            usedPercent: 20,
            windowDurationMins: 1440,
            resetsAt: now + 3600,
          },
          planType: 'pro',
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics).toHaveLength(2);
      expect(result.lastUpdated).toBe('2026-02-18T00:00:00Z');

      // Primary metric
      const primary = result.metrics[0];
      expect(primary.name).toBe('Primary Rate Limit (Pro)');
      expect(primary.percentage).toBe(60);
      expect(primary.percentageType).toBe('used');
      expect(primary.category).toBe('rate-limit');
      expect(primary.resetTime).toBeDefined();
      expect(primary.resetText).toContain('Resets');

      // Secondary metric
      const secondary = result.metrics[1];
      expect(secondary.name).toBe('Secondary Rate Limit');
      expect(secondary.percentage).toBe(20);
      expect(secondary.percentageType).toBe('used');
      expect(secondary.category).toBe('rate-limit');
    });

    it('should include plan type label in primary metric name', () => {
      const now = Math.floor(Date.now() / 1000);
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 25,
            remaining: 75,
            usedPercent: 25,
            windowDurationMins: 60,
            resetsAt: now + 600,
          },
          planType: 'plus',
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].name).toBe('Primary Rate Limit (Plus)');
    });

    it('should omit plan label for unknown plan type', () => {
      const now = Math.floor(Date.now() / 1000);
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 25,
            remaining: 75,
            usedPercent: 25,
            windowDurationMins: 60,
            resetsAt: now + 600,
          },
          planType: 'unknown',
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].name).toBe('Primary Rate Limit');
    });
  });

  // ================================================================
  // toProviderUsageData -- primary only
  // ================================================================
  describe('toProviderUsageData with primary only', () => {
    it('should return single metric when only primary is present', () => {
      const now = Math.floor(Date.now() / 1000);
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 80,
            remaining: 20,
            usedPercent: 80,
            windowDurationMins: 60,
            resetsAt: now + 300,
          },
          planType: 'team',
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics).toHaveLength(1);
      expect(result.metrics[0].name).toBe('Primary Rate Limit (Team)');
    });
  });

  // ================================================================
  // toProviderUsageData -- empty data
  // ================================================================
  describe('toProviderUsageData with empty/minimal data', () => {
    it('should return empty metrics when no rate limits', () => {
      const data: CodexUsageData = {
        rateLimits: {
          planType: 'unknown',
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics).toHaveLength(0);
      expect(result.lastUpdated).toBe('2026-02-18T00:00:00Z');
    });

    it('should return empty metrics when rateLimits is null', () => {
      const data: CodexUsageData = {
        rateLimits: null,
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics).toHaveLength(0);
    });
  });

  // ================================================================
  // formatResetText -- various time ranges
  // ================================================================
  describe('reset text formatting', () => {
    it('should show "Reset pending" when reset is in the past', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 60;
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 100,
            remaining: 0,
            usedPercent: 100,
            windowDurationMins: 60,
            resetsAt: pastTime,
          },
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].resetText).toBe('Reset pending');
    });

    it('should show "Resets soon" when less than 60 seconds', () => {
      const soonTime = Math.floor(Date.now() / 1000) + 30;
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 50,
            remaining: 50,
            usedPercent: 50,
            windowDurationMins: 60,
            resetsAt: soonTime,
          },
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].resetText).toBe('Resets soon');
    });

    it('should show "Resets in X min" for minutes-only durations', () => {
      const minutesTime = Math.floor(Date.now() / 1000) + 5 * 60;
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 50,
            remaining: 50,
            usedPercent: 50,
            windowDurationMins: 60,
            resetsAt: minutesTime,
          },
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].resetText).toBe('Resets in 5 min');
    });

    it('should show "Resets in X hr" for hours-only durations', () => {
      const hoursTime = Math.floor(Date.now() / 1000) + 2 * 3600;
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 50,
            remaining: 50,
            usedPercent: 50,
            windowDurationMins: 60,
            resetsAt: hoursTime,
          },
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].resetText).toBe('Resets in 2 hr');
    });

    it('should show "Resets in X hr Y min" for combined durations', () => {
      const combinedTime = Math.floor(Date.now() / 1000) + 1 * 3600 + 30 * 60;
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 50,
            remaining: 50,
            usedPercent: 50,
            windowDurationMins: 60,
            resetsAt: combinedTime,
          },
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].resetText).toBe('Resets in 1 hr 30 min');
    });
  });

  // ================================================================
  // Plan type capitalization
  // ================================================================
  describe('plan type capitalization', () => {
    it('should capitalize "free" to "Free"', () => {
      const now = Math.floor(Date.now() / 1000);
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 10,
            used: 5,
            remaining: 5,
            usedPercent: 50,
            windowDurationMins: 60,
            resetsAt: now + 600,
          },
          planType: 'free',
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].name).toBe('Primary Rate Limit (Free)');
    });

    it('should capitalize "enterprise" to "Enterprise"', () => {
      const now = Math.floor(Date.now() / 1000);
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 1000,
            used: 100,
            remaining: 900,
            usedPercent: 10,
            windowDurationMins: 60,
            resetsAt: now + 600,
          },
          planType: 'enterprise',
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].name).toBe('Primary Rate Limit (Enterprise)');
    });

    it('should omit plan label when planType is undefined', () => {
      const now = Math.floor(Date.now() / 1000);
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 25,
            remaining: 75,
            usedPercent: 25,
            windowDurationMins: 60,
            resetsAt: now + 600,
          },
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      expect(result.metrics[0].name).toBe('Primary Rate Limit');
    });
  });

  // ================================================================
  // resetTime ISO format
  // ================================================================
  describe('resetTime ISO format', () => {
    it('should convert Unix timestamp to ISO string for resetTime', () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 600;
      const data: CodexUsageData = {
        rateLimits: {
          primary: {
            limit: 100,
            used: 50,
            remaining: 50,
            usedPercent: 50,
            windowDurationMins: 60,
            resetsAt: resetTimestamp,
          },
        },
        lastUpdated: '2026-02-18T00:00:00Z',
      };

      const result = parser.toProviderUsageData(data);

      const expectedIso = new Date(resetTimestamp * 1000).toISOString();
      expect(result.metrics[0].resetTime).toBe(expectedIso);
    });
  });
});
