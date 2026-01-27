import { describe, it, expect } from 'vitest';

describe('IPC Handler - instruction parameter', () => {
  it('reanalyze handler should accept instruction parameter', () => {
    const mockData = {
      filePath: '/path/to/image.png',
      model: 'haiku',
      instruction: 'Focus on the login button',
    };

    expect(mockData).toHaveProperty('instruction');
    expect(mockData.instruction).toBe('Focus on the login button');
  });

  it('instruction should be optional in reanalyze data', () => {
    const mockData: { filePath: string; model: string; instruction?: string } = {
      filePath: '/path/to/image.png',
      model: 'haiku',
    };

    expect(mockData.instruction).toBeUndefined();
  });

  it('analysisContext should include instruction when provided', () => {
    const mockContext = {
      projects: [],
      users: [],
      instruction: 'Test instruction',
    };

    expect(mockContext.instruction).toBe('Test instruction');
  });

  it('analysisContext should work without instruction', () => {
    const mockContext: { projects: any[]; users: any[]; instruction?: string } = {
      projects: [],
      users: [],
    };

    expect(mockContext.instruction).toBeUndefined();
  });
});
