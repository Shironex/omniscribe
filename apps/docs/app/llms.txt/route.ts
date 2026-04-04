import { source } from '@/lib/source';

const siteUrl = 'https://omniscribe.dev';

export function GET() {
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
