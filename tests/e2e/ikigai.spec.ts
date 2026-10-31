import { expect, test } from "@playwright/test";

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
