import { getDeviceId } from './settings-store';
import type { AnalyticsEvent, TrackRequest, TrackResponse } from '../types/context-search';

const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

export async function trackEvent(
  event: AnalyticsEvent,
  metadata?: TrackRequest['metadata']
): Promise<boolean> {
  try {
    const deviceId = getDeviceId();
    
    const response = await fetch(`${WORKER_URL}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, deviceId, metadata } as TrackRequest),
    });

    if (!response.ok) {
      console.error(`Track failed: ${response.status}`);
      return false;
    }

    const result = await response.json() as TrackResponse;
    return result.success;
  } catch (error) {
    console.error('Track error:', error);
    return false;
  }
}

export const trackAppOpen = () => trackEvent('app_open');
export const trackIssueCreated = (imageCount: number, hasContext: boolean) => 
  trackEvent('issue_created', { imageCount, hasContext });
export const trackSearchUsed = (contextSource: string) => 
  trackEvent('search_used', { contextSource });
export const trackContextLinked = (contextSource: string) => 
  trackEvent('context_linked', { contextSource });
