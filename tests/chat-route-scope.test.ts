import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("chat route scope guards", () => {
  it("nao usa projectId cru do body", () => {
    const source = read("app/api/chat/route.ts");
    expect(source).not.toContain("payload.projectId");
  });

  it("replay continua preso a conversation_id e request_id", () => {
    const source = read("app/api/chat/route.ts");
    expect(source).toContain('.eq("conversation_id", conversationId)');
    expect(source).toContain('.eq("request_id", requestId)');
  });
});
