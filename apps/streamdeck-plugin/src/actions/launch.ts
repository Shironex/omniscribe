import streamDeck, { action, KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { spawn } from 'node:child_process';

type Provider = 'claude' | 'codex' | 'plain';

type LaunchSettings = {
  projectPath?: string;
  provider?: Provider;
  [key: string]: string | undefined;
};

@action({ UUID: 'com.taketach.omniscribe.launch' })
export class LaunchOmniscribe extends SingletonAction<LaunchSettings> {
  override async onKeyDown(ev: KeyDownEvent<LaunchSettings>): Promise<void> {
    const settings = ev.payload.settings ?? {};
    const projectPath = settings.projectPath?.trim();
    // The PI's <sdpi-select default="claude"> only writes to settings once the
    // user actively touches it. Default in code too so a freshly-dragged button
    // works without opening the inspector.
    const provider: Provider = settings.provider ?? 'claude';

    if (!projectPath) {
      streamDeck.logger.warn('LaunchOmniscribe: missing projectPath');
      await ev.action.showAlert();
      return;
    }

    const url = buildUrl({ projectPath, provider });
    streamDeck.logger.info(`LaunchOmniscribe: opening ${url}`);

    try {
      openUrl(url);
      await ev.action.showOk();
    } catch (error) {
      streamDeck.logger.error('LaunchOmniscribe: failed to open URL', error);
      await ev.action.showAlert();
    }
  }
}

function buildUrl(input: { projectPath: string; provider: Provider }): string {
  const params = new URLSearchParams({
    project: input.projectPath,
    provider: input.provider,
  });
  return `omniscribe://run?${params.toString()}`;
}

function openUrl(url: string): void {
  if (process.platform === 'win32') {
    // Avoid `cmd /c start` — cmd re-parses the URL and treats `&` as a command
    // separator, dropping every query param after the first one. rundll32
    // hands the URL straight to the Windows protocol handler.
    spawn('rundll32', ['url.dll,FileProtocolHandler', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }

  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  // Linux / other — best-effort xdg-open
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}
