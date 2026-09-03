import type { ReactNode } from "react";

export type ChatMarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; language: string; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] };

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string) {
  const cells = tableCells(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")))
  );
}

function isSpecialLine(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return (
    !line.trim() ||
    /^```/.test(line.trim()) ||
    /^#{1,3}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    (line.includes("|") && isTableDivider(lines[index + 1] ?? ""))
  );
}

export function parseChatMarkdown(content: string): ChatMarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ChatMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.trim().match(/^```([\w-]*)/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence[1] ?? "", text: code.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] ?? "")) {
      const header = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      const pattern = isOrdered ? /^\d+\.\s+(.+)$/ : /^[-*]\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].match(pattern);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && !isSpecialLine(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

function inlineContent(text: string): ReactNode[] {
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g);
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index}>{token.slice(1, -1)}</code>;
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    }
    return token;
  });
}

export function MessageContent({ content }: { content: string }) {
  const blocks = parseChatMarkdown(content);

  return (
    <div className="chat-prose">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
          return <Heading key={index}>{inlineContent(block.text)}</Heading>;
        }
        if (block.type === "code") {
          return (
            <div className="chat-code" key={index}>
              {block.language && <span>{block.language}</span>}
              <pre><code>{block.text}</code></pre>
            </div>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inlineContent(item)}</li>
              ))}
            </List>
          );
        }
        if (block.type === "quote") {
          return <blockquote key={index}>{inlineContent(block.text)}</blockquote>;
        }
        if (block.type === "table") {
          return (
            <div className="chat-table-wrap" key={index}>
              <table>
                <thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}>{inlineContent(cell)}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.header.map((_, cellIndex) => <td key={cellIndex}>{inlineContent(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{inlineContent(block.text)}</p>;
      })}
    </div>
  );
}
