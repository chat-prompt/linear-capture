import { registerLinearHandlers } from './linear-handlers';
import { registerCaptureHandlers } from './capture-handlers';
import { registerAnalysisHandlers } from './analysis-handlers';
import { registerSettingsHandlers } from './settings-handlers';
import { registerOAuthHandlers } from './oauth-handlers';
import { registerSearchHandlers } from './search-handlers';
import { registerSyncHandlers } from './sync-handlers';
import { registerOnboardingHandlers } from './onboarding-handlers';

export { loadLinearData } from './linear-handlers';

export function registerIpcHandlers(): void {
  registerOnboardingHandlers();
  registerLinearHandlers();
  registerCaptureHandlers();
  registerAnalysisHandlers();
  registerSettingsHandlers();
  registerOAuthHandlers();
  registerSearchHandlers();
  registerSyncHandlers();
}
