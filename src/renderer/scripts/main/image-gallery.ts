/**
 * Image gallery and modal logic.
 * Extracted from inline script lines 1846-1946.
 */
import { ipc } from '../shared/ipc';
import { t } from '../shared/i18n';
import * as state from './state';

export function showImageModal(src: string) {
  state.modalImage.src = src;
  state.imageModal.classList.remove('hidden');
  // 모달이 열리면 신호등 숨기기
  ipc.invoke('set-traffic-lights-visible', false);
}

export function hideImageModal() {
  state.imageModal.classList.add('hidden');
  state.modalImage.src = '';
  // 모달이 닫히면 신호등 다시 표시
  ipc.invoke('set-traffic-lights-visible', true);
}

// Render image gallery
export async function renderGallery() {
  state.imageGallery.innerHTML = '';

  // Render existing images
  state.images.forEach((img, idx) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    // Disable remove button during submission
    const removeDisabled = state.isSubmitting ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
    item.innerHTML = `
      <img class="gallery-thumb" src="file://${img.filePath}" alt="Screenshot ${idx + 1}" />
      <span class="gallery-index">${idx + 1}</span>
      <button class="gallery-remove" data-index="${idx}" title="Remove image" ${removeDisabled}>×</button>
    `;
    // 썸네일 클릭 시 모달로 확대 보기
    const thumb = item.querySelector('.gallery-thumb')!;
    thumb.addEventListener('click', () => {
      if (!state.isSubmitting) {
        showImageModal(`file://${img.filePath}`);
      }
    });
    state.imageGallery.appendChild(item);
  });

  // Add "+" button if under limit and not submitting
  if (state.images.length < state.maxImages && !state.isSubmitting) {
    const addBtn = document.createElement('div');
    addBtn.className = 'gallery-item gallery-add';
    const labelText = state.images.length === 0
      ? await t('capture.captureButton')
      : await t('capture.addMore', { current: state.images.length, max: state.maxImages });
    addBtn.innerHTML = `
      <span class="gallery-add-icon">${state.images.length === 0 ? '📸' : '+'}</span>
      <span class="gallery-add-text">${labelText}</span>
    `;
    addBtn.addEventListener('click', requestAddCapture);
    state.imageGallery.appendChild(addBtn);
  }

  // Update first image as currentFilePath for re-analysis
  if (state.images.length > 0) {
    state.setCurrentFilePath(state.images[0].filePath);
  }
}

// Request additional capture via IPC
export function requestAddCapture() {
  if (state.isSubmitting) return;
  ipc.invoke('add-capture');
}

export function initImageGallery() {
  // Modal close handlers
  const modalClose = state.imageModal.querySelector('.modal-close')!;
  const modalBackdrop = state.imageModal.querySelector('.modal-backdrop')!;

  modalClose.addEventListener('click', (e) => {
    e.stopPropagation();
    hideImageModal();
  });
  modalBackdrop.addEventListener('click', (e) => {
    e.stopPropagation();
    hideImageModal();
  });
  // 모달 컨텐츠 클릭 시 이벤트 전파 방지 (배경으로 전달 안 되게)
  state.imageModal.querySelector('.modal-content')!.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Handle remove button clicks via event delegation
  state.imageGallery.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('gallery-remove') && !state.isSubmitting) {
      const index = parseInt((target as HTMLButtonElement).dataset.index!);
      ipc.invoke('remove-capture', { index });
    }
  });

  // Handle new image added
  ipc.on('capture-added', (data: any) => {
    console.log('Capture added:', data);
    state.images.push({ filePath: data.filePath });
    state.setMaxImages(data.canAddMore ? state.maxImages : state.images.length);
    renderGallery();
  });

  // Handle image removed
  ipc.on('capture-removed', (data: any) => {
    console.log('Capture removed:', data);
    state.images.splice(data.index, 1);
    renderGallery();
  });
}
