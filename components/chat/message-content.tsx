import type { ReactNode } from "react";

export type ChatMarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; language: string; text: string }
  | { type: "list"; ordered: boolean; items: string[]; start?: number }
  | { type: "separator" }
  | { type: "callout"; tone: "info" | "success" | "warning" | "error"; text: string }
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

function isSeparator(line: string) {
  return /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line);
}

// Both a bold label and a matching optional emoji are required. This is a
// presentation convention, never evidence that a claim has been verified.
function calloutTone(text: string) {
  const marker = text.match(/^(?:(✅|ℹ️?|⚠️?|❌)\s+)?\*\*(Confirmado|Informação|Atenção|Erro):\*\*(?:\s|$)/i);
  if (!marker) return null;
  const variants = {
    confirmado: { tone: "success", emoji: "✅" },
    informação: { tone: "info", emoji: "ℹ" },
    atenção: { tone: "warning", emoji: "⚠" },
    erro: { tone: "error", emoji: "❌" },
  } as const;
  const variant = variants[marker[2].toLocaleLowerCase("pt-BR") as keyof typeof variants];
  if (marker[1] && marker[1].replace(/\uFE0F/g, "") !== variant.emoji) return null;
  return variant.tone;
}

function isSpecialLine(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return (
    !line.trim() ||
    /^```/.test(line.trim()) ||
    /^#{1,6}\s+/.test(line) ||
    isSeparator(line) ||
    Boolean(calloutTone(line)) ||
    /^>\s?/.test(line) ||
    /^[-*+]\s+/.test(line) ||
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

    if (isSeparator(line)) {
      blocks.push({ type: "separator" });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
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
      const columnCount = Math.max(header.length, ...rows.map(row => row.length));
      while (header.length < columnCount) header.push("");
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      const pattern = isOrdered ? /^\d+\.\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].match(pattern);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const start = isOrdered ? Number.parseInt(line, 10) : 1;
      blocks.push({ type: "list", ordered: isOrdered, items, ...(start !== 1 ? { start } : {}) });
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
    const text = paragraph.join("\n");
    const tone = calloutTone(text);
    blocks.push(tone ? { type: "callout", tone, text } : { type: "paragraph", text });
  }

  return blocks;
}

function safeLink(url: string) {
  if (/[\s<>"]/.test(url) || [...url].some(char => char.charCodeAt(0) < 32)) return false;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function inlineContent(text: string, depth = 0): ReactNode[] {
  if (depth > 8) return [text];
  const tokens = text.split(/(\\[\\`*_\[\]()#!|>.-]|`[^`\n]+`|\*\*[^\n]+?\*\*|(?<![\p{L}\p{N}])__[^\n]+?__(?![\p{L}\p{N}])|\*[^*\n]+\*|(?<![\p{L}\p{N}])_[^_\n]+_(?![\p{L}\p{N}])|\[[^\]\n]+\]\(https?:\/\/(?:[^()\s]|\([^()\s]*\))+\))/giu);
  return tokens.filter(Boolean).map((token, index) => {
    if (/^\\[\\`*_\[\]()#!|>.-]$/.test(token)) return token.slice(1);
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index}>{token.slice(1, -1)}</code>;
    }
    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      return <strong key={index}>{inlineContent(token.slice(2, -2), depth + 1)}</strong>;
    }
    if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      return <em key={index}>{inlineContent(token.slice(1, -1), depth + 1)}</em>;
    }
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/.+)\)$/i);
    if (link && safeLink(link[2])) {
      return (
        <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">
          {inlineContent(link[1], depth + 1)}
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
          const Heading = block.level === 1 ? "h2" : block.level === 2 ? "h3" : block.level === 3 ? "h4" : block.level === 4 ? "h5" : "h6";
          return <Heading key={index}>{inlineContent(block.text)}</Heading>;
        }
        if (block.type === "separator") return <hr key={index} />;
        if (block.type === "callout") {
          return <p className={`chat-callout chat-callout--${block.tone}`} key={index}>{inlineContent(block.text)}</p>;
        }
        if (block.type === "code") {
          return (
            <div className="chat-code" key={index}>
              {block.language && <span>{block.language}</span>}
              <pre tabIndex={0} aria-label={block.language ? `Código ${block.language}` : "Bloco de código"}><code>{block.text}</code></pre>
            </div>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index} {...(block.ordered && block.start ? { start: block.start } : {})}>
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
            <div className="chat-table-wrap" tabIndex={0} role="region" aria-label="Tabela da resposta — role horizontalmente para ver todas as colunas" key={index}>
              <table>
                <thead><tr>{block.header.map((cell, cellIndex) => <th scope="col" key={cellIndex}>{inlineContent(cell)}</th>)}</tr></thead>
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
