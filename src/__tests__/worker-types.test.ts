import { describe, it, expect } from 'vitest';

describe('Worker Types - instruction field', () => {
  it('PromptContext should have optional instruction field', () => {
    const context: any = {
      projects: [{ id: '1', name: 'Test Project' }],
      users: [{ id: 'user1', name: 'John Doe' }],
      instruction: 'Custom instruction for analysis',
    };

    expect(context.instruction).toBe('Custom instruction for analysis');
  });

  it('PromptContext instruction field should be optional', () => {
    const context: any = {
      projects: [{ id: '1', name: 'Test Project' }],
    };

    expect(context.instruction).toBeUndefined();
  });

  it('AnalysisRequest should accept instruction field', () => {
    const request: any = {
      images: [{ data: 'base64data', mimeType: 'image/png' }],
      context: {
        projects: [{ id: '1', name: 'Test' }],
        instruction: 'Analyze this screenshot',
      },
      instruction: 'Top-level instruction',
      model: 'haiku',
    };

    expect(request.instruction).toBe('Top-level instruction');
    expect(request.context.instruction).toBe('Analyze this screenshot');
  });

  it('AnalysisRequest instruction should be optional', () => {
    const request: any = {
      images: [{ data: 'base64data', mimeType: 'image/png' }],
      context: {
        projects: [{ id: '1', name: 'Test' }],
      },
    };

    expect(request.instruction).toBeUndefined();
  });
});
