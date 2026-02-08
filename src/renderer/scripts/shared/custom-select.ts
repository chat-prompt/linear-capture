/**
 * Custom Select component — replaces native <select> with styled div-based dropdown.
 * Works with the .custom-select HTML structure:
 *   <div class="custom-select" data-name="fieldName">
 *     <button type="button" class="select-display" id="fieldName-display">...</button>
 *     <div class="select-options" id="fieldName-options">
 *       <div class="select-option" data-value="v">Label</div>
 *     </div>
 *     <input type="hidden" name="fieldName" id="fieldName" value="">
 *   </div>
 */

export function initCustomSelects(): void {
  document.querySelectorAll('.custom-select').forEach(container => {
    const display = container.querySelector('.select-display') as HTMLButtonElement;
    const optionsContainer = container.querySelector('.select-options') as HTMLElement;
    const hiddenInput = container.querySelector('input[type="hidden"]') as HTMLInputElement;

    if (!display || !optionsContainer || !hiddenInput) return;

    // Toggle dropdown
    display.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close all other open selects
      document.querySelectorAll('.select-options.open').forEach(el => {
        if (el !== optionsContainer) el.classList.remove('open');
      });
      optionsContainer.classList.toggle('open');
    });

    // Handle option click
    optionsContainer.addEventListener('click', (e) => {
      const option = (e.target as HTMLElement).closest('.select-option') as HTMLElement;
      if (!option) return;

      const value = option.dataset.value || '';
      const text = option.textContent || '';

      hiddenInput.value = value;
      display.textContent = text;
      display.classList.toggle('placeholder', !value);

      // Mark selected
      optionsContainer.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');

      optionsContainer.classList.remove('open');

      // Dispatch change event on the hidden input
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // Close on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.select-options.open').forEach(el => {
      el.classList.remove('open');
    });
  });
}

/**
 * Programmatically set options for a custom select (for dynamically populated selects).
 * @param selectId - The id of the hidden input element
 * @param options - Array of {value, label} to populate
 * @param selectedValue - Optional value to pre-select
 */
export function setSelectOptions(
  selectId: string,
  options: Array<{ value: string; label: string }>,
  selectedValue?: string
): void {
  const hiddenInput = document.getElementById(selectId) as HTMLInputElement;
  if (!hiddenInput) return;

  const container = hiddenInput.closest('.custom-select');
  if (!container) return;

  const optionsContainer = container.querySelector('.select-options') as HTMLElement;
  const display = container.querySelector('.select-display') as HTMLButtonElement;

  if (!optionsContainer || !display) return;

  optionsContainer.innerHTML = options
    .map(
      (opt) =>
        `<div class="select-option${opt.value === selectedValue ? ' selected' : ''}" data-value="${opt.value}">${opt.label}</div>`
    )
    .join('');

  if (selectedValue !== undefined) {
    const selected = options.find((o) => o.value === selectedValue);
    if (selected) {
      display.textContent = selected.label;
      display.classList.remove('placeholder');
      hiddenInput.value = selectedValue;
    }
  }
}

/**
 * Get the current value of a custom select.
 */
export function getSelectValue(selectId: string): string {
  const input = document.getElementById(selectId) as HTMLInputElement;
  return input?.value || '';
}

/**
 * Programmatically set the value of a custom select.
 */
export function setSelectValue(selectId: string, value: string): void {
  const hiddenInput = document.getElementById(selectId) as HTMLInputElement;
  if (!hiddenInput) return;

  const container = hiddenInput.closest('.custom-select');
  if (!container) return;

  const optionsContainer = container.querySelector('.select-options') as HTMLElement;
  const display = container.querySelector('.select-display') as HTMLButtonElement;

  hiddenInput.value = value;

  const option = optionsContainer?.querySelector(
    `.select-option[data-value="${value}"]`
  ) as HTMLElement;
  if (option && display) {
    display.textContent = option.textContent || '';
    display.classList.toggle('placeholder', !value);
    optionsContainer?.querySelectorAll('.select-option').forEach((o) => o.classList.remove('selected'));
    option.classList.add('selected');
  }
}
