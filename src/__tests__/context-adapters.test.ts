import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import type { NotionPage } from '../services/notion-client';
import type { GmailMessage } from '../services/gmail-client';

const mockNotionService = {
  getConnectionStatus: vi.fn(),
  searchPages: vi.fn(),
};

const mockGmailService = {
  getConnectionStatus: vi.fn(),
  searchEmails: vi.fn(),
};

vi.mock('../services/notion-client', () => ({
  createNotionService: () => mockNotionService,
}));

vi.mock('../services/gmail-client', () => ({
  createGmailService: () => mockGmailService,
}));

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}));

import { NotionAdapter } from '../services/context-adapters/notion-adapter';
import { GmailAdapter } from '../services/context-adapters/gmail-adapter';

describe('NotionAdapter', () => {
  let adapter: NotionAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new NotionAdapter();
  });

  it('returns empty array when query is empty', async () => {
    const result = await adapter.fetchItems('');
    expect(result).toEqual([]);
  });

  it('returns empty array when search fails', async () => {
    mockNotionService.searchPages.mockResolvedValue({ success: false, error: 'API error' });

    const result = await adapter.fetchItems('test');
    expect(result).toEqual([]);
  });

  it('returns ContextItem[] when search succeeds', async () => {
    mockNotionService.searchPages.mockResolvedValue({
      success: true,
      pages: [{
        id: 'page-1',
        title: 'Test Page',
        url: 'https://notion.so/page-1',
        lastEditedTime: '2025-01-01T00:00:00.000Z',
        parentType: 'page',
      }],
    });

    const result = await adapter.fetchItems('test');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'page-1',
      title: 'Test Page',
      source: 'notion',
      url: 'https://notion.so/page-1',
    });
  });

  it('uses matchContext for content when available', async () => {
    mockNotionService.searchPages.mockResolvedValue({
      success: true,
      pages: [{
        id: 'p1',
        title: 'Title',
        url: 'https://notion.so/p1',
        lastEditedTime: '2025-01-01T00:00:00.000Z',
        parentType: 'page',
        matchContext: 'Context from content',
      }],
    });

    const result = await adapter.fetchItems('query');

    expect(result[0].content).toBe('Context from content');
  });

  it('falls back to title when matchContext is undefined', async () => {
    mockNotionService.searchPages.mockResolvedValue({
      success: true,
      pages: [{
        id: 'p1',
        title: 'Fallback Title',
        url: 'https://notion.so/p1',
        lastEditedTime: '2025-01-01T00:00:00.000Z',
        parentType: 'page',
      }],
    });

    const result = await adapter.fetchItems('query');

    expect(result[0].content).toBe('Fallback Title');
  });

  it('maps metadata correctly with isContentMatch', async () => {
    mockNotionService.searchPages.mockResolvedValue({
      success: true,
      pages: [{
        id: 'p1',
        title: 'Page',
        url: 'https://notion.so/p1',
        lastEditedTime: '2025-02-01T12:30:00.000Z',
        parentType: 'page',
        isContentMatch: true,
      }],
    });

    const result = await adapter.fetchItems('query');

    expect(result[0].metadata).toEqual({ isContentMatch: true });
    expect(result[0].timestamp).toBe(new Date('2025-02-01T12:30:00.000Z').getTime());
  });

  it('isConnected returns connection status', async () => {
    mockNotionService.getConnectionStatus.mockResolvedValue({ connected: true });
    expect(await adapter.isConnected()).toBe(true);

    mockNotionService.getConnectionStatus.mockResolvedValue({ connected: false });
    expect(await adapter.isConnected()).toBe(false);
  });
});

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GmailAdapter();
  });

  it('returns empty array when query is empty', async () => {
    const result = await adapter.fetchItems('');
    expect(result).toEqual([]);
  });

  it('returns empty array when search fails', async () => {
    mockGmailService.searchEmails.mockResolvedValue({ success: false, error: 'API error' });

    const result = await adapter.fetchItems('test');
    expect(result).toEqual([]);
  });

  it('returns ContextItem[] when search succeeds', async () => {
    mockGmailService.searchEmails.mockResolvedValue({
      success: true,
      messages: [{
        id: 'msg-1',
        threadId: 'thread-1',
        subject: 'Test Email',
        from: { name: 'John', email: 'john@example.com' },
        date: '2025-01-15T10:00:00.000Z',
        snippet: 'Email snippet',
      }],
    });

    const result = await adapter.fetchItems('test');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'msg-1',
      title: 'Test Email',
      source: 'gmail',
    });
  });

  it('generates correct Gmail URL format', async () => {
    mockGmailService.searchEmails.mockResolvedValue({
      success: true,
      messages: [{
        id: 'abc123xyz',
        threadId: 'thread-1',
        subject: 'Subject',
        from: { name: 'Test', email: 'test@test.com' },
        date: '2025-01-01T00:00:00.000Z',
        snippet: 'Snippet',
      }],
    });

    const result = await adapter.fetchItems('query');

    expect(result[0].url).toBe('https://mail.google.com/mail/u/0/#inbox/abc123xyz');
  });

  it('maps GmailMessage fields correctly', async () => {
    mockGmailService.searchEmails.mockResolvedValue({
      success: true,
      messages: [{
        id: 'email-456',
        threadId: 'thread-789',
        subject: 'Important Email',
        from: { name: 'Alice', email: 'alice@company.com' },
        date: '2025-02-03T09:45:00.000Z',
        snippet: 'Email body snippet...',
      }],
    });

    const result = await adapter.fetchItems('important');

    expect(result[0]).toEqual({
      id: 'email-456',
      content: 'Email body snippet...',
      title: 'Important Email',
      url: 'https://mail.google.com/mail/u/0/#inbox/email-456',
      source: 'gmail',
      timestamp: new Date('2025-02-03T09:45:00.000Z').getTime(),
      metadata: {
        from: 'alice@company.com',
        fromName: 'Alice',
        threadId: 'thread-789',
      },
    });
  });

  it('isConnected returns connection status', async () => {
    mockGmailService.getConnectionStatus.mockResolvedValue({ connected: true });
    expect(await adapter.isConnected()).toBe(true);

    mockGmailService.getConnectionStatus.mockResolvedValue({ connected: false });
    expect(await adapter.isConnected()).toBe(false);
  });
});
