/**
 * Main entry point for the issue form page (index.html).
 * Imports all modules and orchestrates initialization.
 */
import { ipc } from '../shared/ipc';
import { t, translatePage, autoTranslate } from '../shared/i18n';
import { initDomElements } from './state';
import * as state from './state';
import { initCloseDropdownHandler } from './searchable-dropdown';
import { initImageGallery, renderGallery } from './image-gallery';
import { initLinearDropdowns, updateTeamDependentDropdowns, updateLabelsForTeam } from './linear-dropdowns';
import { initIssueForm } from './issue-form';
import { initSemanticSearch } from './semantic-search';
import { initRelatedContext } from './related-context';

// ==================== i18n Setup ====================

async function updateDynamicUI() {
  // reanalyzeBtn - 현재 상태에 따라 텍스트 결정
  const hasAnalyzed = state.titleInput && state.titleInput.value.trim() !== '';
  if (state.aiLoadingDiv && !state.aiLoadingDiv.classList.contains('hidden')) {
    // 로딩 중 - 건드리지 않음
  } else if (hasAnalyzed) {
    state.reanalyzeBtn.textContent = await t('capture.reanalyze');
  } else {
    state.reanalyzeBtn.textContent = await t('capture.analysisStart');
  }
  // Linear 섹션 (Team, Project, Status, Priority, Assignee, Estimate, Cycle, Labels)은 영어 고정
}

ipc.on('language-changed', async () => {
  try {
    await translatePage();
    document.title = await t('capture.title') + ' - Linear Capture';
    await autoTranslate();
    await updateDynamicUI();
    renderGallery();
    updateShortcutHint();
  } catch (e) {
    console.error('Language change handler error:', e);
  }
});

translatePage().then(async () => {
  document.title = await t('capture.title') + ' - Linear Capture';
});
document.addEventListener('DOMContentLoaded', () => autoTranslate());

// ==================== Initialize DOM ====================

initDomElements();

// ==================== Settings Button ====================

document.getElementById('settingsBtn')!.addEventListener('click', () => {
  ipc.invoke('open-settings');
});

// ==================== Token Warning ====================

const tokenWarning = document.getElementById('tokenWarning')!;
document.getElementById('tokenWarningBtn')!.addEventListener('click', () => {
  ipc.invoke('open-settings');
});

async function checkTokenStatus() {
  try {
    const settings = await ipc.invoke('get-settings');
    if (!settings || !settings.linearApiToken) {
      tokenWarning.classList.remove('hidden');
    } else {
      tokenWarning.classList.add('hidden');
    }
  } catch (error) {
    console.error('Failed to check token status:', error);
  }
}
checkTokenStatus();

// Listen for settings changes to update warning
ipc.on('settings-updated', () => {
  checkTokenStatus();
});

// ==================== Linear Data Updates ====================

ipc.on('linear-data-updated', (data: any) => {
  console.log('Linear data updated:', data);

  // Update cached data
  state.setAllTeams(data.teams || []);
  state.setAllStates(data.states || []);
  state.setAllCycles(data.cycles || []);
  state.setAllProjects(data.projects || []);
  state.setAllUsers(data.users || []);
  state.setAllLabels(data.labels || []);

  // Repopulate team dropdown
  const currentTeamId = state.teamSelect.value;
  state.teamSelect.innerHTML = '<option value="" data-i18n="form.teamPlaceholder">Select team...</option>';
  state.allTeams.forEach((team: any) => {
    const option = document.createElement('option');
    option.value = team.id;
    option.textContent = `${team.name} (${team.key})`;
    if (team.id === data.defaultTeamId || team.id === currentTeamId) {
      option.selected = true;
    }
    state.teamSelect.appendChild(option);
  });

  // Reinitialize searchable dropdowns
  if (state.projectSearchable) {
    state.projectSearchable.setItems(state.allProjects);
  }
  if (state.assigneeSearchable) {
    state.assigneeSearchable.setItems(state.allUsers);
  }

  // Update team-dependent dropdowns if team is selected
  if (state.teamSelect.value) {
    updateTeamDependentDropdowns(state.teamSelect.value);
    updateLabelsForTeam();
  }

  console.log(`Refreshed: ${state.allTeams.length} teams, ${state.allProjects.length} projects, ${state.allUsers.length} users`);
});

// ==================== Init Modules ====================

initCloseDropdownHandler();
initImageGallery();
initLinearDropdowns();
initIssueForm();
renderGallery();

// ==================== Hotkey Hint ====================

const shortcutHint = document.getElementById('shortcutHint')!;

async function updateShortcutHint() {
  try {
    const result = await ipc.invoke('get-hotkey');
    if (result && result.displayHotkey) {
      // Parse display hotkey (e.g., "⌘ + ⇧ + L") into kbd elements
      const parts = result.displayHotkey.split(' + ').map((part: string) => part.trim());
      const kbdHtml = parts.map((p: string) => `<kbd>${p}</kbd>`).join(' + ');
      const hintText = await t('capture.shortcutHint', { hotkey: kbdHtml, max: 10 });
      shortcutHint.innerHTML = hintText;
    }
  } catch (error) {
    console.error('Failed to load hotkey:', error);
  }
}
updateShortcutHint();

// Listen for hotkey changes
ipc.on('hotkey-changed', async (data: any) => {
  if (data && data.displayHotkey) {
    const parts = data.displayHotkey.split(' + ').map((part: string) => part.trim());
    const kbdHtml = parts.map((p: string) => `<kbd>${p}</kbd>`).join(' + ');
    const hintText = await t('capture.shortcutHint', { hotkey: kbdHtml, max: 10 });
    shortcutHint.innerHTML = hintText;
  }
});

// ==================== Semantic Search & Related Context ====================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initSemanticSearch();
    initRelatedContext();
  });
} else {
  initSemanticSearch();
  initRelatedContext();
}
