# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-loop.spec.ts >> chat permanece estavel durante criacao e envio de conversa
- Location: tests\e2e\chat-loop.spec.ts:79:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Que bom ter voce de volta.')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Que bom ter voce de volta.')

```

```yaml
- main:
  - link "Voltar":
    - /url: /
  - text: Hanira
  - heading "Que bom ter você de volta." [level=1]
  - paragraph: Entre para continuar sua conversa com Hanira.
  - text: E-mail
  - textbox "E-mail":
    - /placeholder: voce@exemplo.com
  - text: Senha
  - textbox "Senha Mostrar senha":
    - /placeholder: Sua senha
  - button "Mostrar senha"
  - link "Esqueci minha senha":
    - /url: /esqueci-a-senha
  - button "Entrar"
  - paragraph:
    - text: Ainda não tem conta?
    - link "Criar conta":
      - /url: /cadastro
- alert
```

# Test source

```ts
  107 |         composerAdded: number;
  108 |         composerRemoved: number;
  109 |         cookieSnapshots: Array<{ at: number; cookie: string }>;
  110 |       };
  111 |     }).__haniraE2E = {
  112 |       composerAdded: 0,
  113 |       composerRemoved: 0,
  114 |       cookieSnapshots: [],
  115 |     };
  116 | 
  117 |     const selector = 'textarea[aria-label="Mensagem para Hanira"]';
  118 |     const matchesComposer = (node: Node) =>
  119 |       node instanceof HTMLElement &&
  120 |       (node.matches(selector) || Boolean(node.querySelector(selector)));
  121 | 
  122 |     const observer = new MutationObserver((mutations) => {
  123 |       const monitor = (window as typeof window & {
  124 |         __haniraE2E?: {
  125 |           composerAdded: number;
  126 |           composerRemoved: number;
  127 |           cookieSnapshots: Array<{ at: number; cookie: string }>;
  128 |         };
  129 |       }).__haniraE2E;
  130 |       if (!monitor) return;
  131 | 
  132 |       for (const mutation of mutations) {
  133 |         for (const node of mutation.addedNodes) {
  134 |           if (matchesComposer(node)) monitor.composerAdded += 1;
  135 |         }
  136 |         for (const node of mutation.removedNodes) {
  137 |           if (matchesComposer(node)) monitor.composerRemoved += 1;
  138 |         }
  139 |       }
  140 |     });
  141 | 
  142 |     const startObserver = () => {
  143 |       observer.observe(document.body, { childList: true, subtree: true });
  144 |     };
  145 | 
  146 |     if (document.readyState === "loading") {
  147 |       window.addEventListener("DOMContentLoaded", startObserver, { once: true });
  148 |     } else {
  149 |       startObserver();
  150 |     }
  151 | 
  152 |     window.setInterval(() => {
  153 |       const monitor = (window as typeof window & {
  154 |         __haniraE2E?: {
  155 |           composerAdded: number;
  156 |           composerRemoved: number;
  157 |           cookieSnapshots: Array<{ at: number; cookie: string }>;
  158 |         };
  159 |       }).__haniraE2E;
  160 |       monitor?.cookieSnapshots.push({
  161 |         at: Date.now(),
  162 |         cookie: document.cookie,
  163 |       });
  164 |     }, 500);
  165 |   });
  166 | 
  167 |   page.on("console", (message) => {
  168 |     consoleEvents.push(`${message.type()}: ${message.text()}`);
  169 |   });
  170 |   page.on("pageerror", (error) => {
  171 |     pageErrors.push(error.message);
  172 |   });
  173 |   page.on("framenavigated", (frame) => {
  174 |     if (frame === page.mainFrame()) {
  175 |       frameNavigations.push({ url: frame.url(), at: Date.now() });
  176 |     }
  177 |   });
  178 |   page.on("request", (request) => {
  179 |     requestLog.push({
  180 |       method: request.method(),
  181 |       url: request.url(),
  182 |       status: null,
  183 |       resourceType: request.resourceType(),
  184 |       kind: classifyRequest(request.url(), supabaseHost),
  185 |     });
  186 |   });
  187 |   page.on("response", (response) => {
  188 |     const entry = [...requestLog]
  189 |       .reverse()
  190 |       .find(
  191 |         (candidate) =>
  192 |           candidate.status === null &&
  193 |           candidate.method === response.request().method() &&
  194 |           candidate.url === response.url(),
  195 |       );
  196 |     if (entry) entry.status = response.status();
  197 |   });
  198 | 
  199 |   const beforeCookies = snapshotCookies(
  200 |     await context.cookies(testInfo.project.use.baseURL),
  201 |   );
  202 |   cookieChanges.push({ phase: "before", ...beforeCookies });
  203 | 
  204 |   if (isRealProject) {
  205 |     await page.goto("/login");
  206 |     await page.waitForLoadState("networkidle");
> 207 |     await expect(page.getByText("Que bom ter voce de volta.")).toBeVisible();
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  208 | 
  209 |     const emailInput = page.getByRole("textbox", { name: "E-mail" });
  210 |     const passwordInput = page.locator('input[name="password"]');
  211 |     const loginButton = page.getByRole("button", { name: "Entrar" });
  212 | 
  213 |     await emailInput.fill(email ?? "");
  214 |     await passwordInput.fill(password ?? "");
  215 |     clickedElements.push({ label: "Entrar", text: "Entrar" });
  216 |     await loginButton.click();
  217 | 
  218 |     await page.waitForURL(/\/chat/, { timeout: 20_000 });
  219 |     await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();
  220 |     await expect(page.getByText("Visitante")).toHaveCount(0);
  221 |   } else {
  222 |     await page.goto("/chat");
  223 |     await page.waitForLoadState("networkidle");
  224 |   }
  225 | 
  226 |   const afterSessionCookies = snapshotCookies(
  227 |     await context.cookies(testInfo.project.use.baseURL),
  228 |   );
  229 |   cookieChanges.push({ phase: "after-session", ...afterSessionCookies });
  230 | 
  231 |   await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();
  232 | 
  233 |   const sessionKind = await page.evaluate(() => {
  234 |     const visitor = document.body.innerText.includes("Visitante");
  235 |     return visitor ? "demo" : "real";
  236 |   });
  237 |   expect(sessionKind).toBe(expectedSessionKind);
  238 | 
  239 |   const userLabel = await page
  240 |     .locator("aside")
  241 |     .locator("p.text-xs.text-zinc-300")
  242 |     .textContent()
  243 |     .catch(() => null);
  244 | 
  245 |   await page.goto("/chat");
  246 |   await page.waitForLoadState("networkidle");
  247 | 
  248 |   const initialState = await page.evaluate(readPersistedChatState);
  249 | 
  250 |   await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeDisabled();
  251 | 
  252 |   const newConversationButton = page
  253 |     .locator("aside")
  254 |     .getByRole("button", { name: "Nova conversa", exact: true });
  255 |   clickedElements.push({
  256 |     label: "Nova conversa",
  257 |     text: await newConversationButton.innerText(),
  258 |   });
  259 |   await newConversationButton.click();
  260 | 
  261 |   await expect
  262 |     .poll(async () => page.evaluate(readPersistedChatState), {
  263 |       message: "Nova conversa deve criar ou selecionar uma conversa",
  264 |     })
  265 |     .toMatchObject({
  266 |       activeId: expect.any(String),
  267 |       conversationIds: expect.arrayContaining(initialState.conversationIds),
  268 |     });
  269 | 
  270 |   const afterNewConversation = await page.evaluate(readPersistedChatState);
  271 |   expect(afterNewConversation.activeId).not.toBeNull();
  272 |   expect(afterNewConversation.activeId).not.toBe(initialState.activeId);
  273 |   expect(afterNewConversation.conversationIds.length).toBeGreaterThanOrEqual(
  274 |     initialState.conversationIds.length,
  275 |   );
  276 | 
  277 |   const message = `Teste E2E ${Date.now()} estabilidade do chat`;
  278 |   const composer = page.getByLabel("Mensagem para Hanira");
  279 |   clickedElements.push({
  280 |     label: "Mensagem para Hanira",
  281 |     text: (await composer.getAttribute("placeholder")) ?? "",
  282 |   });
  283 |   await composer.click();
  284 |   await composer.fill(message);
  285 | 
  286 |   const sendButton = page.getByRole("button", { name: "Enviar mensagem" });
  287 |   await expect(sendButton).toBeEnabled();
  288 | 
  289 |   const sendRequestCountBefore = requestLog.filter(
  290 |     (entry) => entry.kind === "chat" && entry.method === "POST",
  291 |   ).length;
  292 | 
  293 |   clickedElements.push({ label: "Enviar mensagem", text: "Enviar mensagem" });
  294 |   await sendButton.click();
  295 | 
  296 |   const userMessageBubble = page
  297 |     .locator("section")
  298 |     .getByText(message, { exact: true })
  299 |     .last();
  300 |   await expect(userMessageBubble).toBeVisible();
  301 | 
  302 |   await expect
  303 |     .poll(
  304 |       () =>
  305 |         requestLog.filter(
  306 |           (entry) => entry.kind === "chat" && entry.method === "POST",
  307 |         ).length,
```