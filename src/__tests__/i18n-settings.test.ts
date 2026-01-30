import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStoreInstance = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      constructor() {
        return mockStoreInstance;
      }
    },
  };
});

vi.mock('electron', () => ({
  app: {
    getLocale: vi.fn(() => 'en-US'),
    getPath: vi.fn(() => '/tmp'),
  },
}));

describe('i18n settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSupportedLanguages returns en and ko', async () => {
    const { getSupportedLanguages } = await import('../services/settings-store');
    const langs = getSupportedLanguages();
    expect(langs).toContain('en');
    expect(langs).toContain('ko');
    expect(langs).toHaveLength(2);
  });

  it('getLanguage returns stored language if valid', async () => {
    mockStoreInstance.get.mockReturnValue('ko');
    
    vi.resetModules();
    const { getLanguage } = await import('../services/settings-store');
    expect(getLanguage()).toBe('ko');
  });

  it('getLanguage falls back to system locale', async () => {
    mockStoreInstance.get.mockReturnValue(undefined);
    
    const electron = await import('electron');
    vi.mocked(electron.app.getLocale).mockReturnValue('ko-KR');
    
    const { getLanguage } = await import('../services/settings-store');
    expect(getLanguage()).toBe('ko');
  });

  it('getLanguage defaults to en for unsupported locale', async () => {
    mockStoreInstance.get.mockReturnValue(undefined);
    
    const electron = await import('electron');
    vi.mocked(electron.app.getLocale).mockReturnValue('fr-FR');
    
    const { getLanguage } = await import('../services/settings-store');
    expect(getLanguage()).toBe('en');
  });

  it('setLanguage only accepts supported languages', async () => {
    const { setLanguage } = await import('../services/settings-store');
    
    setLanguage('ko');
    expect(mockStoreInstance.set).toHaveBeenCalledWith('language', 'ko');
    
    mockStoreInstance.set.mockClear();
    setLanguage('fr');
    expect(mockStoreInstance.set).not.toHaveBeenCalled();
  });
});
