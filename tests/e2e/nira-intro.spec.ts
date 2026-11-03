import { expect, test } from "@playwright/test";

test.beforeEach(({ baseURL }, info) => { test.skip(info.project.name !== "chat-demo"); expect(baseURL).toBe("http://localhost:3050"); });

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`Nira: vídeo 02 horizontal em loop contínuo ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const media: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => { if (request.url().endsWith(".mp4")) media.push(request.url()); });
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => sessionStorage.setItem("hanira:nira-intro:v1", "seen"));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Começar agora" })).toBeVisible();
    const video = page.locator("video");
    await expect(video).toHaveCount(1);
    await expect(video).toHaveJSProperty("loop", true);
    await expect(video).toHaveJSProperty("muted", true);
    await expect(video).toHaveJSProperty("playsInline", true);
    await expect(video).toHaveJSProperty("paused", false);
    await expect(page.getByRole("button", { name: "Pausar animação" })).toBeVisible();
    await page.waitForTimeout(6500); // Regression: the old six-second cutoff.
    await expect(video).toHaveAttribute("src", /source-02\.mp4$/);
    await expect(video).toHaveJSProperty("paused", false);
    for (let cycle = 0; cycle < 2; cycle++) {
      await video.evaluate((element: HTMLVideoElement) => { element.currentTime = element.duration - 0.2; });
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeLessThan(2);
      await expect(video).toHaveJSProperty("paused", false);
    }
    expect(media.length).toBeGreaterThan(0);
    expect(media.every(url => url.endsWith("nira-transformation-source-02.mp4"))).toBe(true);
    expect(await video.evaluate(element => element.getBoundingClientRect().width / element.getBoundingClientRect().height)).toBeCloseTo(16 / 9, 1);
    await page.reload();
    await expect(page.getByRole("button", { name: "Pausar animação" })).toBeVisible();
    await expect(video).toHaveAttribute("src", /source-02\.mp4$/);
    await page.getByRole("button", { name: "Pausar animação" }).focus();
    await page.keyboard.press("Enter");
    await expect(video).toHaveJSProperty("paused", true);
    await expect(page.getByRole("button", { name: "Reproduzir animação" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/nira-home-${viewport.width}.png`, fullPage: true, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}

test("Nira: sinal de aba oculta pausa e retoma sem ignorar pausa manual", async ({ page }) => {
  await page.goto("/");
  const video = page.locator("video");
  await expect(page.getByRole("button", { name: "Pausar animação" })).toBeVisible();
  const visibility = (hidden: boolean) => page.evaluate(value => {
    Object.defineProperty(document, "hidden", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await visibility(true);
  await expect(video).toHaveJSProperty("paused", true);
  await expect(video).toHaveAttribute("src", /source-02\.mp4$/);
  await visibility(false);
  await expect(video).toHaveJSProperty("paused", false);
  await page.getByRole("button", { name: "Pausar animação" }).click();
  await visibility(true); await visibility(false);
  await expect(video).toHaveJSProperty("paused", true);
  await page.getByRole("button", { name: "Reproduzir animação" }).click();
  await expect(video).toHaveJSProperty("paused", false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).not.toHaveAttribute("src");
  await expect(video).toHaveJSProperty("paused", true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(video).toHaveAttribute("src", /source-02\.mp4$/);
  await expect(video).toHaveJSProperty("paused", false);
});

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
