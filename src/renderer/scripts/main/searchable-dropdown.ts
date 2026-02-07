/**
 * Searchable dropdown factory and close-dropdown logic.
 * Extracted from inline script lines 1976-2063.
 */

export function createSearchableSelect(config: {
  trigger: HTMLElement;
  dropdown: HTMLElement;
  searchInput: HTMLInputElement;
  optionsContainer: HTMLElement;
  hiddenInput: HTMLInputElement;
  items: any[];
  defaultLabel: string;
  getValue: (item: any) => string;
  getLabel: (item: any) => string;
  onSelect?: (value: string, label: string, item: any) => void;
}) {
  const { trigger, dropdown, searchInput, optionsContainer, hiddenInput, items, defaultLabel, getValue, getLabel, onSelect } = config;
  let currentDefaultLabel = defaultLabel;

  function render(filteredItems: any[]) {
    optionsContainer.innerHTML = '';

    // Add default option
    const defaultOpt = document.createElement('div');
    defaultOpt.className = 'option' + (hiddenInput.value === '' ? ' selected' : '');
    defaultOpt.textContent = currentDefaultLabel;
    defaultOpt.dataset.value = '';
    defaultOpt.addEventListener('click', () => selectOption('', currentDefaultLabel, null));
    optionsContainer.appendChild(defaultOpt);

    if (filteredItems.length === 0 && searchInput.value) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.textContent = 'No results found';
      optionsContainer.appendChild(noResults);
    } else {
      filteredItems.forEach(item => {
        const opt = document.createElement('div');
        opt.className = 'option' + (hiddenInput.value === getValue(item) ? ' selected' : '');
        opt.textContent = getLabel(item);
        opt.dataset.value = getValue(item);
        opt.addEventListener('click', () => selectOption(getValue(item), getLabel(item), item));
        optionsContainer.appendChild(opt);
      });
    }
  }

  function selectOption(value: string, label: string, item: any) {
    hiddenInput.value = value;
    trigger.querySelector('span')!.textContent = label;
    dropdown.classList.remove('open');
    searchInput.value = '';
    render(items);
    if (onSelect) {
      onSelect(value, label, item);
    }
  }

  function filter() {
    const query = searchInput.value.toLowerCase();
    const filtered = items.filter(item => getLabel(item).toLowerCase().includes(query));
    render(filtered);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll('.dropdown.open').forEach(d => {
      if (d !== dropdown) d.classList.remove('open');
    });
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) {
      searchInput.focus();
    }
  });

  searchInput.addEventListener('input', filter);
  searchInput.addEventListener('click', (e) => e.stopPropagation());

  return {
    render,
    selectOption,
    setItems: (newItems: any[]) => { items.length = 0; items.push(...newItems); render(items); },
    updateDefaultLabel: (newLabel: string) => {
      currentDefaultLabel = newLabel;
      // Update trigger text if default option is currently selected
      if (hiddenInput.value === '') {
        trigger.querySelector('span')!.textContent = newLabel;
      }
      render(items);
    }
  };
}

export function initCloseDropdownHandler() {
  const labelSelect = document.getElementById('labelSelect');

  document.addEventListener('click', (e) => {
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    // Close label dropdown if clicking outside
    const labelDropdown = document.getElementById('labelDropdown');
    if (labelSelect && labelDropdown && !labelSelect.contains(e.target as Node)) {
      labelDropdown.classList.remove('open');
    }
  });
}
