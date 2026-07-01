import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders assistant replies as formatted markdown (GFM tables, bold, lists, code),
// styled to match the chat. Kept compact so it reads like a message, not a document.
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="marker:text-muted-foreground">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="mt-3 mb-2 text-base font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-2 text-base font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="bg-muted rounded px-1 py-0.5 text-[0.85em]">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="bg-muted mb-2 overflow-x-auto rounded-lg p-3 text-xs last:mb-0">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b">{children}</thead>,
  th: ({ children }) => <th className="px-2.5 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => (
    <td className="border-border/60 border-t px-2.5 py-1.5 align-top">{children}</td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-primary/30 text-muted-foreground border-l-2 pl-3 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3" />,
};

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
