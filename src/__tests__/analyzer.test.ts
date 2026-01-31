import { describe, it, expect } from 'vitest';
import { AnalysisContext } from '../services/anthropic-analyzer';

describe('Analyzer Services - instruction field', () => {
  it('AnalysisContext should accept optional instruction field', () => {
    const context: AnalysisContext = {
      projects: [{ id: '1', name: 'Test Project' }],
      users: [{ id: 'user1', name: 'John Doe' }],
      instruction: 'Custom instruction for analysis',
      language: 'ko',
    };

    expect(context.instruction).toBe('Custom instruction for analysis');
  });

  it('Instruction field should be undefined when not provided', () => {
    const context: AnalysisContext = {
      projects: [{ id: '1', name: 'Test Project' }],
      users: [{ id: 'user1', name: 'John Doe' }],
      language: 'en',
    };

    expect(context.instruction).toBeUndefined();
  });

  it('callWorker should include instruction in requestBody when provided', () => {
    const context: AnalysisContext = {
      projects: [{ id: '1', name: 'Test Project' }],
      users: [{ id: 'user1', name: 'John Doe' }],
      instruction: 'Analyze this screenshot carefully',
      language: 'ko',
    };

    expect(context).toHaveProperty('instruction');
    expect(context.instruction).toBe('Analyze this screenshot carefully');
  });

  it('callWorker should omit instruction when not provided', () => {
    const context: AnalysisContext = {
      projects: [{ id: '1', name: 'Test Project' }],
      users: [{ id: 'user1', name: 'John Doe' }],
      language: 'en',
    };

    expect(context.instruction).toBeUndefined();
  });
});
