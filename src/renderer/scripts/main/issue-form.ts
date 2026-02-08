/**
 * Issue form handling: capture-ready, ai-analysis-ready, form submit, cancel, re-analyze, success screen.
 * Extracted from inline script lines 2323-2646.
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import * as state from './state';
import { createSearchableSelect } from './searchable-dropdown';
import { updateTeamDependentDropdowns, updateLabelsForTeam, renderLabelChips } from './linear-dropdowns';
import { renderGallery, hideImageModal } from './image-gallery';
import { setSelectOptions, setSelectValue } from '../shared/custom-select';

export function initIssueForm() {
  // Searchable select DOM elements
  const projectTrigger = document.getElementById('projectTrigger')!;
  const projectDropdown = document.getElementById('projectDropdown')!;
  const projectSearch = document.getElementById('projectSearch') as HTMLInputElement;
  const projectOptions = document.getElementById('projectOptions')!;

  const assigneeTrigger = document.getElementById('assigneeTrigger')!;
  const assigneeDropdown = document.getElementById('assigneeDropdown')!;
  const assigneeSearch = document.getElementById('assigneeSearch') as HTMLInputElement;
  const assigneeOptions = document.getElementById('assigneeOptions')!;

  // Receive capture data from main process
  ipc.on('capture-ready', async (data: any) => {
    console.log('Capture ready:', data);

    try {
      // Store teams, states, cycles, projects, users, labels for filtering
      state.setAllTeams(data.teams || []);
      state.setAllStates(data.states || []);
      state.setAllCycles(data.cycles || []);
      state.setAllProjects(data.projects || []);
      state.setAllUsers(data.users || []);
      state.setAllLabels(data.labels || []);

      console.log('AI analysis result:', { title: data.suggestedTitle, desc: data.suggestedDescription });

      // Handle multi-image data
      if (data.images && data.images.length > 0) {
        state.setImages(data.images.map((img: any) => ({ filePath: img.filePath })));
        state.setMaxImages(data.maxImages || 10);
        state.setCurrentFilePath(state.images[0].filePath);
        renderGallery();
      } else if (data.filePath) {
        // Backwards compatibility for single image
        state.setImages([{ filePath: data.filePath }]);
        state.setCurrentFilePath(data.filePath);
        renderGallery();
      }

      // Legacy (hidden)
      state.setImageUrl(data.imageUrl || '');

      // Populate teams
      const teamOpts: Array<{ value: string; label: string }> = [
        { value: '', label: 'Select team...' }
      ];
      data.teams.forEach((team: any) => {
        teamOpts.push({ value: team.id, label: `${team.name} (${team.key})` });
      });
      setSelectOptions('team', teamOpts, data.defaultTeamId || '');

      // Initialize searchable project dropdown
      const ps = createSearchableSelect({
        trigger: projectTrigger,
        dropdown: projectDropdown,
        searchInput: projectSearch,
        optionsContainer: projectOptions,
        hiddenInput: state.projectInput,
        items: state.allProjects,
        defaultLabel: 'None',
        getValue: (p: any) => p.id,
        getLabel: (p: any) => p.name,
        onSelect: (value: string, label: string, project: any) => {
          if (!value || !project) return;

          const teamIds = project.teamIds || [];
          if (teamIds.length > 0) {
            setSelectValue('team', teamIds[0]);
            updateTeamDependentDropdowns(teamIds[0]);
            updateLabelsForTeam();
          }
        }
      });
      state.setProjectSearchable(ps);
      state.projectSearchable.render(state.allProjects);

      // Initialize searchable assignee dropdown
      const as = createSearchableSelect({
        trigger: assigneeTrigger,
        dropdown: assigneeDropdown,
        searchInput: assigneeSearch,
        optionsContainer: assigneeOptions,
        hiddenInput: state.assigneeInput,
        items: state.allUsers,
        defaultLabel: 'Unassigned',
        getValue: (u: any) => u.id,
        getLabel: (u: any) => u.name
      });
      state.setAssigneeSearchable(as);
      state.assigneeSearchable.render(state.allUsers);

      // Set default assignee to token owner if available and no AI suggestion
      if (data.userInfo && !data.suggestedAssigneeId) {
        const tokenOwner = state.allUsers.find((u: any) => u.id === data.userInfo.id);
        if (tokenOwner) {
          state.assigneeSearchable.selectOption(tokenOwner.id, tokenOwner.name);
        }
      }

      // Initialize team-dependent dropdowns
      if (data.defaultTeamId) {
        updateTeamDependentDropdowns(data.defaultTeamId);
      }

      // AI 로딩 스피너 숨김 유지 (분석 시작 버튼 클릭 시 표시)
      state.aiLoadingDiv.classList.add('hidden');
      state.reanalyzeBtn.textContent = await t('capture.analysisStart');
      state.reanalyzeBtn.disabled = false;

      // Reset form state
      state.titleInput.value = '';
      state.descInput.value = '';
      (document.getElementById('userHint') as HTMLInputElement).value = '';
      setSelectValue('priority', '');
      setSelectValue('estimate', '');
      state.setSelectedLabelIds([]);
      renderLabelChips();
      state.errorDiv.textContent = '';
      state.submitBtn.disabled = false;
      state.cancelBtn.disabled = false;
      state.setIsSubmitting(false);
      state.form.style.display = 'block';
      state.loadingDiv.style.display = 'none';
      state.successScreen.classList.add('hidden');
      state.imageGallery.style.display = 'flex';
      state.aiAnalysisSection.style.display = 'block';
      state.setCreatedIssueUrl('');

      // Set default project if available
      if (data.defaultProjectId) {
        const project = state.allProjects.find((p: any) => p.id === data.defaultProjectId);
        if (project) {
          state.projectSearchable.selectOption(project.id, project.name);
        }
      }

      // Focus title input
      state.titleInput.focus();
    } catch (error) {
      console.error('Error in capture-ready handler:', error);
    }
  });

  // Handle AI analysis results (received after window is shown)
  ipc.on('ai-analysis-ready', async (data: any) => {
    console.log('AI analysis ready:', data);

    // Hide AI loading spinner
    state.aiLoadingDiv.classList.add('hidden');
    state.reanalyzeBtn.disabled = false;

    if (!data.success) {
      console.log('AI analysis failed or skipped');
      return;
    }

    // 분석 성공 시 버튼 텍스트 변경
    state.reanalyzeBtn.textContent = await t('capture.reanalyze');

    // Apply AI suggestions
    if (data.title) {
      state.titleInput.value = data.title;
      state.titleInput.select();
    }
    if (data.description) {
      state.descInput.value = data.description;
    }
    if (data.suggestedProjectId) {
      const project = state.allProjects.find((p: any) => p.id === data.suggestedProjectId);
      if (project) {
        state.projectSearchable.selectOption(project.id, project.name, project);
      }
    }
    if (data.suggestedAssigneeId) {
      const user = state.allUsers.find((u: any) => u.id === data.suggestedAssigneeId);
      if (user) {
        state.assigneeSearchable.selectOption(user.id, user.name, user);
      }
    }
    if (data.suggestedPriority) {
      setSelectValue('priority', data.suggestedPriority.toString());
    }
    if (data.suggestedEstimate) {
      setSelectValue('estimate', data.suggestedEstimate.toString());
    }
  });

  // Handle form submission
  state.form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = state.titleInput.value.trim();
    const description = state.descInput.value.trim();
    const teamId = state.teamSelect.value;
    const projectId = state.projectInput.value;
    const stateId = state.statusSelect.value;
    const priority = state.prioritySelect.value;
    const assigneeId = state.assigneeInput.value;
    const estimate = state.estimateSelect.value;
    const cycleId = state.cycleSelect.value;

    if (!title) {
      state.errorDiv.textContent = 'Title is required';
      return;
    }

    if (!teamId) {
      state.errorDiv.textContent = 'Team is required';
      return;
    }

    // Set submitting state
    state.setIsSubmitting(true);
    state.errorDiv.textContent = '';
    state.submitBtn.disabled = true;
    state.cancelBtn.disabled = true;
    state.reanalyzeBtn.disabled = true;
    state.form.style.display = 'none';
    state.loadingDiv.style.display = 'block';
    state.loadingText.textContent = await t('form.creating');
    renderGallery(); // Re-render to hide add button

    try {
      const result = await ipc.invoke('create-issue', {
        title,
        description,
        teamId,
        projectId: projectId || undefined,
        stateId: stateId || undefined,
        priority: priority ? parseInt(priority, 10) : undefined,
        assigneeId: assigneeId || undefined,
        estimate: estimate ? parseInt(estimate, 10) : undefined,
        cycleId: cycleId || undefined,
        labelIds: state.selectedLabelIds.length > 0 ? state.selectedLabelIds : undefined,
      });

      if (result.success) {
        // Success: show success screen
        state.loadingDiv.style.display = 'none';
        state.imageGallery.style.display = 'none';
        state.aiAnalysisSection.style.display = 'none';
        state.successIssueId.textContent = result.issueIdentifier || 'Issue created';
        state.setCreatedIssueUrl(result.issueUrl || '');
        state.successScreen.classList.remove('hidden');
      } else {
        state.setIsSubmitting(false);
        state.form.style.display = 'block';
        state.loadingDiv.style.display = 'none';
        state.submitBtn.disabled = false;
        state.cancelBtn.disabled = false;
        state.reanalyzeBtn.disabled = false;
        state.errorDiv.textContent = result.error || 'Failed to create issue';
        // Show partial upload warning if applicable
        if (result.uploadedCount !== undefined && result.uploadedCount < state.images.length) {
          state.errorDiv.textContent += ` (${result.uploadedCount}/${state.images.length} images uploaded)`;
        }
        renderGallery();
      }
    } catch (err: any) {
      state.setIsSubmitting(false);
      state.form.style.display = 'block';
      state.loadingDiv.style.display = 'none';
      state.submitBtn.disabled = false;
      state.cancelBtn.disabled = false;
      state.reanalyzeBtn.disabled = false;
      state.errorDiv.textContent = err.message || 'Unknown error';
      renderGallery();
    }
  });

  // Handle cancel
  state.cancelBtn.addEventListener('click', () => {
    ipc.invoke('cancel');
  });

  // Handle Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // 모달이 열려 있으면 모달만 닫기
      if (!state.imageModal.classList.contains('hidden')) {
        hideImageModal();
        return;
      }
      ipc.invoke('cancel');
    }
  });

  // Handle re-analyze button
  state.reanalyzeBtn.addEventListener('click', async () => {
    if (!state.currentFilePath) return;

    const model = state.aiModelSelect.value;
    const modelName = model === 'haiku' ? 'Claude Haiku 4.5' : 'Gemini 3 Flash';
    const instruction = (document.getElementById('userHint') as HTMLInputElement).value.trim();

    // Show loading
    state.aiLoadingText.textContent = await t('capture.reanalyzing', { model: modelName });
    state.aiLoadingDiv.classList.remove('hidden');
    state.reanalyzeBtn.disabled = true;

    try {
      await ipc.invoke('reanalyze', {
        filePath: state.currentFilePath,
        model: model,
        instruction: instruction || undefined
      });
    } catch (err) {
      console.error('Reanalyze error:', err);
      state.aiLoadingDiv.classList.add('hidden');
      state.reanalyzeBtn.disabled = false;
    }
  });

  // Success screen: View issue button
  state.viewIssueBtn.addEventListener('click', () => {
    if (state.createdIssueUrl) {
      ipc.openExternal(state.createdIssueUrl);
    }
    ipc.invoke('close-window');
  });

  // Success screen: Close button
  state.closeSuccessBtn.addEventListener('click', () => {
    ipc.invoke('close-window');
  });
}
