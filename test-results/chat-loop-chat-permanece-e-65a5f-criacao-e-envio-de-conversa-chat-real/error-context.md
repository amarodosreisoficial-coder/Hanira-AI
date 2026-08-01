# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-loop.spec.ts >> chat permanece estavel durante criacao e envio de conversa
- Location: tests\e2e\chat-loop.spec.ts:737:5

# Error details

```
Error: Sessao inconclusiva. O submit ocorreu, mas nao ha evidencia explicita de autenticacao bem-sucedida.
{
  "loginDiagnostic": {
    "outcome": "timeout",
    "classification": "H",
    "classificationMessage": "Sessao inconclusiva. O submit ocorreu, mas nao ha evidencia explicita de autenticacao bem-sucedida.",
    "urlBeforeSubmit": "http://localhost:3051/login",
    "finalUrl": "http://localhost:3051/login",
    "authStatus": null,
    "authEndpoint": null,
    "uiErrorMessage": null,
    "buttonEnteredLoading": false,
    "buttonExitedLoading": false,
    "sessionCreated": false,
    "authCookiesAdded": false,
    "redirectOccurred": false,
    "sessionKind": "real",
    "authenticatedUser": false,
    "submitTriggered": true,
    "loginPostCount": 1,
    "loginPosts": [
      {
        "method": "POST",
        "url": "http://localhost:3051/login",
        "status": 200
      }
    ],
    "supabaseProbe": {
      "getSessionCalled": true,
      "getUserCalled": true,
      "sessionFound": false,
      "userFound": false,
      "userId": null,
      "userEmailMatchesExpected": false,
      "error": "Auth session missing!"
    },
    "actionSuccessExplicit": false,
    "envProbe": {
      "variableNames": [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
      ],
      "supabaseUrlPresent": true,
      "supabaseAnonKeyPresent": true,
      "environment": "playwright-process"
    },
    "appDiagnostics": {
      "requested": true,
      "status": 401,
      "authenticated": null,
      "mode": null
    },
    "loginResponse": {
      "contentType": "text/x-component",
      "relevantHeaders": {
        "location": null,
        "x-action-redirect": null,
        "x-nextjs-redirect": null,
        "cache-control": "no-cache, must-revalidate",
        "x-nextjs-postponed": null
      },
      "bodySize": 124,
      "indicatesError": true,
      "indicatesSuccess": false,
      "indicatesRedirect": false,
      "indicatesDigest": false,
      "indicatesInvalidCredentials": true,
      "indicatesEmailNotConfirmed": false
    },
    "screenshotPath": "C:\\Projetos\\hanira-app\\test-results\\chat-loop-chat-permanece-e-65a5f-criacao-e-envio-de-conversa-chat-real\\chat-real-login-final.png"
  },
  "consoleErrors": [],
  "pageErrors": [],
  "relevantErrorsDuringLogin": []
}
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - link "Voltar" [ref=e3] [cursor=pointer]:
      - /url: /
      - img [ref=e4]
      - text: Voltar
    - generic [ref=e6]:
      - generic [ref=e10]: Hanira
      - generic [ref=e11]:
        - generic [ref=e12]:
          - heading "Que bom ter você de volta." [level=1] [ref=e13]
          - paragraph [ref=e14]: Entre para continuar sua conversa com Hanira.
        - generic [ref=e15]:
          - generic [ref=e16]:
            - generic [ref=e17]: E-mail
            - textbox "E-mail" [ref=e18]:
              - /placeholder: voce@exemplo.com
          - generic [ref=e19]:
            - generic [ref=e20]: Senha
            - generic [ref=e21]:
              - textbox "Senha Mostrar senha" [ref=e22]:
                - /placeholder: Sua senha
              - button "Mostrar senha" [ref=e23]:
                - img [ref=e24]
          - link "Esqueci minha senha" [ref=e28] [cursor=pointer]:
            - /url: /esqueci-a-senha
          - alert [ref=e29]: E-mail ou senha incorretos.
          - button "Entrar" [ref=e30]:
            - text: Entrar
            - img [ref=e31]
        - paragraph [ref=e33]:
          - text: Ainda não tem conta?
          - link "Criar conta" [ref=e34] [cursor=pointer]:
            - /url: /cadastro
  - button "Open Next.js Dev Tools" [ref=e40] [cursor=pointer]:
    - img [ref=e41]
  - alert [ref=e44]
```

# Test source

```ts
  863  |     const entry = [...requestLog]
  864  |       .reverse()
  865  |       .find(
  866  |         (candidate) =>
  867  |           candidate.status === null &&
  868  |           candidate.method === response.request().method() &&
  869  |           candidate.url === response.url(),
  870  |       );
  871  |     if (entry) entry.status = response.status();
  872  |   });
  873  | 
  874  |   await context.clearCookies();
  875  |   const beforeCookies = snapshotCookies(await context.cookies());
  876  |   cookieChanges.push({ phase: "before", ...beforeCookies });
  877  | 
  878  |   if (isRealProject) {
  879  |     await page.goto("/login");
  880  |     await page.waitForLoadState("networkidle");
  881  |     await page.evaluate(() => {
  882  |       window.localStorage.clear();
  883  |       window.sessionStorage.clear();
  884  |     });
  885  |     await page.reload({ waitUntil: "networkidle" });
  886  | 
  887  |     if (page.url().includes("/chat")) {
  888  |       await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();
  889  |       await expect.poll(() => detectSessionKind(page)).toBe("real");
  890  |     } else {
  891  |       await page.waitForURL(/\/login(?:\?|$)/, { timeout: 20_000 });
  892  | 
  893  |       const emailInput = page.getByRole("textbox", { name: /e-mail/i });
  894  |       const passwordInput = page.locator('input[type="password"]');
  895  |       const loginButton = page.getByRole("button", {
  896  |         name: /entrar|continuar/i,
  897  |       });
  898  |       const formErrorMessage = page.getByRole("alert");
  899  | 
  900  |       await expect(emailInput).toBeVisible();
  901  |       await expect(passwordInput).toBeVisible();
  902  |       await expect(loginButton).toBeVisible();
  903  | 
  904  |       await emailInput.fill(email ?? "");
  905  |       await passwordInput.fill(password ?? "");
  906  |       clickedElements.push({
  907  |         label: "submit",
  908  |         text: (await loginButton.innerText()).trim(),
  909  |       });
  910  | 
  911  |       const cookieBaseline = snapshotCookies(await context.cookies());
  912  |       const loginResponseSummaryPromise = summarizeLoginResponse(page);
  913  |       await loginButton.click();
  914  | 
  915  |       const loginDiagnostic = await waitForLoginResolution({
  916  |         page,
  917  |         context,
  918  |         loginButton,
  919  |         errorMessage: formErrorMessage,
  920  |         cookieBaseline,
  921  |         requestLog,
  922  |         screenshotPath: testInfo.outputPath("chat-real-login-final.png"),
  923  |         expectedEmail: email,
  924  |         supabaseUrl,
  925  |         supabaseAnonKey,
  926  |         loginResponseSummary: await loginResponseSummaryPromise,
  927  |       });
  928  | 
  929  |       const relevantErrorsDuringLogin = requestLog
  930  |         .filter(
  931  |           (entry) =>
  932  |             entry.status !== null &&
  933  |             entry.status >= 400 &&
  934  |             ["supabase", "document"].includes(entry.kind),
  935  |         )
  936  |         .map((entry) => ({
  937  |           method: entry.method,
  938  |           url: sanitizeUrl(entry.url),
  939  |           status: entry.status,
  940  |           kind: entry.kind,
  941  |         }));
  942  | 
  943  |       console.log(
  944  |         JSON.stringify(
  945  |           {
  946  |             loginDiagnostic,
  947  |             consoleErrors: consoleEvents
  948  |               .filter((entry) => entry.startsWith("error:"))
  949  |               .map(sanitizeText),
  950  |             pageErrors: pageErrors.map(sanitizeText),
  951  |             relevantErrorsDuringLogin,
  952  |           },
  953  |           null,
  954  |           2,
  955  |         ),
  956  |       );
  957  | 
  958  |       if (loginDiagnostic.classification !== "F") {
  959  |         const authMessage =
  960  |           loginDiagnostic.classification === "C"
  961  |             ? `${loginDiagnostic.classificationMessage} ${loginDiagnostic.uiErrorMessage ?? ""}`.trim()
  962  |             : loginDiagnostic.classificationMessage;
> 963  |         throw new Error(
       |               ^ Error: Sessao inconclusiva. O submit ocorreu, mas nao ha evidencia explicita de autenticacao bem-sucedida.
  964  |           `${authMessage}\n${JSON.stringify(
  965  |             {
  966  |               loginDiagnostic,
  967  |               consoleErrors: consoleEvents
  968  |                 .filter((entry) => entry.startsWith("error:"))
  969  |                 .map(sanitizeText),
  970  |               pageErrors: pageErrors.map(sanitizeText),
  971  |               relevantErrorsDuringLogin,
  972  |             },
  973  |             null,
  974  |             2,
  975  |           )}`,
  976  |         );
  977  |       }
  978  | 
  979  |       await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();
  980  |       await expect.poll(() => detectSessionKind(page)).toBe("real");
  981  |     }
  982  |   } else {
  983  |     await page.goto("/chat");
  984  |     await page.waitForLoadState("networkidle");
  985  |   }
  986  | 
  987  |   const afterSessionCookies = snapshotCookies(
  988  |     await context.cookies(testInfo.project.use.baseURL),
  989  |   );
  990  |   cookieChanges.push({ phase: "after-session", ...afterSessionCookies });
  991  | 
  992  |   await expect(page.getByLabel("Mensagem para Hanira")).toBeVisible();
  993  | 
  994  |   const sessionKind = await detectSessionKind(page);
  995  |   expect(sessionKind).toBe(expectedSessionKind);
  996  | 
  997  |   const userLabel = await page
  998  |     .locator("aside")
  999  |     .locator("p.text-xs.text-zinc-300")
  1000 |     .textContent()
  1001 |     .catch(() => null);
  1002 | 
  1003 |   await page.goto("/chat");
  1004 |   await page.waitForLoadState("networkidle");
  1005 | 
  1006 |   const initialState = await page.evaluate(readPersistedChatState);
  1007 | 
  1008 |   await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeDisabled();
  1009 | 
  1010 |   const newConversationButton = page
  1011 |     .locator("aside")
  1012 |     .getByRole("button", { name: "Nova conversa", exact: true });
  1013 |   clickedElements.push({
  1014 |     label: "Nova conversa",
  1015 |     text: await newConversationButton.innerText(),
  1016 |   });
  1017 |   await newConversationButton.click();
  1018 | 
  1019 |   await expect
  1020 |     .poll(async () => page.evaluate(readPersistedChatState), {
  1021 |       message: "Nova conversa deve criar ou selecionar uma conversa",
  1022 |     })
  1023 |     .toMatchObject({
  1024 |       activeId: expect.any(String),
  1025 |       conversationIds: expect.arrayContaining(initialState.conversationIds),
  1026 |     });
  1027 | 
  1028 |   const afterNewConversation = await page.evaluate(readPersistedChatState);
  1029 |   expect(afterNewConversation.activeId).not.toBeNull();
  1030 |   expect(afterNewConversation.activeId).not.toBe(initialState.activeId);
  1031 |   expect(afterNewConversation.conversationIds.length).toBeGreaterThanOrEqual(
  1032 |     initialState.conversationIds.length,
  1033 |   );
  1034 | 
  1035 |   const message = `Teste E2E ${Date.now()} estabilidade do chat`;
  1036 |   const composer = page.getByLabel("Mensagem para Hanira");
  1037 |   clickedElements.push({
  1038 |     label: "Mensagem para Hanira",
  1039 |     text: (await composer.getAttribute("placeholder")) ?? "",
  1040 |   });
  1041 |   await composer.click();
  1042 |   await composer.fill(message);
  1043 | 
  1044 |   const sendButton = page.getByRole("button", { name: "Enviar mensagem" });
  1045 |   await expect(sendButton).toBeEnabled();
  1046 | 
  1047 |   const sendRequestCountBefore = requestLog.filter(
  1048 |     (entry) => entry.kind === "chat" && entry.method === "POST",
  1049 |   ).length;
  1050 | 
  1051 |   clickedElements.push({ label: "Enviar mensagem", text: "Enviar mensagem" });
  1052 |   await sendButton.click();
  1053 | 
  1054 |   const userMessageBubble = page
  1055 |     .locator("section")
  1056 |     .getByText(message, { exact: true })
  1057 |     .last();
  1058 |   await expect(userMessageBubble).toBeVisible();
  1059 | 
  1060 |   await expect
  1061 |     .poll(
  1062 |       () =>
  1063 |         requestLog.filter(
```