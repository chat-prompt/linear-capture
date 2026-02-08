/**
 * Custom dialog component — replaces native confirm() and alert()
 */

interface DialogOptions {
  title?: string;
  message: string;
  type?: 'confirm' | 'alert' | 'danger';
  confirmText?: string;
  cancelText?: string;
}

let dialogResolve: ((value: boolean) => void) | null = null;

function getOrCreateDialog(): HTMLElement {
  let overlay = document.getElementById('customDialog');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'customDialog';
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-body">
          <div class="dialog-title" id="dialogTitle"></div>
          <div class="dialog-message" id="dialogMessage"></div>
        </div>
        <div class="dialog-actions" id="dialogActions"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close on overlay click (outside the dialog box)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog(false);
      }
    });
  }
  return overlay;
}

function closeDialog(result: boolean): void {
  const overlay = document.getElementById('customDialog');
  if (overlay) {
    overlay.classList.remove('open');
  }
  // Remove ESC listener
  document.removeEventListener('keydown', handleEsc);
  if (dialogResolve) {
    dialogResolve(result);
    dialogResolve = null;
  }
}

function handleEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeDialog(false);
  }
}

export function showConfirm(options: DialogOptions): Promise<boolean> {
  const overlay = getOrCreateDialog();
  const title = document.getElementById('dialogTitle')!;
  const message = document.getElementById('dialogMessage')!;
  const actions = document.getElementById('dialogActions')!;

  title.textContent = options.title || '';
  title.style.display = options.title ? 'block' : 'none';
  message.textContent = options.message;

  const isDanger = options.type === 'danger';
  const confirmClass = isDanger ? 'dialog-btn-danger' : 'dialog-btn-confirm';

  actions.innerHTML = `
    <button class="dialog-btn dialog-btn-cancel" id="dialogCancel">${options.cancelText || 'Cancel'}</button>
    <button class="dialog-btn ${confirmClass}" id="dialogConfirm">${options.confirmText || 'OK'}</button>
  `;

  document.getElementById('dialogCancel')!.addEventListener('click', () => closeDialog(false));
  document.getElementById('dialogConfirm')!.addEventListener('click', () => closeDialog(true));

  overlay.classList.add('open');

  // Listen for ESC key
  document.addEventListener('keydown', handleEsc);

  // Focus the confirm button for keyboard accessibility
  document.getElementById('dialogConfirm')!.focus();

  return new Promise<boolean>(resolve => {
    dialogResolve = resolve;
  });
}

export function showAlert(options: DialogOptions): Promise<void> {
  const overlay = getOrCreateDialog();
  const title = document.getElementById('dialogTitle')!;
  const message = document.getElementById('dialogMessage')!;
  const actions = document.getElementById('dialogActions')!;

  title.textContent = options.title || '';
  title.style.display = options.title ? 'block' : 'none';
  message.textContent = options.message;

  actions.innerHTML = `
    <button class="dialog-btn dialog-btn-ok" id="dialogOk">${options.confirmText || 'OK'}</button>
  `;

  document.getElementById('dialogOk')!.addEventListener('click', () => closeDialog(true));

  overlay.classList.add('open');

  // Listen for ESC key
  document.addEventListener('keydown', handleEsc);

  // Focus the OK button for keyboard accessibility
  document.getElementById('dialogOk')!.focus();

  return new Promise<void>(resolve => {
    dialogResolve = () => resolve();
  });
}
