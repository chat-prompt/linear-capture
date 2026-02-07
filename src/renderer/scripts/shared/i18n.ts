/**
 * i18n helper functions for renderer pages
 */
import { ipc } from './ipc';

export async function t(key: string, options: Record<string, any> = {}): Promise<string> {
  return await ipc.invoke('translate', key, options);
}

export async function translatePage(): Promise<void> {
  const elements = document.querySelectorAll('[data-i18n]');
  for (const el of elements) {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = await t(key);
  }
  const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
  for (const el of placeholders) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) (el as HTMLInputElement).placeholder = await t(key);
  }
}

export async function autoTranslate(skipNoTranslate = true): Promise<void> {
  const reverseMap = await ipc.invoke('get-reverse-translation-map');

  const walker = document.createTreeWalker(
    document.body, NodeFilter.SHOW_TEXT, null
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (skipNoTranslate && node.parentElement && node.parentElement.closest('[data-no-translate]')) {
      continue;
    }
    const text = node.textContent?.trim();
    if (text && reverseMap[text]) {
      node.textContent = await t(reverseMap[text]);
    }
  }

  for (const el of document.querySelectorAll('[placeholder]')) {
    if (skipNoTranslate && el.closest('[data-no-translate]')) {
      continue;
    }
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && reverseMap[placeholder]) {
      (el as HTMLInputElement).placeholder = await t(reverseMap[placeholder]);
    }
  }
}
