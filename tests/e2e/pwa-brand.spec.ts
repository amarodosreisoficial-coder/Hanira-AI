import { expect, test } from "@playwright/test";

test("marca, metadata e instalação PWA funcionam em desktop e mobile", async ({
  browser,
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText("Hanira");
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Hanira AI",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/brand\/hanira-social\.png$/,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  expect(await manifestResponse.json()).toEqual(
    expect.objectContaining({
      name: "Hanira AI",
      short_name: "Hanira",
      display: "standalone",
    }),
  );

  for (const path of [
    "/icons/hanira-192.png",
    "/icons/hanira-512.png",
    "/icons/hanira-maskable-512.png",
    "/brand/hanira-social.png",
  ]) {
    const response = await page.request.get(path);
    expect(response.ok(), path).toBe(true);
    expect(response.headers()["content-type"], path).toBe("image/png");
  }

  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          (window as typeof window & { __installPromptCalled?: boolean })
            .__installPromptCalled = true;
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: "accepted", platform: "web" }),
      },
    });
    window.dispatchEvent(event);
  });
  await expect(
    page.getByRole("button", { name: "Adicionar Hanira" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adicionar Hanira" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __installPromptCalled?: boolean })
            .__installPromptCalled,
      ),
    )
    .toBe(true);

  const baseURL = String(testInfo.project.use.baseURL);
  const iosContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });
  const iosPage = await iosContext.newPage();
  await iosPage.goto(baseURL, { waitUntil: "networkidle" });
  await expect(iosPage.getByText("Adicionar à Tela de Início")).toBeVisible();
  await expect(iosPage.locator("body")).toHaveCSS("overflow-x", "visible");
  await iosPage.screenshot({
    path: testInfo.outputPath("hanira-mobile-install.png"),
    fullPage: true,
  });
  await iosContext.close();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("não oferece instalação quando já está em standalone", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: async () => undefined },
      userChoice: {
        value: Promise.resolve({ outcome: "accepted", platform: "web" }),
      },
    });
    window.dispatchEvent(event);
  });

  await expect(page.getByLabel("Instalar Hanira")).toHaveCount(0);
});
