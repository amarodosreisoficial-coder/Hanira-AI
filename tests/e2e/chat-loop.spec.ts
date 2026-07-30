import { expect, test } from "@playwright/test";

type RequestEntry = {
  method: string;
  url: string;
  status: number | null;
  resourceType: string;
  kind:
    | "rsc"
    | "conversation"
    | "chat"
    | "supabase"
    | "document"
    | "other";
};

type CookieSnapshot = {
  names: string[];
  count: number;
};

type PersistedChatState = {
  activeId: string | null;
  conversationIds: string[];
  conversationTitles: string[];
};

type BrowserCookie = {
  name: string;
};

function readPersistedChatState(): PersistedChatState {
  const raw = window.localStorage.getItem("hanira-chat");
  if (!raw) {
    return { activeId: null, conversationIds: [], conversationTitles: [] };
  }

  try {
    const parsed = JSON.parse(raw) as {
      state?: {
        activeId?: string | null;
        conversations?: Array<{ id: string; title: string }>;
      };
    };
    const conversations = parsed.state?.conversations ?? [];
    return {
      activeId: parsed.state?.activeId ?? null,
      conversationIds: conversations.map((conversation) => conversation.id),
      conversationTitles: conversations.map((conversation) => conversation.title),
    };
  } catch {
    return { activeId: null, conversationIds: [], conversationTitles: [] };
  }
}

function snapshotCookies(cookies: BrowserCookie[]): CookieSnapshot {
  const names = cookies
    .map((cookie) => cookie.name)
    .filter((name, index, list) => list.indexOf(name) === index)
    .sort();

  return {
    names,
    count: names.length,
  };
}

function classifyRequest(url: string, supabaseHost: string | null): RequestEntry["kind"] {
  if (url.includes("_rsc=")) return "rsc";

  const parsed = new URL(url);
  if (parsed.pathname.startsWith("/api/conversations")) return "conversation";
  if (parsed.pathname === "/api/chat") return "chat";
  if (parsed.pathname === "/chat" || parsed.pathname === "/login") return "document";
  if (supabaseHost && parsed.host === supabaseHost) return "supabase";
  return "other";
}

test("chat permanece estavel durante criacao e envio de conversa", async ({
  page,
  context,
}, testInfo) => {
  const isRealProject = testInfo.project.name === "chat-real";
  const expectedSessionKind = isRealProject ? "real" : "demo";
  const email = process.env.HANIRA_TEST_EMAIL;
  const password = process.env.HANIRA_TEST_PASSWORD;
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : null;

  if (isRealProject && (!email || !password)) {
    throw new Error(
      "chat-real exige HANIRA_TEST_EMAIL e HANIRA_TEST_PASSWORD configurados. O teste real nao usa fallback silencioso para demo.",
    );
  }

  const requestLog: RequestEntry[] = [];
  const frameNavigations: Array<{ url: string; at: number }> = [];
  const pageErrors: string[] = [];
  const consoleEvents: string[] = [];
  const clickedElements: Array<{ label: string; text: string }> = [];
  const cookieChanges: Array<{ phase: string; names: string[]; count: number }> = [];

  await page.addInitScript(() => {
    (window as typeof window & {
      __haniraE2E?: {
        composerAdded: number;
        composerRemoved: number;
        cookieSnapshots: Array<{ at: number; cookie: string }>;
      };
    }).__haniraE2E = {
      composerAdded: 0,
      composerRemoved: 0,
      cookieSnapshots: [],
    };

    const selector = 'textarea[aria-label="Mensagem para Hanira"]';
    const matchesComposer = (node: Node) =>
      node instanceof HTMLElement &&
      (node.matches(selector) || Boolean(node.querySelector(selector)));

    const observer = new MutationObserver((mutations) => {
      const monitor = (window as typeof window & {
        __haniraE2E?: {
          composerAdded: number;
          composerRemoved: number;
          cookieSnapshots: Array<{ at: number; cookie: string }>;
        };
      }).__haniraE2E;
      if (!monitor) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (matchesComposer(node)) monitor.composerAdded += 1;
        }
        for (const node of mutation.removedNodes) {
          if (matchesComposer(node)) monitor.composerRemoved += 1;
        }
      }
    });

    const startObserver = () => {
      observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", startObserver, { once: true });
    } else {
      startObserver();
    }

    window.setInterval(() => {
      const monitor = (window as typeof window & {
        __haniraE2E?: {
          composerAdded: number;
          composerRemoved: number;
          cookieSnapshots: Array<{ at: number; cookie: string }>;
        };
      }).__haniraE2E;
      monitor?.cookieSnapshots.push({
        at: Date.now(),
        cookie: document.cookie,
      });
    }, 500);
  });

  page.on("console", (message) => {
    consoleEvents.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      frameNavigations.push({ url: frame.url(), at: Date.now() });
    }
  });
  page.on("request", (request) => {
    requestLog.push({
      method: request.method(),
      url: request.url(),
      status: null,
      resourceType: request.resourceType(),
      kind: classifyRequest(request.url(), supabaseHost),
    });
  });
  page.on("response", (response) => {
    const entry = [...requestLog]
      .reverse()
      .find(
        (candidate) =>
          candidate.status === null &&
          candidate.method === response.request().method() &&
          candidate.url === response.url(),
      );
    if (entry) entry.status = response.status();
  });

  const beforeCookies = snapshotCookies(
    await context.cookies(testInfo.project.use.baseURL),
  );
  cookieChanges.push({ phase: "before", ...beforeCookies });

  if (isRealProject) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Que bom ter voce de volta.")).toBeVisible();

    const emailInput = page.getByRole("textbox", { name: "E-mail" });
    const passwordInput = page.locator('input[name="password"]');
    const loginButton = page.getByRole("button", { name: "Entrar" });

    await emailInput.fill(email ?? "");
    await passwordInput.fill(password ?? "");
    clickedElements.push({ label: "Entrar", text: "Entrar" });
    await loginButton.click();

    await page.waitForURL(/\/chat/, { timeout: 20_000 });
    await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();
    await expect(page.getByText("Visitante")).toHaveCount(0);
  } else {
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
  }

  const afterSessionCookies = snapshotCookies(
    await context.cookies(testInfo.project.use.baseURL),
  );
  cookieChanges.push({ phase: "after-session", ...afterSessionCookies });

  await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();

  const sessionKind = await page.evaluate(() => {
    const visitor = document.body.innerText.includes("Visitante");
    return visitor ? "demo" : "real";
  });
  expect(sessionKind).toBe(expectedSessionKind);

  const userLabel = await page
    .locator("aside")
    .locator("p.text-xs.text-zinc-300")
    .textContent()
    .catch(() => null);

  await page.goto("/chat");
  await page.waitForLoadState("networkidle");

  const initialState = await page.evaluate(readPersistedChatState);

  await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeDisabled();

  const newConversationButton = page
    .locator("aside")
    .getByRole("button", { name: "Nova conversa", exact: true });
  clickedElements.push({
    label: "Nova conversa",
    text: await newConversationButton.innerText(),
  });
  await newConversationButton.click();

  await expect
    .poll(async () => page.evaluate(readPersistedChatState), {
      message: "Nova conversa deve criar ou selecionar uma conversa",
    })
    .toMatchObject({
      activeId: expect.any(String),
      conversationIds: expect.arrayContaining(initialState.conversationIds),
    });

  const afterNewConversation = await page.evaluate(readPersistedChatState);
  expect(afterNewConversation.activeId).not.toBeNull();
  expect(afterNewConversation.activeId).not.toBe(initialState.activeId);
  expect(afterNewConversation.conversationIds.length).toBeGreaterThanOrEqual(
    initialState.conversationIds.length,
  );

  const message = `Teste E2E ${Date.now()} estabilidade do chat`;
  const composer = page.getByLabel("Mensagem para Hanira");
  clickedElements.push({
    label: "Mensagem para Hanira",
    text: (await composer.getAttribute("placeholder")) ?? "",
  });
  await composer.click();
  await composer.fill(message);

  const sendButton = page.getByRole("button", { name: "Enviar mensagem" });
  await expect(sendButton).toBeEnabled();

  const sendRequestCountBefore = requestLog.filter(
    (entry) => entry.kind === "chat" && entry.method === "POST",
  ).length;

  clickedElements.push({ label: "Enviar mensagem", text: "Enviar mensagem" });
  await sendButton.click();

  const userMessageBubble = page
    .locator("section")
    .getByText(message, { exact: true })
    .last();
  await expect(userMessageBubble).toBeVisible();

  await expect
    .poll(
      () =>
        requestLog.filter(
          (entry) => entry.kind === "chat" && entry.method === "POST",
        ).length,
      {
        message: "Deve ocorrer exatamente uma chamada de envio",
      },
    )
    .toBe(sendRequestCountBefore + 1);

  const chatRequests = requestLog.filter(
    (entry) => entry.kind === "chat" && entry.method === "POST",
  );
  const sendRequest = chatRequests.at(-1);
  expect(sendRequest).toBeDefined();
  expect((sendRequest?.status ?? 500) < 400).toBe(true);

  const preStabilityState = await page.evaluate(readPersistedChatState);
  const stabilitySamples: Array<{
    composerVisible: boolean;
    userMessageVisible: boolean;
    emptyStateVisible: boolean;
    activeId: string | null;
    path: string;
  }> = [];

  for (let index = 0; index < 20; index += 1) {
    stabilitySamples.push(
      await page.evaluate((userMessage) => {
        const textarea = document.querySelector(
          'textarea[aria-label="Mensagem para Hanira"]',
        );
        const emptyHeading = [...document.querySelectorAll("h1")].find((element) =>
          element.textContent?.includes("O que vamos descobrir hoje?"),
        );
        const state = (() => {
          const raw = window.localStorage.getItem("hanira-chat");
          if (!raw) return { activeId: null };
          try {
            const parsed = JSON.parse(raw) as { state?: { activeId?: string | null } };
            return { activeId: parsed.state?.activeId ?? null };
          } catch {
            return { activeId: null };
          }
        })();

        return {
          composerVisible:
            textarea instanceof HTMLElement &&
            textarea.offsetParent !== null,
          userMessageVisible: document.body.innerText.includes(userMessage),
          emptyStateVisible: Boolean(
            emptyHeading instanceof HTMLElement && emptyHeading.offsetParent !== null,
          ),
          activeId: state.activeId,
          path: window.location.pathname + window.location.search,
        };
      }, message),
    );
    await page.waitForTimeout(500);
  }

  const postStabilityState = await page.evaluate(readPersistedChatState);
  const afterSendCookies = snapshotCookies(
    await context.cookies(testInfo.project.use.baseURL),
  );
  cookieChanges.push({ phase: "after-send", ...afterSendCookies });

  const composerTransitions = stabilitySamples.reduce((count, sample, index, list) => {
    if (index === 0) return count;
    return count + Number(sample.composerVisible !== list[index - 1]?.composerVisible);
  }, 0);
  const userMessageTransitions = stabilitySamples.reduce((count, sample, index, list) => {
    if (index === 0) return count;
    return count + Number(sample.userMessageVisible !== list[index - 1]?.userMessageVisible);
  }, 0);
  const uniquePaths = [...new Set(stabilitySamples.map((sample) => sample.path))];
  const uniqueActiveIds = [
    ...new Set(stabilitySamples.map((sample) => sample.activeId).filter(Boolean)),
  ];
  const repeatedRequests = Object.entries(
    requestLog.reduce<Record<string, number>>((accumulator, entry) => {
      const key = `${entry.method} ${new URL(entry.url).pathname}`;
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count);

  const monitor = await page.evaluate(() => {
    return (
      (window as typeof window & {
        __haniraE2E?: {
          composerAdded: number;
          composerRemoved: number;
          cookieSnapshots: Array<{ at: number; cookie: string }>;
        };
      }).__haniraE2E ?? {
        composerAdded: 0,
        composerRemoved: 0,
        cookieSnapshots: [],
      }
    );
  });

  const relevantErrors = requestLog.filter(
    (entry) =>
      entry.status !== null &&
      entry.status >= 400 &&
      ["rsc", "conversation", "chat", "document", "supabase"].includes(entry.kind),
  );

  expect(pageErrors).toEqual([]);
  expect(relevantErrors).toEqual([]);
  expect(stabilitySamples.every((sample) => sample.composerVisible)).toBe(true);
  expect(stabilitySamples.every((sample) => sample.userMessageVisible)).toBe(true);
  expect(stabilitySamples.every((sample) => !sample.emptyStateVisible)).toBe(true);
  expect(composerTransitions).toBe(0);
  expect(userMessageTransitions).toBe(0);
  expect(uniquePaths).toEqual(["/chat"]);
  expect(uniqueActiveIds).toEqual([preStabilityState.activeId]);
  expect(postStabilityState.activeId).toBe(preStabilityState.activeId);
  expect(monitor.composerRemoved).toBe(0);

  const counts = {
    rscRequests: requestLog.filter((entry) => entry.kind === "rsc").length,
    conversationRequests: requestLog.filter((entry) => entry.kind === "conversation")
      .length,
    chatSendRequests: chatRequests.length,
    supabaseRequests: requestLog.filter((entry) => entry.kind === "supabase").length,
    mainFrameNavigations: frameNavigations.length,
    composerAdded: monitor.composerAdded,
    composerRemoved: monitor.composerRemoved,
  };

  console.log(
    JSON.stringify(
      {
        project: testInfo.project.name,
        sessionKind,
        userLabel,
        clickedElements,
        cookieChanges,
        initialState,
        afterNewConversation,
        preStabilityState,
        postStabilityState,
        sendRequest,
        counts,
        mainFrameNavigations: frameNavigations,
        repeatedRequests,
        relevantRequests: requestLog.filter((entry) =>
          ["rsc", "conversation", "chat", "document", "supabase"].includes(entry.kind),
        ),
        assertions: {
          newConversationChangedActiveId:
            afterNewConversation.activeId !== initialState.activeId,
          sendButtonEnabledAfterTyping: true,
          userMessageVisibleAfterSend: true,
          exactlyOneSendCall: chatRequests.length === sendRequestCountBefore + 1,
          no4xxOr5xxOnRelevantRequests: relevantErrors.length === 0,
          noRepeatedContentDisappear: composerTransitions === 0 && userMessageTransitions === 0,
          urlStable: uniquePaths.length === 1 && uniquePaths[0] === "/chat",
          conversationIdStable:
            uniqueActiveIds.length === 1 &&
            uniqueActiveIds[0] === afterNewConversation.activeId,
          stableAfter10Seconds: true,
        },
        consoleEvents,
      },
      null,
      2,
    ),
  );
});
