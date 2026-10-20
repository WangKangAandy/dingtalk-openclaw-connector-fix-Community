/**
 * Stable dist entry for admin tooling (test-send, etc.).
 * Gateway and admin must load the same built surface — never src/ — so packaging
 * bugs (missing dist/templates, wrong import.meta.url) fail in test-send too.
 */
export { createOrgEventListener } from "./org-events/dispatcher.ts";
export { deliverOrgEvent } from "./org-events/deliver.ts";
export { lookupStaffName } from "./org-events/staff-name.ts";
export { note } from "./org-events/receipt.ts";
export {
  ONBOARDING_TITLE,
  onboardingDir,
  loadOnboardingTemplate,
  renderOnboardingTemplate,
} from "./org-events/template.ts";
export { sendProactive } from "./services/messaging.ts";
export { prepareDingTalkMarkdown } from "./utils/markdown.ts";
export { getOapiAccessToken } from "./utils/index.ts";
export { uploadMediaToDingTalk } from "./services/media.ts";
export {
  DINGTALK_OAPI,
  getOapiAccessToken as getLegacyOapiAccessToken,
} from "./utils/utils-legacy.ts";
export { dingtalkOapiHttp } from "./utils/http-client.ts";
