/**
 * Related context section logic.
 * Extracted from inline script lines 2982-3243.
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import { escapeHtml } from '../shared/utils';
import * as state from './state';

let relatedContextSelectedItems: any[] = [];
let userModifiedSearch = false;
let relatedContextDebounceTimer: any = null;
let lastRelatedQuery = '';

// Connection status flags (checked by updateRelatedContextConnectionBanner)
let slackConnectedStatus = false;
let notionConnectedStatus = false;
let gmailConnectedStatus = false;

// Local DOM references
let relatedContextSection: HTMLElement;
let relatedContextHeader: HTMLElement;
let relatedContextSearchInput: HTMLInputElement;
let relatedContextRefreshBtn: HTMLElement;
let relatedContextLoading: HTMLElement;
let relatedContextResults: HTMLElement;
let relatedContextEmpty: HTMLElement;
let relatedContextActions: HTMLElement;
let relatedContextSelectedCount: HTMLElement;
let relatedContextInsertBtn: HTMLButtonElement;
let relatedContextBadge: HTMLElement;
let relatedContextStatus: HTMLElement;
let relatedContextNotConnected: HTMLElement;
let relatedContextOpenSettings: HTMLElement;

export function updateRelatedContextConnectionBanner() {
  const anyConnected = slackConnectedStatus || notionConnectedStatus || gmailConnectedStatus;
  if (anyConnected) {
    relatedContextNotConnected.style.display = 'none';
  } else {
    relatedContextNotConnected.style.display = 'flex';
  }
}

function triggerRelatedSearch() {
  clearTimeout(relatedContextDebounceTimer);
  relatedContextDebounceTimer = setTimeout(() => {
    const query = relatedContextSearchInput.value.trim();
    if (query === lastRelatedQuery) return;
    lastRelatedQuery = query;
    performRelatedSearch(query);
  }, 300);
}

async function performRelatedSearch(query: string) {
  if (!query || query.length < 3) {
    relatedContextResults.innerHTML = '';
    relatedContextResults.style.display = 'none';
    relatedContextLoading.style.display = 'none';
    relatedContextEmpty.style.display = 'none';
    relatedContextStatus.innerHTML = '<span>💡</span><span>' + ((await t('relatedContext.enterQuery')) || 'Enter a title or search term') + '</span>';
    return;
  }

  relatedContextLoading.style.display = 'flex';
  relatedContextResults.style.display = 'none';
  relatedContextEmpty.style.display = 'none';
  relatedContextStatus.innerHTML = '<span>🔍</span><span>Searching for "' + escapeHtml(query.substring(0, 30)) + '"...</span>';

  try {
    const result = await ipc.invoke('context.getRelated', { query, limit: 20 });
    console.log('[RelatedContext] Result:', result);

    relatedContextLoading.style.display = 'none';

    if (!result.success) {
      console.error('[RelatedContext] Error:', result.error);
      relatedContextEmpty.style.display = 'flex';
      return;
    }

    if (!result.results || result.results.length === 0) {
      relatedContextEmpty.style.display = 'flex';
      relatedContextStatus.innerHTML = '<span>🤷</span><span>' + ((await t('relatedContext.noResultsHint')) || 'Try different keywords') + '</span>';
      return;
    }

    renderRelatedResults(result.results);
    relatedContextStatus.innerHTML = '<span>✨</span><span>' + result.results.length + ' results · Edit to refine</span>';

    // Auto-expand when results found
    relatedContextSection.classList.add('expanded');
  } catch (error) {
    console.error('[RelatedContext] Error:', error);
    relatedContextLoading.style.display = 'none';
    relatedContextEmpty.style.display = 'flex';
  }
}

function renderRelatedResults(items: any[]) {
  relatedContextResults.innerHTML = '';

  items.forEach((item: any) => {
    const isSelected = relatedContextSelectedItems.some((s: any) => s.id === item.id);
    const div = document.createElement('div');
    div.className = 'related-context-result-item' + (isSelected ? ' selected' : '');
    div.dataset.id = item.id;

    const sourceClass = item.source || 'ai';
    const sourceIcons: Record<string, string> = {
      'gmail': '<span class="source-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg></span>',
      'slack': '<span class="source-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/><path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/><path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.52-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312z" fill="#2EB67D"/><path d="M15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.522 2.527 2.527 0 0 1 2.52-2.52h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z" fill="#ECB22E"/></svg></span>',
      'notion': '<span class="source-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.934-.56.934-1.166V6.354c0-.606-.233-.933-.747-.886l-15.177.887c-.56.046-.747.326-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.934-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.886.747-.933l3.222-.186zM2.877.466L16.039.014c1.635-.14 2.055.093 2.755.606l3.596 2.521c.56.373.746.466.746 1.072v17.04c0 .72-.28 1.19-1.12 1.236L6.03 23.466c-.653.046-1.025-.046-1.4-.56l-3.5-4.624c-.374-.56-.514-.98-.514-1.493V1.906c0-.653.28-1.12.98-1.16l1.281-.28z" fill="#000"/></svg></span>',
      'linear': '<span class="source-icon"><svg viewBox="0 0 24 24" fill="#5E6AD2"><path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"/></svg></span>',
      'ai': '<span class="source-icon">✨</span>'
    };
    const sourceLabel: Record<string, string> = {
      'slack': (sourceIcons['slack'] || '') + 'Slack',
      'notion': (sourceIcons['notion'] || '') + 'Notion',
      'gmail': (sourceIcons['gmail'] || '') + 'Gmail',
      'linear': (sourceIcons['linear'] || '') + 'Linear',
      'ai': (sourceIcons['ai'] || '') + 'AI'
    };
    const sourceLabelStr = sourceLabel[sourceClass] || sourceClass;

    const timeStr = item.timestamp
      ? new Date(item.timestamp).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';

    div.innerHTML = `
      <input type="checkbox" class="related-context-result-checkbox" ${isSelected ? 'checked' : ''}>
      <div class="related-context-result-content">
        <div class="related-context-result-meta">
          <span class="related-context-result-source ${sourceClass}">${sourceLabelStr}</span>
          ${timeStr ? `<span>${timeStr}</span>` : ''}
          ${item.confidence ? `<span>${Math.round(item.confidence * 100)}%</span>` : ''}
        </div>
        <div class="related-context-result-title">${escapeHtml(item.title || '')}</div>
        <div class="related-context-result-snippet">${escapeHtml(item.snippet || '')}</div>
      </div>
    `;

    div.addEventListener('click', (e) => {
      if ((e.target as HTMLInputElement).type === 'checkbox') return;
      toggleRelatedItem(item, div);
    });

    const checkbox = div.querySelector('.related-context-result-checkbox') as HTMLInputElement;
    checkbox.addEventListener('change', () => {
      toggleRelatedItem(item, div);
    });

    relatedContextResults.appendChild(div);
  });

  relatedContextResults.style.display = 'block';
  updateRelatedContextActions();
}

function toggleRelatedItem(item: any, element: HTMLElement) {
  const idx = relatedContextSelectedItems.findIndex((s: any) => s.id === item.id);
  const checkbox = element.querySelector('.related-context-result-checkbox') as HTMLInputElement;

  if (idx === -1) {
    relatedContextSelectedItems.push(item);
    element.classList.add('selected');
    checkbox.checked = true;
  } else {
    relatedContextSelectedItems.splice(idx, 1);
    element.classList.remove('selected');
    checkbox.checked = false;
  }

  updateRelatedContextActions();
}

async function updateRelatedContextActions() {
  const count = relatedContextSelectedItems.length;
  if (count > 0) {
    relatedContextActions.style.display = 'flex';
    relatedContextSelectedCount.textContent = (await t('relatedContext.selected', { count })) || `${count} selected`;
    relatedContextInsertBtn.disabled = false;
    relatedContextBadge.textContent = String(count);
    relatedContextBadge.style.display = 'inline';
  } else {
    relatedContextActions.style.display = 'none';
    relatedContextInsertBtn.disabled = true;
    relatedContextBadge.style.display = 'none';
  }
}

export function initRelatedContext() {
  // Initialize DOM references
  relatedContextSection = document.getElementById('relatedContextSection')!;
  relatedContextHeader = document.getElementById('relatedContextHeader')!;
  relatedContextSearchInput = document.getElementById('relatedContextSearchInput') as HTMLInputElement;
  relatedContextRefreshBtn = document.getElementById('relatedContextRefreshBtn')!;
  relatedContextLoading = document.getElementById('relatedContextLoading')!;
  relatedContextResults = document.getElementById('relatedContextResults')!;
  relatedContextEmpty = document.getElementById('relatedContextEmpty')!;
  relatedContextActions = document.getElementById('relatedContextActions')!;
  relatedContextSelectedCount = document.getElementById('relatedContextSelectedCount')!;
  relatedContextInsertBtn = document.getElementById('relatedContextInsertBtn') as HTMLButtonElement;
  relatedContextBadge = document.getElementById('relatedContextBadge')!;
  relatedContextStatus = document.getElementById('relatedContextStatus')!;
  relatedContextNotConnected = document.getElementById('relatedContextNotConnected')!;
  relatedContextOpenSettings = document.getElementById('relatedContextOpenSettings')!;

  // Open settings button handler
  relatedContextOpenSettings.addEventListener('click', () => {
    ipc.invoke('open-settings');
  });

  // Toggle section expand/collapse
  relatedContextHeader.addEventListener('click', () => {
    relatedContextSection.classList.toggle('expanded');
  });

  // Title -> Search sync (only when user hasn't modified search)
  state.titleInput.addEventListener('input', () => {
    if (!userModifiedSearch) {
      relatedContextSearchInput.value = state.titleInput.value;
    }
    triggerRelatedSearch();
  });

  state.titleInput.addEventListener('blur', () => {
    if (!userModifiedSearch && state.titleInput.value.trim()) {
      relatedContextSearchInput.value = state.titleInput.value;
      triggerRelatedSearch();
    }
  });

  // Search input change marks user modification
  relatedContextSearchInput.addEventListener('input', () => {
    userModifiedSearch = true;
    triggerRelatedSearch();
  });

  // Refresh button - reset to title
  relatedContextRefreshBtn.addEventListener('click', () => {
    relatedContextSearchInput.value = state.titleInput.value;
    userModifiedSearch = false;
    triggerRelatedSearch();
  });

  // Insert selected items to description
  relatedContextInsertBtn.addEventListener('click', () => {
    if (relatedContextSelectedItems.length === 0) return;

    let contextText = '\n\n---\n## Related Context\n\n';

    relatedContextSelectedItems.forEach((item: any) => {
      const sourceLabel: Record<string, string> = {
        'slack': 'Slack',
        'notion': 'Notion',
        'gmail': 'Gmail',
        'linear': 'Linear',
        'ai': 'Recommendation'
      };
      const sourceLabelStr = sourceLabel[item.source] || item.source;

      contextText += `### ${sourceLabelStr}: ${item.title}\n`;
      if (item.snippet) {
        contextText += `> ${item.snippet.replace(/\n/g, '\n> ')}\n`;
      }
      if (item.url) {
        contextText += `[View](${item.url})\n`;
      }
      contextText += '\n';
    });

    state.descInput.value = (state.descInput.value + contextText).trim();

    // Clear selection
    relatedContextSelectedItems = [];
    updateRelatedContextActions();

    // Update UI
    document.querySelectorAll('.related-context-result-item.selected').forEach(el => {
      el.classList.remove('selected');
      (el.querySelector('.related-context-result-checkbox') as HTMLInputElement).checked = false;
    });
  });
}
