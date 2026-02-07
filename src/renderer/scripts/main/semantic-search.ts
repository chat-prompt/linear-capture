/**
 * Semantic search section logic.
 * Extracted from inline script lines 2685-2980.
 */
import { ipc } from '../shared/ipc';
import { escapeHtml } from '../shared/utils';

let semantic_selectedResults = new Set<number>();
let semantic_currentResults: any[] = [];
let semantic_searchDebounceTimer: any = null;

const SEMANTIC_DEBOUNCE_MS = 500;
const SEMANTIC_MIN_QUERY_LENGTH = 3;

export function initSemanticSearch() {
  const section = document.getElementById('semanticSearchSection');
  const header = document.getElementById('semanticSearchHeader');
  const searchInput = document.getElementById('semanticSearchInput') as HTMLInputElement | null;
  const searchBtn = document.getElementById('semanticSearchBtn');
  const titleInputForSemantic = document.getElementById('title') as HTMLInputElement | null;

  if (!section || !header) return;

  header.addEventListener('click', () => toggleSemanticSection(section));

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const query = searchInput?.value?.trim();
      if (query && query.length >= SEMANTIC_MIN_QUERY_LENGTH) {
        performSemanticSearch(query);
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query && query.length >= SEMANTIC_MIN_QUERY_LENGTH) {
          performSemanticSearch(query);
        }
      }
    });
  }

  if (titleInputForSemantic) {
    titleInputForSemantic.addEventListener('blur', () => {
      const query = titleInputForSemantic.value.trim();
      if (query && query.length >= SEMANTIC_MIN_QUERY_LENGTH) {
        clearTimeout(semantic_searchDebounceTimer);
        semantic_searchDebounceTimer = setTimeout(() => {
          if (searchInput) {
            searchInput.value = query;
          }
          performSemanticSearch(query);
        }, SEMANTIC_DEBOUNCE_MS);
      }
    });
  }

  const insertBtn = document.getElementById('semanticInsertBtn');
  if (insertBtn) {
    insertBtn.addEventListener('click', insertSelectedToDescription);
  }
}

export function toggleSemanticSection(section?: HTMLElement | null) {
  if (!section) {
    section = document.getElementById('semanticSearchSection');
  }
  if (section) {
    section.classList.toggle('expanded');
  }
}

export async function performSemanticSearch(query: string) {
  console.log('[SemanticSearch:JS] performSemanticSearch called with query:', query);

  const loadingEl = document.getElementById('semanticLoading');
  const resultsEl = document.getElementById('semanticResults');
  const emptyEl = document.getElementById('semanticEmpty');
  const actionsEl = document.getElementById('semanticActions');
  const autoStatusEl = document.getElementById('semanticAutoStatus');
  const badgeEl = document.getElementById('semanticBadge');
  const section = document.getElementById('semanticSearchSection');

  if (autoStatusEl) autoStatusEl.style.display = 'none';
  if (loadingEl) loadingEl.style.display = 'flex';
  if (resultsEl) resultsEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';
  if (actionsEl) actionsEl.style.display = 'none';

  if (section && !section.classList.contains('expanded')) {
    section.classList.add('expanded');
  }

  semantic_selectedResults.clear();
  semantic_currentResults = [];

  try {
    console.log('[SemanticSearch:JS] electronAPI:', ipc ? 'available' : 'NOT available');
    if (!ipc) {
      console.error('[SemanticSearch:JS] electronAPI not available');
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) {
        emptyEl.textContent = 'IPC not available. Please restart the app.';
        emptyEl.style.display = 'block';
      }
      return;
    }

    console.log('[SemanticSearch:JS] Calling ipc.invoke...');
    const result = await ipc.invoke('context-semantic-search', {
      query: query,
      source: 'slack'
    });
    console.log('[SemanticSearch:JS] ipc.invoke returned:', result);

    if (loadingEl) loadingEl.style.display = 'none';

    if (result.notConnected) {
      if (emptyEl) {
        emptyEl.textContent = 'Slack not connected. Connect in Settings first.';
        emptyEl.style.display = 'block';
      }
      if (badgeEl) badgeEl.style.display = 'none';
    } else if (result.success && result.results && result.results.length > 0) {
      semantic_currentResults = result.results;
      renderSemanticResults(result.results);
      if (resultsEl) resultsEl.style.display = 'block';
      if (actionsEl) actionsEl.style.display = 'flex';
      if (badgeEl) {
        badgeEl.textContent = result.results.length;
        badgeEl.style.display = 'inline';
      }
    } else {
      if (emptyEl) {
        emptyEl.textContent = 'No related documents found';
        emptyEl.style.display = 'block';
      }
      if (badgeEl) badgeEl.style.display = 'none';
    }
  } catch (error) {
    console.error('Semantic search error:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    if (badgeEl) badgeEl.style.display = 'none';
  }
}

export function renderSemanticResults(results: any[]) {
  const resultsEl = document.getElementById('semanticResults');
  if (!resultsEl) return;

  resultsEl.innerHTML = '';

  results.forEach((item: any, index: number) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'semantic-result-item';
    itemEl.dataset.index = String(index);

    const sourceIcon = getSemanticSourceIcon(item.source);
    const scorePercent = Math.round((item.score || 0) * 100);
    const title = item.title || '';
    const content = item.content || '';
    const displayText = title || content.substring(0, 100);

    itemEl.innerHTML = `
      <input type="checkbox" class="semantic-result-checkbox" data-index="${index}">
      <div class="semantic-result-content">
        <div class="semantic-result-meta">
          <span class="semantic-result-source ${item.source}">${sourceIcon} ${capitalizeFirstSemantic(item.source)}</span>
          <span class="semantic-result-score">${scorePercent}% match</span>
        </div>
        ${title ? `<div class="semantic-result-title">${escapeHtmlSemantic(title)}</div>` : ''}
        <div class="semantic-result-text">${escapeHtmlSemantic(content)}</div>
      </div>
    `;

    const checkbox = itemEl.querySelector('.semantic-result-checkbox') as HTMLInputElement;

    itemEl.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      toggleSemanticResultSelection(index, checkbox.checked, itemEl);
    });

    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleSemanticResultSelection(index, checkbox.checked, itemEl);
    });

    resultsEl.appendChild(itemEl);
  });

  updateSemanticSelectedCount();
}

export function toggleSemanticResultSelection(index: number, isSelected: boolean, itemEl: HTMLElement) {
  if (isSelected) {
    semantic_selectedResults.add(index);
    itemEl.classList.add('selected');
  } else {
    semantic_selectedResults.delete(index);
    itemEl.classList.remove('selected');
  }
  updateSemanticSelectedCount();
}

export function updateSemanticSelectedCount() {
  const countEl = document.getElementById('semanticSelectedCount');
  const insertBtn = document.getElementById('semanticInsertBtn') as HTMLButtonElement | null;
  const count = semantic_selectedResults.size;

  if (countEl) {
    countEl.textContent = `${count} selected`;
  }
  if (insertBtn) {
    insertBtn.disabled = count === 0;
  }
}

export function insertSelectedToDescription() {
  if (semantic_selectedResults.size === 0) return;

  const descriptionEl = document.getElementById('description') as HTMLTextAreaElement | null;
  if (!descriptionEl) return;

  const items = Array.from(semantic_selectedResults)
    .map(index => semantic_currentResults[index])
    .filter(Boolean);

  if (items.length === 0) return;

  let markdown = '\n\n### Related Context\n';

  items.forEach((item: any) => {
    const sourceLabel = capitalizeFirstSemantic(item.source);
    const displayText = (item.title || item.content || '').substring(0, 60);
    const cleanText = displayText.replace(/\n/g, ' ').trim();

    if (item.url) {
      markdown += `- [${sourceLabel}] ${cleanText}... ([View](${item.url}))\n`;
    } else {
      markdown += `- [${sourceLabel}] ${cleanText}...\n`;
    }
  });

  const currentValue = descriptionEl.value || '';
  descriptionEl.value = currentValue + markdown;

  semantic_selectedResults.clear();
  const resultsEl = document.getElementById('semanticResults');
  if (resultsEl) {
    resultsEl.querySelectorAll('.semantic-result-item').forEach(item => {
      item.classList.remove('selected');
      const checkbox = item.querySelector('.semantic-result-checkbox') as HTMLInputElement;
      if (checkbox) checkbox.checked = false;
    });
  }
  updateSemanticSelectedCount();

  const section = document.getElementById('semanticSearchSection');
  if (section) {
    section.classList.remove('expanded');
  }
}

export function getSemanticSourceIcon(source: string): string {
  const icons: Record<string, string> = {
    slack: '💬',
    notion: '📝',
    gmail: '📧'
  };
  return icons[source] || '📄';
}

export function capitalizeFirstSemantic(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function escapeHtmlSemantic(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
