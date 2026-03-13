import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Render Markdown content (including inline HTML) as styled React elements.
 *
 * Renders the provided Markdown string into a themed, typographic container; inline/raw HTML is allowed and will be sanitized before rendering.
 *
 * @param children - The Markdown source to render; may include inline/raw HTML which will be sanitized.
 * @param className - Optional additional CSS classes to merge with the component's default typography and layout styles.
 * @returns A React element containing the processed and styled Markdown content.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none',
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
        '[&_a]:text-primary [&_a]:no-underline [&_a]:hover:underline',
        // Blockquotes
        '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-foreground-muted [&_blockquote]:italic',
        // Tables
        '[&_table]:border-collapse [&_th]:text-foreground [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left',
        '[&_td]:text-foreground-secondary [&_td]:border-b [&_td]:border-border/50 [&_td]:px-3 [&_td]:py-1.5',
        // Horizontal rules
        '[&_hr]:border-border [&_hr]:my-4',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
