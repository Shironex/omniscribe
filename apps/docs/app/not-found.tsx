import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="mb-2 text-6xl font-bold text-fd-foreground">404</h1>
      <p className="mb-8 text-lg text-fd-muted-foreground">
        Page not found. The page you are looking for does not exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Link
          href="/"
          className="rounded-lg bg-fd-primary px-6 py-2.5 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
        >
          Go Home
        </Link>
        <Link
          href="/docs"
          className="rounded-lg border border-fd-border px-6 py-2.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
        >
          Browse Docs
        </Link>
      </div>
    </main>
  );
}
