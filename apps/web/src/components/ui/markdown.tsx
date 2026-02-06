import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Reusable Markdown component for rendering markdown and HTML content.
 * Supports raw HTML (from GitHub release notes) with sanitization.
 * Theme-aware styling that adapts to all predefined themes.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'prose prose-sm prose-invert max-w-none',
          // Headings
          '[&_h2]:text-lg [&_h2]:text-foreground [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2',
          '[&_h3]:text-base [&_h3]:text-foreground [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
          // Paragraphs
          '[&_p]:text-foreground-secondary [&_p]:leading-relaxed [&_p]:my-1',
          // Lists
          '[&_ul]:my-1 [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:pl-4',
          '[&_li]:text-foreground-secondary [&_li]:my-0.5',
          // Code
          '[&_code]:text-chart-2 [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm',
          // Strong
          '[&_strong]:text-foreground [&_strong]:font-semibold',
          // Links
          '[&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline',
          className
        )
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
