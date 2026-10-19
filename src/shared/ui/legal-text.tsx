import { parseLegalText } from "@/shared/lib/legal-text";
import { cn } from "@/shared/lib/utils";

/**
 * An approved legal text from the backend (SF-72), rendered from its
 * Markdown subset as React elements: headings, paragraphs and lists. The
 * text is never interpreted as HTML or links (no `dangerouslySetInnerHTML`).
 * `headingLevel` is the document level the text's `#` maps to.
 */
export function LegalText({
  text,
  headingLevel = 2,
  className,
}: {
  text: string;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {parseLegalText(text).map((block, index) => {
        if (block.kind === "heading") {
          const level = Math.min(headingLevel + block.level - 1, 4);
          const Tag = `h${level}` as "h2" | "h3" | "h4";
          return (
            <Tag
              key={index}
              className={block.level === 1 ? "type-title font-display" : "type-body font-extrabold"}
            >
              {block.text}
            </Tag>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={index} className="flex list-disc flex-col gap-1 ps-5 type-body-sm">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="type-body-sm">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
