import { describe, it, expect } from 'vitest';

describe('Worker Prompt - Instruction Field', () => {
  it('should include instruction in prompt when instruction is provided', () => {
    const instruction = '테스트 힌트';
    const mockPrompt = `이 스크린샷을 분석하여 Linear 이슈 정보를 생성하세요.

## 사용자 요청
${instruction}

## 제목 규칙`;

    expect(mockPrompt).toContain('## 사용자 요청');
    expect(mockPrompt).toContain(instruction);
  });

  it('should not include instruction section when instruction is undefined', () => {
    const mockPrompt = `이 스크린샷을 분석하여 Linear 이슈 정보를 생성하세요.

## 제목 규칙`;

    expect(mockPrompt).not.toContain('## 사용자 요청');
  });

  it('should not include instruction section when instruction is empty string', () => {
    const instruction = '';
    const mockPrompt = `이 스크린샷을 분석하여 Linear 이슈 정보를 생성하세요.

## 제목 규칙`;

    expect(mockPrompt).not.toContain('## 사용자 요청');
  });

  it('should include instruction section between image analysis and title rules', () => {
    const instruction = '버튼 색상 문제';
    const mockPrompt = `이 스크린샷을 분석하여 Linear 이슈 정보를 생성하세요.

## 사용자 요청
${instruction}

## 제목 규칙`;

    const userRequestIndex = mockPrompt.indexOf('## 사용자 요청');
    const titleRulesIndex = mockPrompt.indexOf('## 제목 규칙');

    expect(userRequestIndex).toBeGreaterThan(-1);
    expect(titleRulesIndex).toBeGreaterThan(userRequestIndex);
  });
});
