import { expect, test, type Page } from "@playwright/test";
import { analysisAnswers, createAnalysisReport } from "../helpers/ikigai-analysis";
import { ikigaiAnalysisRequestSchema } from "@/lib/ikigai/analysis-contract";

async function initialPreview(page: Page) {
  await page.goto("/ikigai");
  await page.getByRole("button", { name: "Iniciar meu Ikigai" }).click();
  for (const [id, value] of Object.entries(analysisAnswers)) if (id !== "story") await page.locator(`#ikigai-${id}`).fill(value);
  await page.getByRole("button", { name: "Ver minha prévia" }).click();
}
async function consentToAnalysis(page: Page) {
  await page.getByRole("button", { name: "Gerar meu Ikigai com a Nira", exact: true }).click();
  await page.getByRole("checkbox", { name: /Concordo com o envio dessas respostas para a análise/ }).check();
  await page.getByRole("button", { name: "Confirmar e gerar análise", exact: true }).click();
}

test.beforeEach(({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "chat-demo");
  expect(baseURL).toBe("http://localhost:3050");
});

test("análise: consentimento próprio, evidências, ações, edição e descarte", async ({ page }) => {
  let requests = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/ikigai/analyze", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ analysisConsent: true, followUps: [], answers: { story: "" } });
    await route.fulfill({ json: createAnalysisReport() });
  });
  await initialPreview(page);
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Gerar meu Ikigai com a Nira", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirmar e gerar análise" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /para a análise personalizada/ })).not.toBeChecked();
  await expect(page.getByText(/Esta autorização é específica para a análise/)).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("checkbox", { name: /para a análise personalizada/ }).check();
  await page.getByRole("button", { name: "Confirmar e gerar análise" }).click();
  const resultHeading = page.getByRole("heading", { name: "Seu Ikigai personalizado", exact: true });
  await expect(resultHeading).toBeFocused();
  await expect(page.getByRole("heading", { name: "Ensinar e escutar com propósito" })).toBeVisible();
  for (const days of [7, 30, 90]) await expect(page.getByRole("heading", { name: `Nos próximos ${days} dias` })).toBeVisible();
  await page.locator("details summary").first().click();
  await expect(page.locator("details").first().getByText("O que você mais gosta de fazer?", { exact: true })).toBeVisible();
  const pdfButton = page.getByRole("button", { name: "Baixar meu Ikigai em PDF", exact: true });
  await expect(pdfButton).toBeEnabled();
  const download = page.waitForEvent("download");
  await pdfButton.click();
  expect((await download).suggestedFilename()).toMatch(/^relatorio-ikigai-.*\.pdf$/);
  expect(requests).toBe(1);
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  expect(persisted).not.toMatch(/Sou professora|Ensinar e escutar|Apoiar jovens/);
  await page.screenshot({ path: "test-results/ikigai-analysis-desktop.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Editar respostas", exact: true }).click();
  await expect(page.getByText(/Alterar uma resposta descarta a análise atual/)).toBeVisible();
  await page.locator("#ikigai-identity").fill("Sou professora e aprendiz");
  await page.getByRole("button", { name: "Ver minha prévia" }).click();
  await expect(page.getByRole("button", { name: "Ver minha análise", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar meu Ikigai com a Nira", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /para a análise personalizada/ })).not.toBeChecked();
  expect(requests).toBe(1);
  await page.getByRole("checkbox", { name: /para a análise personalizada/ }).check();
  await page.getByRole("button", { name: "Confirmar e gerar análise" }).click();
  await expect(resultHeading).toBeVisible();
  await page.getByRole("button", { name: "Descartar resultado", exact: true }).click();
  await expect(resultHeading).toHaveCount(0);
  await expect(page.getByText("Sou professora e aprendiz", { exact: true })).toBeVisible();
  expect(requests).toBe(2);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Seu mapa de Ikigai aparecerá aqui" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("análise: entrevista opcional, perguntas puladas, consentimentos separados e reinício", async ({ page }) => {
  const followUps = [
    { id: "nira-1", text: "Que recurso falta para criar sua escola?" },
    { id: "nira-2", text: "Que papel teria a tecnologia nesse projeto?" },
  ];
  let requests = 0;
  await page.route("**/api/ikigai/questions", (route) => route.fulfill({ json: { questions: followUps } }));
  await page.route("**/api/ikigai/analyze", async (route) => {
    requests++;
    const input = ikigaiAnalysisRequestSchema.parse(route.request().postDataJSON());
    expect(input.followUps).toHaveLength(1);
    expect(input.followUps[0].id).toBe("nira-1");
    const report = createAnalysisReport();
    report.challenges = [{ text: input.followUps[0].answer, evidence: [{ source: "nira-1", quote: input.followUps[0].answer }] }];
    await route.fulfill({ json: report });
  });
  await initialPreview(page);
  await page.getByRole("button", { name: "Aprofundar com a Nira", exact: true }).click();
  await page.getByRole("checkbox", { name: /gerar perguntas de aprofundamento/ }).check();
  await page.getByRole("button", { name: "Enviar respostas e gerar perguntas" }).click();
  await page.getByLabel(followUps[0].text, { exact: true }).fill("Falta tempo para ensinar");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Pular", exact: true }).click();
  await page.getByRole("button", { name: "Gerar meu Ikigai com a Nira", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /para a análise personalizada/ })).not.toBeChecked();
  expect(requests).toBe(0);
  await page.getByRole("checkbox", { name: /para a análise personalizada/ }).check();
  await page.getByRole("button", { name: "Confirmar e gerar análise" }).click();
  await expect(page.getByRole("heading", { name: "Seu Ikigai personalizado", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Desafios que você mencionou" })).toBeVisible();
  await page.getByRole("button", { name: "Revisar conversa", exact: true }).click();
  await page.getByLabel(followUps[0].text, { exact: true }).fill("Tenho dúvida sobre ensinar");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Pular", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver minha análise", exact: true })).toHaveCount(0);
  await consentToAnalysis(page);
  await page.getByRole("button", { name: "Descartar tudo e reiniciar formulário", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Como funciona", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Iniciar meu Ikigai" }).click();
  await expect(page.locator("#ikigai-identity")).toHaveValue("");
  expect(requests).toBe(2);
});

test("análise: falha e saída malformada mantêm respostas sem retry automático", async ({ page }) => {
  for (const status of [503, 429, 200]) {
    let requests = 0;
    await page.route("**/api/ikigai/analyze", (route) => {
      requests++;
      return route.fulfill({ status, json: status === 200 ? { contractVersion: "1.0", title: "Relatório inválido" } : { error: "private provider details" } });
    });
    await initialPreview(page);
    await consentToAnalysis(page);
    await expect(page.getByRole("alert").filter({ hasText: /A Nira|Não foi possível|O limite/ })).toBeVisible();
    await expect(page.getByText("private provider details")).toHaveCount(0);
    expect(requests).toBe(1);
    await page.getByRole("button", { name: "Cancelar análise", exact: true }).click();
    await expect(page.getByText("Sou professora", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seu Ikigai personalizado", exact: true })).toHaveCount(0);
    await page.unroute("**/api/ikigai/analyze");
  }
});

test("análise: cancelamento descarta resposta tardia e resultado móvel é acessível", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release: (() => void) | undefined;
  let completed: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const finished = new Promise<void>((resolve) => { completed = resolve; });
  await page.route("**/api/ikigai/analyze", async (route) => {
    await pending;
    await route.fulfill({ json: createAnalysisReport() }).catch(() => {});
    completed?.();
  });
  await initialPreview(page);
  await consentToAnalysis(page);
  await expect(page.getByRole("status")).toHaveText("A Nira está organizando suas reflexões...");
  await page.getByRole("button", { name: "Cancelar análise", exact: true }).click();
  release?.(); await finished;
  await expect(page.getByRole("heading", { name: "Seu Ikigai personalizado", exact: true })).toHaveCount(0);
  await page.unroute("**/api/ikigai/analyze");
  await page.route("**/api/ikigai/analyze", (route) => route.fulfill({ json: createAnalysisReport() }));
  await consentToAnalysis(page);
  await expect(page.getByRole("heading", { name: "Seu Ikigai personalizado", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/ikigai-analysis-mobile.png", fullPage: true, animations: "disabled" });
});

test("análise: timeout do cliente mantém formulário e permite nova tentativa manual", async ({ page }) => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/ikigai/analyze", async (route) => {
    await pending;
    await route.fulfill({ json: createAnalysisReport() }).catch(() => {});
  });
  await initialPreview(page);
  await page.clock.install();
  await consentToAnalysis(page);
  await expect(page.getByRole("status")).toContainText("organizando suas reflexões");
  await page.clock.fastForward(35_001);
  await expect(page.getByRole("alert").filter({ hasText: /Não foi possível concluir/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar análise", exact: true }).click();
  await expect(page.getByText("Sou professora", { exact: true })).toBeVisible();
  release?.();
});
