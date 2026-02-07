import { app } from 'electron';
import { getDeviceId } from './settings-store';
import type { AnalyticsEvent, TrackRequest, TrackResponse } from '../types/context-search';
import { logger } from './utils/logger';
import { WORKER_BASE_URL } from './config';
const MAX_MESSAGE_LENGTH = 200;

function truncate(str: string, maxLength: number): string {
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
}

export async function trackEvent(
  event: AnalyticsEvent,
  metadata?: Omit<TrackRequest['metadata'], 'version'>
): Promise<boolean> {
   try {
     const deviceId = getDeviceId();
     const version = app.getVersion();
     logger.log(`[ANALYTICS] Sending: ${event}`, { deviceId, metadata: { ...metadata, version } });
     
     const response = await fetch(`${WORKER_BASE_URL}/track`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ 
         event, 
         deviceId, 
         metadata: { ...metadata, version } 
       } as TrackRequest),
     });

     if (!response.ok) {
       logger.error(`Track failed: ${response.status}`);
       return false;
     }

     const result = await response.json() as TrackResponse;
     return result.success;
   } catch (error) {
     logger.error('Track error:', error);
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

export const trackApiError = (errorType: string, message: string, statusCode?: number) =>
  trackEvent('api_error', { errorType, message: truncate(message, MAX_MESSAGE_LENGTH), statusCode });
export const trackCaptureFailed = (errorType: string, message: string) =>
  trackEvent('capture_failed', { errorType, message: truncate(message, MAX_MESSAGE_LENGTH) });
export const trackAnalysisFailed = (errorType: string, message: string) =>
  trackEvent('analysis_failed', { errorType, message: truncate(message, MAX_MESSAGE_LENGTH) });
