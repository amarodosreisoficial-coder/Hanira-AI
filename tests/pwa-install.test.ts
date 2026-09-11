import { describe, expect, it } from "vitest";
import {
  getInstallExperience,
  isIosDevice,
  isStandaloneDisplay,
} from "../lib/pwa/install";

describe("experiência de instalação PWA", () => {
  it("detecta standalone pelo media query ou pelo navegador iOS", () => {
    expect(
      isStandaloneDisplay({ displayModeStandalone: true }),
    ).toBe(true);
    expect(
      isStandaloneDisplay({
        displayModeStandalone: false,
        navigatorStandalone: true,
      }),
    ).toBe(true);
    expect(
      isStandaloneDisplay({ displayModeStandalone: false }),
    ).toBe(false);
  });

  it("detecta iPhone, iPad e iPadOS em modo desktop", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh)", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 15)", 5)).toBe(false);
  });

  it("prioriza prompt nativo, orienta iOS e se oculta quando instalada ou dispensada", () => {
    expect(
      getInstallExperience({
        standalone: false,
        dismissed: false,
        hasNativePrompt: true,
        ios: false,
      }),
    ).toBe("native-prompt");
    expect(
      getInstallExperience({
        standalone: false,
        dismissed: false,
        hasNativePrompt: false,
        ios: true,
      }),
    ).toBe("ios-guidance");
    expect(
      getInstallExperience({
        standalone: true,
        dismissed: false,
        hasNativePrompt: true,
        ios: true,
      }),
    ).toBe("none");
    expect(
      getInstallExperience({
        standalone: false,
        dismissed: true,
        hasNativePrompt: true,
        ios: false,
      }),
    ).toBe("none");
  });
});
