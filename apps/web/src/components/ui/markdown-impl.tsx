/**
 * Markdown rendering implementation. Imported lazily by `markdown.tsx`
 * so the markdown parser graph (~140 KB gzip) never lands in the
 * eager bundle.
 */
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeSanitize];

interface MarkdownInnerProps {
  children: string;
}

export default function MarkdownInner({ children }: MarkdownInnerProps) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
      {children}
    </ReactMarkdown>
  );
}
