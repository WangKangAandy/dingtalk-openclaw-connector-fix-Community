/**
 * Stable dist entry for the org-events send path (gateway + admin 1:1 test-send).
 * Keep this surface narrow — not a general admin/http/media bridge.
 */
export { createOrgEventListener } from "./dispatcher.ts";
export { deliverOrgEvent } from "./deliver.ts";
export { lookupStaffName } from "./staff-name.ts";
export { note } from "./receipt.ts";
export {
  ONBOARDING_TITLE,
  onboardingDir,
  loadOnboardingTemplate,
  renderOnboardingTemplate,
} from "./template.ts";
