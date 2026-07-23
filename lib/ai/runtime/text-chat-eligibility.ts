export type TextAIProviderCapability = string;

export interface TextChatEligibilityInput {
  featureEnabled: boolean;
  hasImage: boolean;
  hasAttachments: boolean;
  hasMultimodalContent: boolean;
  requiredCapabilities?: TextAIProviderCapability[];
  supportedCapabilities?: TextAIProviderCapability[];
}

export interface TextChatEligibilityResult {
  eligible: boolean;
  reason:
    | "feature_disabled"
    | "has_image"
    | "has_attachments"
    | "has_multimodal_content"
    | "missing_capability"
    | "eligible";
  missingCapabilities: TextAIProviderCapability[];
}

export function shouldUseTextAIProvider(
  input: TextChatEligibilityInput,
): TextChatEligibilityResult {
  if (!input.featureEnabled) {
    return {
      eligible: false,
      reason: "feature_disabled",
      missingCapabilities: [],
    };
  }

  if (input.hasImage) {
    return {
      eligible: false,
      reason: "has_image",
      missingCapabilities: [],
    };
  }

  if (input.hasAttachments) {
    return {
      eligible: false,
      reason: "has_attachments",
      missingCapabilities: [],
    };
  }

  if (input.hasMultimodalContent) {
    return {
      eligible: false,
      reason: "has_multimodal_content",
      missingCapabilities: [],
    };
  }

  const requiredCapabilities = input.requiredCapabilities ?? [];
  const supportedCapabilities = new Set(input.supportedCapabilities ?? []);
  const missingCapabilities = requiredCapabilities.filter(
    (capability) => !supportedCapabilities.has(capability),
  );

  if (missingCapabilities.length > 0) {
    return {
      eligible: false,
      reason: "missing_capability",
      missingCapabilities,
    };
  }

  return {
    eligible: true,
    reason: "eligible",
    missingCapabilities: [],
  };
}
