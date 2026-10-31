import { expect, test } from "@playwright/test";

async function initialPreview(page: import("@playwright/test").Page) {
  await page.goto("/ikigai");
  await page.getByRole("button", { name: "Iniciar meu Ikigai" }).click();
  for (const [id, value] of Object.entries({ identity: "Sou professora", love: "Ensinar com tecnologia", strengths: "Escutar estudantes", impact: "Apoiar jovens", future: "Criar uma escola" })) {
    await page.locator(`#ikigai-${id}`).fill(value);
  }
  await page.getByRole("button", { name: "Ver minha prévia" }).click();
}

const followUps = [
  { id: "nira-1", text: "Você prefere ensinar diretamente ou criar ferramentas de aprendizagem?" },
  { id: "nira-2", text: "Que recursos faltam para criar sua escola?" },
  { id: "nira-3", text: "Qual obstáculo encontra ao apoiar jovens hoje?" },
];

test("Ikigai: sidebar, teclado, formulário local, prévia e placeholders", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chat-demo", "Fluxo local sem credenciais ou serviços externos.");
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) writes.push(request.url());
  });

  await page.goto("/chat");
  const sidebar = page.getByRole("complementary", { name: "Navegação e conversas" });
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "collapsed");
  const railLink = sidebar.getByRole("link", { name: "Ikigai", exact: true }).filter({ visible: true });
  await expect(railLink).toHaveAttribute("title", "Ikigai");
  await sidebar.getByRole("button", { name: "Expandir barra lateral" }).click();
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");
  const link = sidebar.getByRole("link", { name: "Ikigai", exact: true }).filter({ visible: true });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ikigai$/);
  await expect(page.getByRole("heading", { name: "Descubra seu Ikigai" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu mapa de Ikigai aparecerá aqui" })).toBeVisible();
  writes.length = 0;

  await page.getByRole("button", { name: "Iniciar meu Ikigai" }).click();
  await expect(page.getByRole("heading", { name: "Vamos começar por você" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Ver minha prévia" })).toBeDisabled();
  await page.locator("#ikigai-identity").fill("   ");
  await expect(page.getByRole("status")).toHaveText("0 de 5 perguntas respondidas");
  const values = ["Sou professora", "Ensinar e criar", "Escutar e organizar", "Apoiar jovens", "Criar uma escola"];
  const fields = page.locator("textarea[required]");
  for (let index = 0; index < values.length; index++) {
    await expect(fields.nth(index)).toHaveAccessibleName(/.+/);
    await fields.nth(index).fill(values[index]);
  }
  await page.getByLabel("Prefere explicar com mais liberdade?").fill("Minha história pessoal");
  await expect(page.getByRole("button", { name: "Responder por áudio (em breve)", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Ver minha prévia" }).click();
  await expect(page.getByRole("heading", { name: "Sua prévia está pronta" })).toBeFocused();
  for (const value of values) await expect(page.getByText(value, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar PDF (em breve)", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Editar respostas" }).click();
  await expect(fields.first()).toHaveValue(values[0]);
  await page.getByRole("button", { name: "Ver minha prévia" }).click();
  await page.getByRole("button", { name: "Ver próximas etapas" }).click();
  await expect(page.getByRole("heading", { name: "Seu próximo capítulo" })).toBeFocused();
  await expect(page.getByText(/Não há geração em andamento/)).toBeVisible();
  expect(writes).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Seu mapa de Ikigai aparecerá aqui" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Ikigai: mobile sem rolagem horizontal", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chat-demo");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ikigai");
  await page.getByRole("button", { name: "Iniciar meu Ikigai" }).click();
  await expect(page.getByRole("heading", { name: "Vamos começar por você" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/ikigai-mobile.png", fullPage: true });
});

test("Ikigai: consentimento, três perguntas, pular, voltar e revisar sem novas chamadas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chat-demo");
  let requests = 0;
  await page.route("**/api/ikigai/questions", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ consent: true, answers: { love: "Ensinar com tecnologia" } });
    await route.fulfill({ json: { questions: followUps } });
  });
  await initialPreview(page);
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Aprofundar com a Nira", exact: true }).click();
  const send = page.getByRole("button", { name: "Enviar respostas e gerar perguntas" });
  await expect(send).toBeDisabled();
  await expect(page.getByText(/sujeitos à política de retenção desse provedor/)).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("checkbox", { name: /Concordo com o envio/ }).check();
  await send.click();
  await expect(page.getByRole("heading", { name: "Converse com a Nira" })).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Pergunta 1 de 3");
  await expect(page.getByText(followUps[1].text, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Progresso da entrevista" })).toHaveAttribute("aria-valuenow", "1");
  await page.getByLabel(followUps[0].text, { exact: true }).fill("Quero ensinar diretamente");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Pergunta 2 de 3");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.getByLabel(followUps[0].text, { exact: true })).toHaveValue("Quero ensinar diretamente");
  await page.getByLabel(followUps[0].text, { exact: true }).fill("Quero criar ferramentas");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Pular", exact: true }).click();
  await page.getByLabel(followUps[2].text, { exact: true }).fill("Falta tempo para os projetos");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Quero criar ferramentas", { exact: true })).toBeVisible();
  await expect(page.getByText(/Sem resposta — você pode pular/)).toBeVisible();
  await page.getByRole("button", { name: "Revisar conversa" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel(followUps[1].text, { exact: true }).fill("Preciso de uma equipe");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Preciso de uma equipe", { exact: true })).toBeVisible();
  expect(requests).toBe(1);
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  expect(persisted).not.toMatch(/Preciso de uma equipe|Quero criar ferramentas|Sou professora/);
  await page.screenshot({ path: "test-results/ikigai-interview-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Editar respostas", exact: true }).click();
  await page.locator("#ikigai-love").fill("Compor música");
  await page.getByRole("button", { name: "Ver minha prévia" }).click();
  await expect(page.getByRole("button", { name: "Revisar conversa" })).toHaveCount(0);
  await page.getByRole("button", { name: "Aprofundar com a Nira", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Concordo com o envio/ })).not.toBeChecked();
  expect(requests).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Seu mapa de Ikigai aparecerá aqui" })).toBeVisible();
  await expect(page.getByText("Preciso de uma equipe", { exact: true })).toHaveCount(0);
  const storage = await page.evaluate(() => [localStorage.getItem("ikigai"), sessionStorage.getItem("ikigai"), document.cookie]);
  expect(JSON.stringify(storage)).not.toContain("Preciso de uma equipe");
});

test("Ikigai: indisponibilidade e retorno malformado permitem seguir localmente", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chat-demo");
  for (const status of [503, 200]) {
    await page.route("**/api/ikigai/questions", (route) => route.fulfill({ status, json: status === 503 ? { error: "private provider detail" } : { questions: [] } }));
    await initialPreview(page);
    await page.getByRole("button", { name: "Aprofundar com a Nira", exact: true }).click();
    await page.getByRole("checkbox", { name: /Concordo com o envio/ }).check();
    await page.getByRole("button", { name: "Enviar respostas e gerar perguntas" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /A Nira|Não foi possível/ })).toBeVisible();
    await expect(page.getByText("private provider detail")).toHaveCount(0);
    await page.getByRole("button", { name: "Continuar sem aprofundar" }).click();
    await expect(page.getByText("Ensinar com tecnologia", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ver próximas etapas" }).click();
    await expect(page.getByRole("heading", { name: "Seu próximo capítulo" })).toBeVisible();
    await page.unroute("**/api/ikigai/questions");
  }
});

test("Ikigai: entrevista móvel com carregamento e cancelamento sem resultado tardio", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chat-demo");
  await page.setViewportSize({ width: 390, height: 844 });
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/ikigai/questions", async (route) => {
    await pending;
    await route.fulfill({ json: { questions: followUps } }).catch(() => {});
  });
  await initialPreview(page);
  await page.getByRole("button", { name: "Aprofundar com a Nira", exact: true }).click();
  await page.getByRole("checkbox", { name: /Concordo com o envio/ }).check();
  await page.getByRole("button", { name: "Enviar respostas e gerar perguntas" }).click();
  await expect(page.getByRole("status")).toContainText("Lendo seu contexto");
  await page.getByRole("button", { name: "Continuar sem aprofundar" }).click();
  release?.();
  await expect(page.getByRole("heading", { name: "Sua prévia está pronta" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Converse com a Nira" })).toHaveCount(0);
  await page.unroute("**/api/ikigai/questions");
  await page.route("**/api/ikigai/questions", (route) => route.fulfill({ json: { questions: followUps } }));
  await page.getByRole("button", { name: "Aprofundar com a Nira", exact: true }).click();
  await page.getByRole("checkbox", { name: /Concordo com o envio/ }).check();
  await page.getByRole("button", { name: "Enviar respostas e gerar perguntas" }).click();
  await expect(page.getByRole("heading", { name: "Converse com a Nira" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pular", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/ikigai-interview-mobile.png", fullPage: true });
});
