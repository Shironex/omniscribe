import { Injectable } from '@nestjs/common';
import { CDP_PORT, cdpEnabledForRuntime } from '../../../main/cdp';

/**
 * Thin wrapper around the CDP runtime helpers so capabilities can depend on
 * an injectable rather than directly importing electron. Reading
 * `app.isPackaged` lazily at call-time (via `require('electron')`) matches
 * how the rest of the desktop module treats electron and keeps the service
 * easy to mock in Jest (`jest.mock('electron', ...)`).
 */
@Injectable()
export class CdpInfoService {
  /**
   * True when CDP is enabled for the current runtime (dev mode or explicit
   * env override).
   */
  isEnabled(): boolean {
    const electron = require('electron') as { app?: { isPackaged?: boolean } };
    const isPackaged = Boolean(electron?.app?.isPackaged);
    return cdpEnabledForRuntime(isPackaged);
  }

  getPort(): number {
    return CDP_PORT;
  }

  getEndpoint(): string {
    return `http://127.0.0.1:${CDP_PORT}`;
  }
}
