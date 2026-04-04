import { headers } from 'next/headers';
import { source } from '@/lib/source';

export async function GET() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'omniscribe.dev';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const siteUrl = `${protocol}://${host}`;

  const pages = source.getPages();

  const lines = pages.map(page => `${page.data.title}: ${siteUrl}${page.url}`);

  const body = [
    '# Omniscribe',
    '',
    '> Orchestrate multiple AI coding sessions in parallel.',
    '',
    '## Documentation Pages',
    '',
    ...lines,
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
