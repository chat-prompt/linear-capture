/**
 * Linear dropdown logic: labels, estimates, team-dependent dropdowns, searchable selects init.
 * Extracted from inline script lines 2065-2321 + 2500-2504.
 */
import * as state from './state';
import { setSelectOptions } from '../shared/custom-select';
import { ipc } from '../shared/ipc';
import { tBatch } from '../shared/i18n';

let strings = {
  noLabels: 'No labels found',
  addLabels: '+ Add labels...',
  point: 'point',
  points: 'points',
  current: 'Current',
  upcoming: 'Upcoming',
  previous: 'Previous',
  noResults: 'No results found'
};
let currentLocale = 'en';
const localeMap: Record<string, string> = { en: 'en-US', ko: 'ko-KR', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };

export async function preloadDropdownTexts() {
  const results = await tBatch([
    { key: 'dropdown.noResults' },
    { key: 'form.labelsAdd' },
    { key: 'estimate.point' },
    { key: 'estimate.points' },
    { key: 'cycle.current' },
    { key: 'cycle.upcoming' },
    { key: 'cycle.previous' }
  ]);
  strings = {
    noLabels: results[0],
    addLabels: results[1],
    point: results[2],
    points: results[3],
    current: results[4],
    upcoming: results[5],
    previous: results[6],
    noResults: results[0]
  };
  try { currentLocale = await ipc.invoke('get-language'); } catch { /* keep default */ }
}

// Local DOM references for label elements
let labelChipsContainer: HTMLElement;
let labelDropdown: HTMLElement;
let labelSearchInput: HTMLInputElement;
let labelOptions: HTMLElement;

// ==================== Label Multi-Select Logic ====================

export function renderLabelOptions() {
  const query = labelSearchInput.value.toLowerCase();
  const selectedTeamId = state.teamSelect.value;

  // Filter labels: show workspace labels + selected team's labels
  const filteredLabels = state.allLabels.filter((label: any) => {
    const matchesSearch = label.name.toLowerCase().includes(query);
    const matchesTeam = !label.teamId || label.teamId === selectedTeamId;
    return matchesSearch && matchesTeam;
  });

  labelOptions.innerHTML = '';

  if (filteredLabels.length === 0) {
    labelOptions.innerHTML = `<div class="label-no-results">${strings.noLabels}</div>`;
    return;
  }

  filteredLabels.forEach((label: any) => {
    const isSelected = state.selectedLabelIds.includes(label.id);
    const option = document.createElement('div');
    option.className = 'label-option' + (isSelected ? ' selected' : '');
    option.innerHTML = `
      <span class="label-option-color" style="background-color: ${label.color}"></span>
      <span class="label-option-name">${label.name}</span>
      ${isSelected ? '<span class="label-option-check">✓</span>' : ''}
    `;
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLabel(label.id);
    });
    labelOptions.appendChild(option);
  });
}

export function toggleLabel(labelId: string) {
  const idx = state.selectedLabelIds.indexOf(labelId);
  if (idx === -1) {
    state.selectedLabelIds.push(labelId);
  } else {
    state.selectedLabelIds.splice(idx, 1);
  }
  renderLabelChips();
  renderLabelOptions();
}

export function renderLabelChips() {
  // Clear container except empty hint
  labelChipsContainer.innerHTML = '';

  if (state.selectedLabelIds.length === 0) {
    labelChipsContainer.innerHTML = `<span class="label-empty-hint">${strings.addLabels}</span>`;
    return;
  }

  state.selectedLabelIds.forEach((labelId: string) => {
    const label = state.allLabels.find((l: any) => l.id === labelId);
    if (!label) return;

    const chip = document.createElement('span');
    chip.className = 'label-chip';
    chip.innerHTML = `
      <span class="label-chip-color" style="background-color: ${label.color}"></span>
      ${label.name}
      <button type="button" class="label-chip-remove" data-id="${label.id}">×</button>
    `;
    labelChipsContainer.appendChild(chip);
  });

  // Add "+ Add" button at the end
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'label-add-btn';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    labelDropdown.classList.add('open');
    labelSearchInput.focus();
    renderLabelOptions();
  });
  labelChipsContainer.appendChild(addBtn);
}

// Re-render labels when team changes
export function updateLabelsForTeam() {
  // Remove labels that don't belong to the new team
  const selectedTeamId = state.teamSelect.value;
  state.setSelectedLabelIds(state.selectedLabelIds.filter((labelId: string) => {
    const label = state.allLabels.find((l: any) => l.id === labelId);
    return label && (!label.teamId || label.teamId === selectedTeamId);
  }));
  renderLabelChips();
  renderLabelOptions();
}

// Generate estimate options based on team settings
export function getEstimateOptions(team: any) {
  if (!team || team.issueEstimationType === 'notUsed') {
    return [];
  }

  const type = team.issueEstimationType;
  const allowZero = team.issueEstimationAllowZero;
  const extended = team.issueEstimationExtended;

  let options: { value: number; label: string }[] = [];

  if (type === 'fibonacci') {
    // Linear default fibonacci scale
    if (allowZero) options.push({ value: 0, label: '0' });
    if (extended) options.push({ value: 0.5, label: '0.5' });
    options.push(
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
      { value: 5, label: '5' },
      { value: 8, label: '8' }
    );
    if (extended) {
      options.push(
        { value: 13, label: '13' },
        { value: 21, label: '21' }
      );
    }
  } else if (type === 'exponential') {
    if (allowZero) options.push({ value: 0, label: '0' });
    options.push(
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 4, label: '4' },
      { value: 8, label: '8' },
      { value: 16, label: '16' }
    );
    if (extended) {
      options.push({ value: 32, label: '32' });
    }
  } else if (type === 'linear') {
    if (allowZero) options.push({ value: 0, label: '0' });
    for (let i = 1; i <= (extended ? 10 : 5); i++) {
      options.push({ value: i, label: String(i) });
    }
  } else if (type === 'tShirt') {
    // T-shirt sizes mapped to numbers
    if (allowZero) options.push({ value: 0, label: 'None' });
    options.push(
      { value: 1, label: 'XS' },
      { value: 2, label: 'S' },
      { value: 3, label: 'M' },
      { value: 5, label: 'L' },
      { value: 8, label: 'XL' }
    );
    if (extended) {
      options.push({ value: 13, label: 'XXL' });
    }
  }

  return options;
}

// Update estimate dropdown based on team
export function updateEstimateDropdown(teamId: string) {
  const team = state.allTeams.find((t: any) => t.id === teamId);
  const estOptions = getEstimateOptions(team);

  const selectOpts: Array<{ value: string; label: string }> = [
    { value: '', label: 'None' }
  ];
  estOptions.forEach(opt => {
    const suffix = (opt.value !== 0 && typeof opt.value === 'number' && opt.label !== 'None' && !isNaN(Number(opt.label)))
      ? ` ${opt.value !== 1 ? strings.points : strings.point}`
      : '';
    selectOpts.push({ value: String(opt.value), label: opt.label + suffix });
  });

  setSelectOptions('estimate', selectOpts, '');
}

// Update status, cycle, and estimate dropdowns based on selected team
export function updateTeamDependentDropdowns(teamId: string) {
  // Update status dropdown (default to Todo)
  const teamStates = state.allStates.filter((s: any) => s.teamId === teamId);
  const todoState = teamStates.find((s: any) => s.name === 'Todo');
  const defaultStatusId = todoState ? todoState.id : '';

  const statusOpts = teamStates.map((s: any) => ({
    value: s.id,
    label: s.name
  }));
  setSelectOptions('status', statusOpts, defaultStatusId);

  // Update cycle dropdown
  const now = new Date();
  const cycleOpts: Array<{ value: string; label: string }> = [
    { value: '', label: 'None' }
  ];
  state.allCycles
    .filter((cycle: any) => cycle.teamId === teamId)
    .forEach((cycle: any) => {
      const startDate = new Date(cycle.startsAt);
      const endDate = new Date(cycle.endsAt);
      const formatDate = (d: Date) => new Intl.DateTimeFormat(localeMap[currentLocale] || currentLocale, { month: 'short', day: 'numeric' }).format(d);

      let status = '';
      if (now >= startDate && now <= endDate) {
        status = strings.current;
      } else if (startDate > now) {
        status = strings.upcoming;
      } else {
        status = strings.previous;
      }

      cycleOpts.push({
        value: cycle.id,
        label: `Cycle ${cycle.number} (${formatDate(startDate)} - ${formatDate(endDate)}) \u{B7} ${status}`
      });
    });
  setSelectOptions('cycle', cycleOpts, '');

  // Update estimate dropdown
  updateEstimateDropdown(teamId);
}

export function initLinearDropdowns() {
  // Get label DOM elements
  const labelSelect = document.getElementById('labelSelect')!;
  labelChipsContainer = document.getElementById('labelChipsContainer')!;
  labelDropdown = document.getElementById('labelDropdown')!;
  labelSearchInput = document.getElementById('labelSearchInput') as HTMLInputElement;
  labelOptions = document.getElementById('labelOptions')!;

  // Toggle label dropdown
  labelChipsContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    labelDropdown.classList.toggle('open');
    if (labelDropdown.classList.contains('open')) {
      labelSearchInput.focus();
      renderLabelOptions();
    }
  });

  // Label search
  labelSearchInput.addEventListener('input', () => {
    renderLabelOptions();
  });
  labelSearchInput.addEventListener('click', (e) => e.stopPropagation());

  // Remove label chip via event delegation
  labelChipsContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('label-chip-remove')) {
      e.stopPropagation();
      const labelId = (target as HTMLButtonElement).dataset.id!;
      toggleLabel(labelId);
    }
  });

  // Update dropdowns when team changes
  state.teamSelect.addEventListener('change', () => {
    updateTeamDependentDropdowns(state.teamSelect.value);
    updateLabelsForTeam();
  });

  preloadDropdownTexts();
  ipc.on('language-changed', () => { preloadDropdownTexts(); });
}

