import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Lesson text. Raw HTML in the source is ignored (no stored XSS), dangerous
 * URL schemes are stripped by react-markdown, images are not rendered, and
 * links open in a new tab without referrer or opener.
 */
export function LessonMarkdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("prose-lesson", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </Markdown>
    </div>
  );
}
