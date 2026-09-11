export type InstallExperience = "none" | "native-prompt" | "ios-guidance";

export function isStandaloneDisplay(options: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
}) {
  return options.displayModeStandalone || options.navigatorStandalone === true;
}

export function isIosDevice(userAgent: string, maxTouchPoints = 0) {
  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
  );
}

export function getInstallExperience(options: {
  standalone: boolean;
  dismissed: boolean;
  hasNativePrompt: boolean;
  ios: boolean;
}): InstallExperience {
  if (options.standalone || options.dismissed) return "none";
  if (options.hasNativePrompt) return "native-prompt";
  if (options.ios) return "ios-guidance";
  return "none";
}
