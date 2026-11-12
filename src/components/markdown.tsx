import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 轻量 Markdown 渲染器：只生成 React 节点，不使用 innerHTML，避免 XSS。
 * 支持标题、段落、换行、粗体 / 斜体 / 删除线、行内代码、代码块、链接、图片、
 * 有序 / 无序列表、任务列表、引用、分割线与表格。
 */

const SAFE_HREF = /^(https?:\/\/|\/|mailto:)/i;

function safeHref(value: string): string | null {
  const v = value.trim();
  if (!v || /^(javascript|data|vbscript):/i.test(v)) return null;
  return SAFE_HREF.test(v) ? v : null;
}

const INLINE_SOURCE =
  "`(?<code>[^`\\n]+)`|!\\[(?<alt>[^\\]]*)\\]\\((?<img>[^)\\s]+)(?:\\s+\"[^\"]*\")?\\)|\\[(?<text>[^\\]]+)\\]\\((?<href>[^)\\s]+)(?:\\s+\"[^\"]*\")?\\)|\\*\\*(?<bold>[^*]+)\\*\\*|__(?<bold2>[^_]+)__|~~(?<strike>[^~]+)~~|\\*(?<em>[^*\\n]+)\\*|_(?<em2>[^_\\n]+)_";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const inline = new RegExp(INLINE_SOURCE, "g");
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = inline.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const g = match.groups ?? {};
    const key = `${keyPrefix}-${index++}`;
    if (g.code !== undefined) {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {g.code}
        </code>,
      );
    } else if (g.img !== undefined) {
      const href = safeHref(g.img);
      out.push(
        href ? (
          <img key={key} src={href} alt={g.alt ?? ""} loading="lazy" className="my-1 max-h-80 max-w-full rounded-lg border object-contain" />
        ) : (
          <span key={key}>{g.alt}</span>
        ),
      );
    } else if (g.href !== undefined) {
      const href = safeHref(g.href);
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 break-all">
            {renderInline(g.text ?? "", key)}
          </a>
        ) : (
          <span key={key}>{g.text}</span>
        ),
      );
    } else if (g.bold !== undefined || g.bold2 !== undefined) {
      out.push(<strong key={key}>{renderInline(g.bold ?? g.bold2 ?? "", key)}</strong>);
    } else if (g.strike !== undefined) {
      out.push(<del key={key}>{renderInline(g.strike, key)}</del>);
    } else if (g.em !== undefined || g.em2 !== undefined) {
      out.push(<em key={key}>{renderInline(g.em ?? g.em2 ?? "", key)}</em>);
    }
    last = inline.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING_CLASS = [
  "text-xl font-semibold tracking-tight",
  "text-lg font-semibold",
  "text-base font-semibold",
  "text-sm font-semibold",
  "text-sm font-semibold",
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
];

function Heading({ level, children }: { level: number; children: ReactNode }) {
  const className = HEADING_CLASS[level - 1] ?? HEADING_CLASS[2];
  switch (level) {
    case 1:
      return <h1 className={className}>{children}</h1>;
    case 2:
      return <h2 className={className}>{children}</h2>;
    case 3:
      return <h3 className={className}>{children}</h3>;
    case 4:
      return <h4 className={className}>{children}</h4>;
    case 5:
      return <h5 className={className}>{children}</h5>;
    default:
      return <h6 className={className}>{children}</h6>;
  }
}

function isTableSeparator(line: string): boolean {
  return line.includes("-") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line);
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  if (!line.trim()) return true;
  if (/^```/.test(line.trim())) return true;
  if (/^#{1,6}\s+/.test(line)) return true;
  if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) return true;
  if (/^\s*>\s?/.test(line)) return true;
  if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) return true;
  if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) return true;
  return false;
}

function parseBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = /^```([\w-]*)\s*$/.exec(line.trim());
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(
        <pre key={`b${key++}`} className="overflow-x-auto rounded-lg border bg-muted/70 p-3 font-mono text-xs leading-relaxed">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <Heading key={`b${key++}`} level={heading[1].length}>
          {renderInline(heading[2].replace(/\s+#+\s*$/, ""), `h${key}`)}
        </Heading>,
      );
      i++;
      continue;
    }

    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      blocks.push(<hr key={`b${key++}`} className="my-1 border-t" />);
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`b${key++}`} className="border-l-2 border-primary/40 pl-3 text-muted-foreground">
          {parseBlocks(quote.join("\n"))}
        </blockquote>,
      );
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        if (left && right) return "text-center";
        if (right) return "text-right";
        return "text-left";
      });
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={`b${key++}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th key={ci} className={cn("border px-2 py-1.5 font-medium", align[ci] ?? "text-left")}>
                    {renderInline(cell, `th${key}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {header.map((_, ci) => (
                    <td key={ci} className={cn("border px-2 py-1.5 align-top", align[ci] ?? "text-left")}>
                      {renderInline(row[ci] ?? "", `td${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listMatch = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items: { text: string; checked: boolean | null }[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered) {
          let text = m[3];
          let checked: boolean | null = null;
          const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
          if (task) {
            checked = task[1].toLowerCase() === "x";
            text = task[2];
          }
          items.push({ text, checked });
          i++;
          continue;
        }
        if (m) break;
        // 缩进续行归入上一项
        if (items.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1].text += `\n${lines[i].trim()}`;
          i++;
          continue;
        }
        break;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={`b${key++}`} className={cn("flex flex-col gap-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
          {items.map((item, ii) => (
            <li key={ii} className="leading-relaxed">
              {item.checked !== null ? (
                <span className="flex items-start gap-2">
                  <input type="checkbox" checked={item.checked} readOnly disabled className="mt-1 size-3.5 shrink-0 accent-primary" />
                  <span className={cn(item.checked && "text-muted-foreground line-through")}>{renderInline(item.text, `li${key}-${ii}`)}</span>
                </span>
              ) : (
                item.text.split("\n").map((part, pi) => (
                  <Fragment key={pi}>
                    {pi > 0 && <br />}
                    {renderInline(part, `li${key}-${ii}-${pi}`)}
                  </Fragment>
                ))
              )}
            </li>
          ))}
        </Tag>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && !isBlockStart(lines, i)) {
      paragraph.push(lines[i]);
      i++;
    }
    // 防止遇到无法识别的块时死循环
    if (!paragraph.length) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`b${key++}`} className="leading-relaxed text-pretty">
        {paragraph.map((part, pi) => (
          <Fragment key={pi}>
            {pi > 0 && <br />}
            {renderInline(part, `p${key}-${pi}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return blocks;
}

export function Markdown({ source, className }: { source?: string | null; className?: string }) {
  if (!source?.trim()) return null;
  return <div className={cn("flex min-w-0 flex-col gap-2 text-sm break-words", className)}>{parseBlocks(source)}</div>;
}
