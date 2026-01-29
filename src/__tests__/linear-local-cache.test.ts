import { describe, it, expect } from 'vitest';
import type { LocalCacheData, LocalCacheProject } from '../services/linear-local-cache';

describe('Linear Local Cache - Types and Interfaces', () => {
  describe('LocalCacheProject interface', () => {
    it('should have required fields: id, name, teamId, recentIssueTitles', () => {
      const project: LocalCacheProject = {
        id: 'proj-1',
        name: 'Test Project',
        teamId: 'team-1',
        recentIssueTitles: ['Issue 1', 'Issue 2'],
      };

      expect(project.id).toBe('proj-1');
      expect(project.name).toBe('Test Project');
      expect(project.teamId).toBe('team-1');
      expect(project.recentIssueTitles).toHaveLength(2);
    });

    it('should handle empty recentIssueTitles array', () => {
      const project: LocalCacheProject = {
        id: 'proj-1',
        name: 'Empty Project',
        teamId: 'team-1',
        recentIssueTitles: [],
      };

      expect(project.recentIssueTitles).toHaveLength(0);
    });

    it('should handle special characters in names and titles', () => {
      const project: LocalCacheProject = {
        id: 'proj-1',
        name: 'Project "Special" & <Chars>',
        teamId: 'team-1',
        recentIssueTitles: ['Issue with "quotes"', 'Issue with <tags>'],
      };

      expect(project.name).toBe('Project "Special" & <Chars>');
      expect(project.recentIssueTitles[0]).toBe('Issue with "quotes"');
    });

    it('should handle Korean characters', () => {
      const project: LocalCacheProject = {
        id: 'proj-1',
        name: '한글 프로젝트',
        teamId: 'team-1',
        recentIssueTitles: ['이슈 제목 1', '버그 수정'],
      };

      expect(project.name).toBe('한글 프로젝트');
      expect(project.recentIssueTitles).toContain('버그 수정');
    });
  });

  describe('LocalCacheData interface', () => {
    it('should have required fields: version, updatedAt, projects', () => {
      const cacheData: LocalCacheData = {
        version: 2,
        updatedAt: '2026-01-28T00:00:00Z',
        projects: [],
      };

      expect(cacheData.version).toBe(2);
      expect(cacheData.updatedAt).toBe('2026-01-28T00:00:00Z');
      expect(cacheData.projects).toHaveLength(0);
    });

    it('should contain array of LocalCacheProject', () => {
      const cacheData: LocalCacheData = {
        version: 2,
        updatedAt: '2026-01-28T00:00:00Z',
        projects: [
          {
            id: 'proj-1',
            name: 'Project 1',
            teamId: 'team-1',
            recentIssueTitles: ['Issue A'],
          },
          {
            id: 'proj-2',
            name: 'Project 2',
            teamId: 'team-2',
            recentIssueTitles: ['Issue B', 'Issue C'],
          },
        ],
      };

      expect(cacheData.projects).toHaveLength(2);
      expect(cacheData.projects[0].name).toBe('Project 1');
      expect(cacheData.projects[1].recentIssueTitles).toContain('Issue C');
    });

    it('should handle large number of projects', () => {
      const largeProjects: LocalCacheProject[] = Array.from({ length: 100 }, (_, i) => ({
        id: `proj-${i}`,
        name: `Project ${i}`,
        teamId: `team-${i % 5}`,
        recentIssueTitles: Array.from({ length: 10 }, (_, j) => `Issue ${j}`),
      }));

      const cacheData: LocalCacheData = {
        version: 2,
        updatedAt: '2026-01-28T00:00:00Z',
        projects: largeProjects,
      };

      expect(cacheData.projects).toHaveLength(100);
      expect(cacheData.projects[50].name).toBe('Project 50');
      expect(cacheData.projects[99].recentIssueTitles).toHaveLength(10);
    });
  });

  describe('Data validation patterns', () => {
    it('version should be a number', () => {
      const data: LocalCacheData = {
        version: 2,
        updatedAt: '2026-01-28T00:00:00Z',
        projects: [],
      };

      expect(typeof data.version).toBe('number');
    });

    it('updatedAt should be ISO 8601 format string', () => {
      const data: LocalCacheData = {
        version: 2,
        updatedAt: '2026-01-28T12:30:45.123Z',
        projects: [],
      };

      expect(typeof data.updatedAt).toBe('string');
      expect(data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('projects should always be an array', () => {
      const data: LocalCacheData = {
        version: 2,
        updatedAt: '2026-01-28T00:00:00Z',
        projects: [],
      };

      expect(Array.isArray(data.projects)).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const original: LocalCacheData = {
        version: 2,
        updatedAt: '2026-01-28T00:00:00Z',
        projects: [
          {
            id: 'proj-1',
            name: 'Test Project',
            teamId: 'team-1',
            recentIssueTitles: ['Issue 1', 'Issue 2'],
          },
        ],
      };

      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized) as LocalCacheData;

      expect(deserialized).toEqual(original);
      expect(deserialized.projects[0].recentIssueTitles).toHaveLength(2);
    });

    it('should handle empty cache data', () => {
      const emptyData: LocalCacheData = {
        version: 2,
        updatedAt: '2026-01-28T00:00:00Z',
        projects: [],
      };

      const serialized = JSON.stringify(emptyData);
      const deserialized = JSON.parse(serialized) as LocalCacheData;

      expect(deserialized.projects).toHaveLength(0);
    });
  });
});
