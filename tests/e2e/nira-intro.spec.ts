import { expect, test } from "@playwright/test";

test.beforeEach(({ baseURL }, info) => { test.skip(info.project.name !== "chat-demo"); expect(baseURL).toBe("http://localhost:3050"); });

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`Nira: introdução opcional e layout ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const media: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => { if (request.url().endsWith(".mp4")) media.push(request.url()); });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Começar agora" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pular introdução" })).toBeVisible();
    await page.getByRole("button", { name: "Pular introdução" }).click();
    await expect(page.getByRole("link", { name: "Começar agora" })).toBeFocused();
    await expect(page.locator("video")).not.toHaveAttribute("src");
    const count = media.length;
    expect(count).toBeGreaterThan(0);
    expect(media.every(url => url.endsWith("nira-transformation-source-01.mp4"))).toBe(true);
    await page.reload();
    await expect(page.locator("video")).not.toHaveAttribute("src");
    expect(media.length).toBe(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/nira-home-${viewport.width}.png`, fullPage: true, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}

test("Nira: movimento reduzido não baixa vídeo", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const media: string[] = [];
  page.on("request", request => { if (request.url().endsWith(".mp4")) media.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Começar agora" })).toBeVisible();
  await expect(page.getByAltText("Nira em um halo azul e violeta")).toBeVisible();
  await expect(page.locator("video")).not.toHaveAttribute("src");
  expect(media).toEqual([]);
});

for (const failure of ["autoplay", "network", "saveData"]) {
  test(`Nira: fallback estático em ${failure}`, async ({ page }) => {
    if (failure === "autoplay") await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError")); });
    if (failure === "network") await page.route("**/*.mp4", route => route.abort());
    if (failure === "saveData") await page.addInitScript(() => { Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true }); });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Começar agora" })).toBeVisible();
    await expect(page.getByAltText("Nira em um halo azul e violeta")).toBeVisible();
    await expect(page.locator("video")).not.toHaveAttribute("src");
    await page.getByRole("link", { name: "Começar agora" }).click();
    await expect(page).toHaveURL(/\/chat$/);
  });
}
