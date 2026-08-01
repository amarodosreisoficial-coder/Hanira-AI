import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

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

type LoginOutcome =
  | "submit-not-triggered"
  | "navigated-chat"
  | "form-error"
  | "auth-response-error"
  | "session-created"
  | "button-idle"
  | "session-inconclusive"
  | "timeout";

type LoginClassification = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

type SupabaseAuthProbe = {
  getSessionCalled: boolean;
  getUserCalled: boolean;
  sessionFound: boolean;
  userFound: boolean;
  userId: string | null;
  userEmailMatchesExpected: boolean;
  error: string | null;
};

type LoginDiagnostic = {
  outcome: LoginOutcome;
  classification: LoginClassification;
  classificationMessage: string;
  urlBeforeSubmit: string;
  finalUrl: string;
  authStatus: number | null;
  authEndpoint: string | null;
  uiErrorMessage: string | null;
  buttonEnteredLoading: boolean;
  buttonExitedLoading: boolean;
  sessionCreated: boolean;
  authCookiesAdded: boolean;
  redirectOccurred: boolean;
  sessionKind: "demo" | "real" | "unknown";
  authenticatedUser: boolean;
  submitTriggered: boolean;
  loginPostCount: number;
  loginPosts: Array<{ method: string; url: string; status: number | null }>;
  supabaseProbe: SupabaseAuthProbe;
  actionSuccessExplicit: boolean;
  envProbe: {
    variableNames: string[];
    supabaseUrlPresent: boolean;
    supabaseAnonKeyPresent: boolean;
    environment: "playwright-process";
  };
  appDiagnostics: {
    requested: boolean;
    status: number | null;
    authenticated: boolean | null;
    mode: string | null;
  };
  loginResponse: {
    contentType: string | null;
    relevantHeaders: Record<string, string | null>;
    bodySize: number | null;
    indicatesError: boolean;
    indicatesSuccess: boolean;
    indicatesRedirect: boolean;
    indicatesDigest: boolean;
    indicatesInvalidCredentials: boolean;
    indicatesEmailNotConfirmed: boolean;
  };
  screenshotPath: string;
};

type LoginResponseSummary = {
  contentType: string | null;
  relevantHeaders: Record<string, string | null>;
  bodySize: number | null;
  indicatesError: boolean;
  indicatesSuccess: boolean;
  indicatesRedirect: boolean;
  indicatesDigest: boolean;
  indicatesInvalidCredentials: boolean;
  indicatesEmailNotConfirmed: boolean;
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

function sanitizeText(value: string | null | undefined) {
  if (!value) return value ?? null;

  return value
    .replace(/(access[_-]?token|refresh[_-]?token|service[_-]?role[_-]?key|anon[_-]?key)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redacted]");
}

function sanitizeUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return rawUrl ?? null;

  try {
    const parsed = new URL(rawUrl);
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        /token|key|secret|code|access|refresh|authorization/i.test(key)
      ) {
        parsed.searchParams.set(key, "[redacted]");
      }
    }
    return parsed.toString();
  } catch {
    return sanitizeText(rawUrl);
  }
}

async function summarizeLoginResponse(page: Page) {
  const response = await page
    .waitForResponse(
      (candidate) => {
        try {
          const parsed = new URL(candidate.url());
          return (
            candidate.request().method() === "POST" && parsed.pathname === "/login"
          );
        } catch {
          return false;
        }
      },
      { timeout: 20_000 },
    )
    .catch(() => null);

  if (!response) return null;

  const contentType = await response.headerValue("content-type");
  const location = await response.headerValue("location");
  const xActionRedirect = await response.headerValue("x-action-redirect");
  const xNextjsRedirect = await response.headerValue("x-nextjs-redirect");
  const cacheControl = await response.headerValue("cache-control");
  const digestHeader = await response.headerValue("x-nextjs-postponed");
  const bodyText = sanitizeText(await response.text().catch(() => "")) ?? "";
  const normalizedBody = bodyText.toLocaleLowerCase("pt-BR");

  return {
    contentType,
    relevantHeaders: {
      location: sanitizeUrl(location),
      "x-action-redirect": sanitizeUrl(xActionRedirect),
      "x-nextjs-redirect": sanitizeUrl(xNextjsRedirect),
      "cache-control": cacheControl,
      "x-nextjs-postponed": digestHeader,
    },
    bodySize: bodyText.length,
    indicatesError:
      normalizedBody.includes("error") || normalizedBody.includes("role=\"alert\""),
    indicatesSuccess:
      normalizedBody.includes("/chat") ||
      Boolean(location) ||
      Boolean(xActionRedirect) ||
      Boolean(xNextjsRedirect),
    indicatesRedirect:
      Boolean(location) || Boolean(xActionRedirect) || Boolean(xNextjsRedirect),
    indicatesDigest:
      normalizedBody.includes("digest") || Boolean(digestHeader),
    indicatesInvalidCredentials:
      normalizedBody.includes("invalid login credentials") ||
      normalizedBody.includes("e-mail ou senha incorret"),
    indicatesEmailNotConfirmed:
      normalizedBody.includes("email not confirmed") ||
      normalizedBody.includes("confirme seu e-mail"),
  } satisfies LoginResponseSummary;
}

function classifyLoginResult(input: {
  authStatus: number | null;
  uiErrorMessage: string | null;
  sessionCreated: boolean;
  submitTriggered: boolean;
  sessionInconclusive: boolean;
  authenticatedUser: boolean;
  probeSessionFound: boolean;
  probeUserFound: boolean;
  authCookiesAdded: boolean;
  actionSuccessExplicit: boolean;
  loginPostCount: number;
  probeIncomplete: boolean;
  finalUrl: string;
}) {
  const message = (input.uiErrorMessage ?? "").toLocaleLowerCase("pt-BR");
  const onChat = /\/chat(?:\?|$)/.test(input.finalUrl);
  const hasExplicitAuthEvidence =
    input.authenticatedUser ||
    input.probeSessionFound ||
    input.probeUserFound ||
    input.authCookiesAdded ||
    input.actionSuccessExplicit;

  if (!input.submitTriggered) {
    return {
      classification: "G" as const,
      classificationMessage: "Submit do login nao foi disparado.",
    };
  }

  if (onChat) {
    return {
      classification: "F" as const,
      classificationMessage: "Navegação chegou em /chat.",
    };
  }

  if (
    message.includes("incorret") ||
    message.includes("inválid") ||
    message.includes("invalid")
  ) {
    return {
      classification: "A" as const,
      classificationMessage: "Credenciais de teste inválidas.",
    };
  }

  if (message.includes("confirme seu e-mail") || message.includes("confirm")) {
    return {
      classification: "B" as const,
      classificationMessage: "Usuário de teste ainda não confirmou o e-mail.",
    };
  }

  if (
    input.authStatus !== null &&
    input.authStatus >= 400 &&
    input.authStatus <= 599
  ) {
    return {
      classification: "C" as const,
      classificationMessage: `Autenticação respondeu com erro (${input.authStatus}).`,
    };
  }

  if (hasExplicitAuthEvidence && input.sessionCreated && !onChat) {
    return {
      classification: "E" as const,
      classificationMessage:
        "Sessão foi criada, mas a navegação permaneceu em /login. Investigar loginAction, redirect, router, middleware/proxy e revalidação.",
    };
  }

  if (
    input.sessionInconclusive ||
    (input.submitTriggered &&
      input.loginPostCount > 0 &&
      !hasExplicitAuthEvidence &&
      !message &&
      input.probeIncomplete)
  ) {
    return {
      classification: "H" as const,
      classificationMessage:
        "Sessao inconclusiva. O submit ocorreu, mas os sinais de autenticacao ficaram ambiguos.",
    };
  }

  if (!hasExplicitAuthEvidence) {
    return {
      classification: "H" as const,
      classificationMessage:
        "Sessao inconclusiva. O submit ocorreu, mas nao ha evidencia explicita de autenticacao bem-sucedida.",
    };
  }

  return {
    classification: "D" as const,
    classificationMessage:
      "Autenticação teve sucesso, mas nenhuma sessão persistiu. Investigar cookies e integração SSR do Supabase.",
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

async function detectSessionKind(page: Page) {
  return page.evaluate(() => {
    const visitor = document.body.innerText.includes("Visitante");
    return visitor ? "demo" : "real";
  });
}

async function probeSupabaseAuth(options: {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expectedEmail: string | undefined;
}): Promise<SupabaseAuthProbe> {
  const {
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    refreshToken,
    expectedEmail,
  } = options;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      getSessionCalled: false,
      getUserCalled: false,
      sessionFound: false,
      userFound: false,
      userId: null,
      userEmailMatchesExpected: false,
      error: null,
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    return {
      getSessionCalled: true,
      getUserCalled: true,
      sessionFound: Boolean(sessionData.session),
      userFound: Boolean(userData.user),
      userId: userData.user?.id ?? null,
      userEmailMatchesExpected:
        Boolean(expectedEmail) &&
        userData.user?.email?.toLocaleLowerCase("en-US") ===
          expectedEmail?.toLocaleLowerCase("en-US"),
      error: sanitizeText(sessionError?.message ?? userError?.message ?? null),
    };
  } catch (error) {
    return {
      getSessionCalled: true,
      getUserCalled: true,
      sessionFound: false,
      userFound: false,
      userId: null,
      userEmailMatchesExpected: false,
      error: sanitizeText(error instanceof Error ? error.message : String(error)),
    };
  }
}

async function waitForLoginResolution(input: {
  page: Page;
  context: BrowserContext;
  loginButton: Locator;
  errorMessage: Locator;
  cookieBaseline: CookieSnapshot;
  requestLog: RequestEntry[];
  screenshotPath: string;
  expectedEmail: string | undefined;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  loginResponseSummary: LoginResponseSummary | null;
}) {
  const {
    page,
    context,
    loginButton,
    errorMessage,
    cookieBaseline,
    requestLog,
    screenshotPath,
    expectedEmail,
    supabaseUrl,
    supabaseAnonKey,
    loginResponseSummary,
  } = input;

  const urlBeforeSubmit = page.url();
  let buttonEnteredLoading = false;
  let buttonExitedLoading = false;
  let outcome: LoginOutcome = "timeout";
  let uiErrorMessage: string | null = null;
  let submitTriggered = false;

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const [
      currentUrl,
      buttonText,
      buttonDisabled,
      cookies,
      visibleError,
      submitCount,
    ] =
      await Promise.all([
        page.url(),
        loginButton.textContent().catch(() => null),
        loginButton.isDisabled().catch(() => false),
        context.cookies(),
        errorMessage.isVisible().catch(() => false),
        page
          .evaluate(() => {
            return (
              (window as typeof window & {
                __haniraE2E?: { loginSubmitCount?: number };
              }).__haniraE2E?.loginSubmitCount ?? 0
            );
          })
          .catch(() => 0),
      ]);

    const normalizedButtonText = (buttonText ?? "").trim();
    const buttonLoading =
      buttonDisabled || normalizedButtonText.includes("Entrando");
    submitTriggered = submitCount > 0;

    if (buttonLoading) {
      buttonEnteredLoading = true;
    } else if (buttonEnteredLoading) {
      buttonExitedLoading = true;
    }

    if (!submitTriggered && buttonEnteredLoading && buttonExitedLoading) {
      outcome = "submit-not-triggered";
      break;
    }

    if (/\/chat(?:\?|$)/.test(currentUrl)) {
      outcome = "navigated-chat";
      break;
    }

    if (visibleError) {
      uiErrorMessage = sanitizeText(
        ((await errorMessage.textContent().catch(() => null)) ?? "").trim(),
      );
      outcome = "form-error";
      break;
    }

    const authResponses = requestLog.filter(
      (entry) =>
        entry.kind === "supabase" &&
        /\/auth\/v1\/(token|verify|user)/.test(new URL(entry.url).pathname) &&
        entry.status !== null,
    );
    const latestAuthResponse = authResponses.at(-1) ?? null;
    if (latestAuthResponse && latestAuthResponse.status! >= 400) {
      outcome = "auth-response-error";
      break;
    }

    const currentCookies = snapshotCookies(cookies);
    const authCookiesAdded =
      currentCookies.count > cookieBaseline.count ||
      currentCookies.names.some((name) => !cookieBaseline.names.includes(name));
    if (authCookiesAdded) {
      outcome = "session-created";
      break;
    }

    if (buttonEnteredLoading && buttonExitedLoading) {
      outcome = "button-idle";
      break;
    }

    await page.waitForTimeout(250);
  }

  const authResponses = requestLog.filter(
    (entry) =>
      entry.kind === "supabase" &&
      /\/auth\/v1\/(token|verify|user)/.test(new URL(entry.url).pathname) &&
      entry.status !== null,
  );
  const latestAuthResponse = authResponses.at(-1) ?? null;
  const loginPosts = requestLog
    .filter(
      (entry) =>
        entry.method === "POST" &&
        ((entry.kind === "supabase" &&
          /\/auth\/v1\/(token|verify|signup|recover|logout|user)/.test(
            new URL(entry.url).pathname,
          )) ||
          (entry.kind === "document" &&
            /\/login(?:\?|$)/.test(new URL(entry.url).pathname))),
    )
    .map((entry) => ({
      method: entry.method,
      url: sanitizeUrl(entry.url) ?? "",
      status: entry.status,
    }));
  const tokenResponse = latestAuthResponse
    ? await page
        .waitForResponse((response) => response.url() === latestAuthResponse?.url, {
          timeout: 1_000,
        })
        .then(async (response) => {
          try {
            return (await response.json()) as {
              access_token?: string;
              refresh_token?: string;
            };
          } catch {
            return null;
          }
        })
        .catch(() => null)
    : null;

  const [finalUrl, finalCookies, detectedSessionKind, finalSubmitCount] = await Promise.all([
    page.url(),
    context.cookies(),
    detectSessionKind(page).catch(() => "unknown" as const),
    page
      .evaluate(() => {
        return (
          (window as typeof window & {
            __haniraE2E?: { loginSubmitCount?: number };
          }).__haniraE2E?.loginSubmitCount ?? 0
        );
      })
      .catch(() => 0),
  ]);
  const finalCookieSnapshot = snapshotCookies(finalCookies);
  const authCookiesAdded =
    finalCookieSnapshot.count > cookieBaseline.count ||
    finalCookieSnapshot.names.some((name) => !cookieBaseline.names.includes(name));
  const redirectOccurred = sanitizeUrl(finalUrl) !== sanitizeUrl(urlBeforeSubmit);
  submitTriggered = finalSubmitCount > 0;
  const supabaseProbe = await probeSupabaseAuth({
    supabaseUrl,
    supabaseAnonKey,
    accessToken: tokenResponse?.access_token ?? null,
    refreshToken: tokenResponse?.refresh_token ?? null,
    expectedEmail,
  });
  const authenticatedUser = supabaseProbe.userFound && supabaseProbe.userEmailMatchesExpected;
  const sessionCreated = authCookiesAdded || supabaseProbe.sessionFound;
  const actionSuccessExplicit = Boolean(
    tokenResponse?.access_token ||
      tokenResponse?.refresh_token ||
      loginResponseSummary?.indicatesSuccess,
  );
  const probeIncomplete =
    !supabaseProbe.getSessionCalled || !supabaseProbe.getUserCalled;
  const appDiagnosticsResponse = await page.request
    .get("/api/system/diagnostics", {
      failOnStatusCode: false,
      headers: { "cache-control": "no-store" },
    })
    .catch(() => null);
  const appDiagnosticsJson = appDiagnosticsResponse
    ? await appDiagnosticsResponse.json().catch(() => null)
    : null;
  const sessionInconclusive =
    submitTriggered &&
    loginPosts.length > 0 &&
    !authenticatedUser &&
    !supabaseProbe.sessionFound &&
    !supabaseProbe.userFound &&
    !authCookiesAdded &&
    !actionSuccessExplicit &&
    (!uiErrorMessage || !uiErrorMessage.trim()) &&
    (probeIncomplete || latestAuthResponse?.status === null) &&
    !uiErrorMessage;

  if (outcome === "timeout" && sessionInconclusive) {
    outcome = "session-inconclusive";
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const classified = classifyLoginResult({
    authStatus: latestAuthResponse?.status ?? null,
    uiErrorMessage,
    sessionCreated,
    submitTriggered,
    sessionInconclusive,
    authenticatedUser,
    probeSessionFound: supabaseProbe.sessionFound,
    probeUserFound: supabaseProbe.userFound,
    authCookiesAdded,
    actionSuccessExplicit,
    loginPostCount: loginPosts.length,
    probeIncomplete,
    finalUrl,
  });

  if (
    classified.classification === "D" &&
    !(
      authenticatedUser ||
      supabaseProbe.sessionFound ||
      supabaseProbe.userFound ||
      authCookiesAdded ||
      actionSuccessExplicit
    )
  ) {
    throw new Error("Classificação D inválida: autenticação não confirmada.");
  }

  const diagnostic: LoginDiagnostic = {
    outcome,
    classification: classified.classification,
    classificationMessage: classified.classificationMessage,
    urlBeforeSubmit: sanitizeUrl(urlBeforeSubmit) ?? "",
    finalUrl: sanitizeUrl(finalUrl) ?? "",
    authStatus: latestAuthResponse?.status ?? null,
    authEndpoint: sanitizeUrl(latestAuthResponse?.url) ?? null,
    uiErrorMessage,
    buttonEnteredLoading,
    buttonExitedLoading,
    sessionCreated,
    authCookiesAdded,
    redirectOccurred,
    sessionKind: detectedSessionKind,
    authenticatedUser,
    submitTriggered,
    loginPostCount: loginPosts.length,
    loginPosts,
    supabaseProbe,
    actionSuccessExplicit,
    envProbe: {
      variableNames: [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ],
      supabaseUrlPresent: Boolean(supabaseUrl),
      supabaseAnonKeyPresent: Boolean(supabaseAnonKey),
      environment: "playwright-process",
    },
    appDiagnostics: {
      requested: Boolean(appDiagnosticsResponse),
      status: appDiagnosticsResponse?.status() ?? null,
      authenticated:
        typeof appDiagnosticsJson?.authenticated === "boolean"
          ? appDiagnosticsJson.authenticated
          : null,
      mode: typeof appDiagnosticsJson?.mode === "string" ? appDiagnosticsJson.mode : null,
    },
    loginResponse: loginResponseSummary ?? {
      contentType: null,
      relevantHeaders: {},
      bodySize: null,
      indicatesError: false,
      indicatesSuccess: false,
      indicatesRedirect: false,
      indicatesDigest: false,
      indicatesInvalidCredentials: false,
      indicatesEmailNotConfirmed: false,
    },
    screenshotPath,
  };

  return diagnostic;
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;

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
        loginSubmitCount: number;
      };
    }).__haniraE2E = {
      composerAdded: 0,
      composerRemoved: 0,
      cookieSnapshots: [],
      loginSubmitCount: 0,
    };

    window.localStorage.clear();
    window.sessionStorage.clear();

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
      document.addEventListener(
        "submit",
        () => {
          const monitor = (window as typeof window & {
            __haniraE2E?: { loginSubmitCount: number };
          }).__haniraE2E;
          if (monitor) monitor.loginSubmitCount += 1;
        },
        true,
      );
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

  await context.clearCookies();
  const beforeCookies = snapshotCookies(await context.cookies());
  cookieChanges.push({ phase: "before", ...beforeCookies });

  if (isRealProject) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload({ waitUntil: "networkidle" });

    if (page.url().includes("/chat")) {
      await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();
      await expect.poll(() => detectSessionKind(page)).toBe("real");
    } else {
      await page.waitForURL(/\/login(?:\?|$)/, { timeout: 20_000 });

      const emailInput = page.getByRole("textbox", { name: /e-mail/i });
      const passwordInput = page.locator('input[type="password"]');
      const loginButton = page.getByRole("button", {
        name: /entrar|continuar/i,
      });
      const formErrorMessage = page.getByRole("alert");

      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await expect(loginButton).toBeVisible();

      await emailInput.fill(email ?? "");
      await passwordInput.fill(password ?? "");
      clickedElements.push({
        label: "submit",
        text: (await loginButton.innerText()).trim(),
      });

      const cookieBaseline = snapshotCookies(await context.cookies());
      const loginResponseSummaryPromise = summarizeLoginResponse(page);
      await loginButton.click();

      const loginDiagnostic = await waitForLoginResolution({
        page,
        context,
        loginButton,
        errorMessage: formErrorMessage,
        cookieBaseline,
        requestLog,
        screenshotPath: testInfo.outputPath("chat-real-login-final.png"),
        expectedEmail: email,
        supabaseUrl,
        supabaseAnonKey,
        loginResponseSummary: await loginResponseSummaryPromise,
      });

      const relevantErrorsDuringLogin = requestLog
        .filter(
          (entry) =>
            entry.status !== null &&
            entry.status >= 400 &&
            ["supabase", "document"].includes(entry.kind),
        )
        .map((entry) => ({
          method: entry.method,
          url: sanitizeUrl(entry.url),
          status: entry.status,
          kind: entry.kind,
        }));

      console.log(
        JSON.stringify(
          {
            loginDiagnostic,
            consoleErrors: consoleEvents
              .filter((entry) => entry.startsWith("error:"))
              .map(sanitizeText),
            pageErrors: pageErrors.map(sanitizeText),
            relevantErrorsDuringLogin,
          },
          null,
          2,
        ),
      );

      if (loginDiagnostic.classification !== "F") {
        const authMessage =
          loginDiagnostic.classification === "C"
            ? `${loginDiagnostic.classificationMessage} ${loginDiagnostic.uiErrorMessage ?? ""}`.trim()
            : loginDiagnostic.classificationMessage;
        throw new Error(
          `${authMessage}\n${JSON.stringify(
            {
              loginDiagnostic,
              consoleErrors: consoleEvents
                .filter((entry) => entry.startsWith("error:"))
                .map(sanitizeText),
              pageErrors: pageErrors.map(sanitizeText),
              relevantErrorsDuringLogin,
            },
            null,
            2,
          )}`,
        );
      }

      await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();
      await expect.poll(() => detectSessionKind(page)).toBe("real");
    }
  } else {
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
  }

  const afterSessionCookies = snapshotCookies(
    await context.cookies(testInfo.project.use.baseURL),
  );
  cookieChanges.push({ phase: "after-session", ...afterSessionCookies });

  await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();

  const sessionKind = await detectSessionKind(page);
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
