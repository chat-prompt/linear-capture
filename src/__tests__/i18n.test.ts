import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('i18n Infrastructure', () => {
  it('should have i18next installed', async () => {
    const i18next = await import('i18next');
    expect(i18next.default).toBeDefined();
  });

  it('should have translation files', () => {
    const enPath = path.join(process.cwd(), 'locales/en/translation.json');
    const koPath = path.join(process.cwd(), 'locales/ko/translation.json');
    expect(fs.existsSync(enPath)).toBe(true);
    expect(fs.existsSync(koPath)).toBe(true);
  });

  it('should have valid JSON in translation files', () => {
    const enPath = path.join(process.cwd(), 'locales/en/translation.json');
    const koPath = path.join(process.cwd(), 'locales/ko/translation.json');
    
    const enContent = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    const koContent = JSON.parse(fs.readFileSync(koPath, 'utf-8'));
    
    expect(enContent.app.name).toBe('Linear Capture');
    expect(koContent.app.name).toBe('Linear Capture');
  });
});
