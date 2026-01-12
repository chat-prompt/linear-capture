import { LinearClient, Team, Project } from '@linear/sdk';

export interface CreateIssueParams {
  title: string;
  description?: string;
  teamId: string;
  projectId?: string;
  imageUrl?: string;
}

export interface CreateIssueResult {
  success: boolean;
  issueId?: string;
  issueIdentifier?: string;
  issueUrl?: string;
  error?: string;
}

export interface TeamInfo {
  id: string;
  name: string;
  key: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
}

export class LinearService {
  private client: LinearClient;

  constructor(apiToken: string) {
    this.client = new LinearClient({ apiKey: apiToken });
  }

  /**
   * Create a new Linear issue with optional image attachment
   */
  async createIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
    try {
      // Build description with image if provided
      let description = params.description || '';
      if (params.imageUrl) {
        const imageMarkdown = `\n\n![Screenshot](${params.imageUrl})`;
        description = description + imageMarkdown;
      }

      const issuePayload = await this.client.createIssue({
        title: params.title,
        description: description || undefined,
        teamId: params.teamId,
        projectId: params.projectId || undefined,
      });

      const issue = await issuePayload.issue;
      if (!issue) {
        return { success: false, error: 'Failed to create issue' };
      }

      return {
        success: true,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueUrl: issue.url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Get all teams
   */
  async getTeams(): Promise<TeamInfo[]> {
    try {
      const teams = await this.client.teams();
      return teams.nodes.map((team: Team) => ({
        id: team.id,
        name: team.name,
        key: team.key,
      }));
    } catch (error) {
      console.error('Failed to fetch teams:', error);
      return [];
    }
  }

  /**
   * Get all projects
   */
  async getProjects(): Promise<ProjectInfo[]> {
    try {
      const projects = await this.client.projects();
      return projects.nodes.map((project: Project) => ({
        id: project.id,
        name: project.name,
      }));
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      return [];
    }
  }
}

/**
 * Create LinearService from environment variables
 */
export function createLinearServiceFromEnv(): LinearService | null {
  const apiToken = process.env.LINEAR_API_TOKEN;

  if (!apiToken) {
    console.error('Missing LINEAR_API_TOKEN. Please check .env file.');
    return null;
  }

  return new LinearService(apiToken);
}
