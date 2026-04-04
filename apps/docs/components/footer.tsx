import Link from 'next/link';

const footerLinks = {
  Documentation: [
    { label: 'Getting Started', href: '/docs/getting-started/installation' },
    { label: 'Features', href: '/docs/features/multi-session-grid' },
    { label: 'Plugin SDK', href: '/docs/sdk/overview' },
    { label: 'API Reference', href: '/docs/api' },
  ],
  Download: [
    { label: 'Download App', href: '/download' },
    {
      label: 'Releases',
      href: 'https://github.com/Shironex/omniscribe/releases',
    },
    { label: 'Changelog', href: '/docs/changelog' },
  ],
  Community: [
    { label: 'GitHub', href: 'https://github.com/Shironex/omniscribe' },
    {
      label: 'Issues',
      href: 'https://github.com/Shironex/omniscribe/issues',
    },
  ],
};

export function Footer() {
  return (
    <footer className="mt-auto border-t border-fd-border bg-fd-card py-12">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(footerLinks).map(([heading, links]) => (
          <div key={heading}>
            <h3 className="mb-3 text-sm font-semibold text-fd-foreground">{heading}</h3>
            <ul className="space-y-2">
              {links.map(link => (
                <li key={link.href}>
                  {link.href.startsWith('http') ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-8 max-w-7xl border-t border-fd-border px-6 pt-6">
        <p className="text-sm text-fd-muted-foreground">
          &copy; {new Date().getFullYear()} Omniscribe. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
