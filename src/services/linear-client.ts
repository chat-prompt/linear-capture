import { LinearClient, Team, Project, User, WorkflowState, Cycle } from '@linear/sdk';
import { getLinearToken } from './settings-store';

export interface CreateIssueParams {
  title: string;
  description?: string;
  teamId: string;
  projectId?: string;
  imageUrl?: string;      // Single image (backwards compatible)
  imageUrls?: string[];   // Multiple images
  stateId?: string;
  priority?: number;
  assigneeId?: string;
  estimate?: number;
  cycleId?: string;
  labelIds?: string[];    // Labels to attach
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
  issueEstimationType: string;  // 'notUsed' | 'exponential' | 'fibonacci' | 'linear' | 'tShirt'
  issueEstimationAllowZero: boolean;
  issueEstimationExtended: boolean;
}

export interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  state?: string;  // planned/started/paused/completed/canceled
  teamIds: string[];  // 프로젝트가 속한 팀들의 ID
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface WorkflowStateInfo {
  id: string;
  name: string;
  type: string;
  color: string;
  teamId: string;
}

export interface CycleInfo {
  id: string;
  name: string;
  number: number;
  startsAt: string;
  endsAt: string;
  teamId: string;
}

export interface LabelInfo {
  id: string;
  name: string;
  color: string;
  description?: string;
  teamId?: string;  // null이면 workspace 라벨
  parentId?: string;  // 부모 라벨 (그룹)
}

export class LinearService {
  private client: LinearClient;

  constructor(apiToken: string) {
    this.client = new LinearClient({ apiKey: apiToken });
  }

  /**
   * Create a new Linear issue with optional image attachment(s)
   */
  async createIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
    try {
      // Build description with images if provided
      let description = params.description || '';

      // Support both single imageUrl (backwards compatible) and multiple imageUrls
      const urls = params.imageUrls || (params.imageUrl ? [params.imageUrl] : []);
      if (urls.length > 0) {
        const imageMarkdown = urls
          .map((url, idx) => `![Screenshot ${idx + 1}](${url})`)
          .join('\n\n');
        description = description + '\n\n' + imageMarkdown;
      }

      const issuePayload = await this.client.createIssue({
        title: params.title,
        description: description || undefined,
        teamId: params.teamId,
        projectId: params.projectId || undefined,
        stateId: params.stateId || undefined,
        priority: params.priority,
        assigneeId: params.assigneeId || undefined,
        estimate: params.estimate,
        cycleId: params.cycleId || undefined,
        labelIds: params.labelIds || undefined,
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
   * Get all teams with estimate settings
   */
  async getTeams(): Promise<TeamInfo[]> {
    try {
      const teams = await this.client.teams();
      return teams.nodes.map((team: Team) => ({
        id: team.id,
        name: team.name,
        key: team.key,
        issueEstimationType: team.issueEstimationType || 'fibonacci',
        issueEstimationAllowZero: team.issueEstimationAllowZero ?? false,
        issueEstimationExtended: team.issueEstimationExtended ?? false,
      }));
    } catch (error) {
      console.error('Failed to fetch teams:', error);
      return [];
    }
  }

  /**
   * Get active projects (planned/started only)
   */
  async getProjects(): Promise<ProjectInfo[]> {
    try {
      const projects = await this.client.projects({
        filter: {
          state: { in: ['planned', 'started'] }
        }
      });
      
      const result: ProjectInfo[] = [];
      for (const project of projects.nodes) {
        const teamsConnection = await project.teams();
        const teamIds = teamsConnection.nodes.map(team => team.id);
        
        result.push({
          id: project.id,
          name: project.name,
          description: project.description || undefined,
          state: project.state,
          teamIds,
        });
      }
      
      return result;
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      return [];
    }
  }

  /**
   * Get all users in the organization
   */
  async getUsers(): Promise<UserInfo[]> {
    try {
      const users = await this.client.users();
      return users.nodes.map((user: User) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || undefined,
      }));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      return [];
    }
  }

  /**
   * Get workflow states for all teams (sorted by Linear UI order)
   */
  async getWorkflowStates(): Promise<WorkflowStateInfo[]> {
    try {
      const states = await this.client.workflowStates();
      const result: WorkflowStateInfo[] = [];
      for (const state of states.nodes) {
        const team = await state.team;
        result.push({
          id: state.id,
          name: state.name,
          type: state.type,
          color: state.color,
          teamId: team?.id || '',
        });
      }

      // Sort by Linear UI order: backlog → unstarted → started → completed → canceled
      const typeOrder: Record<string, number> = {
        backlog: 0,
        unstarted: 1,
        started: 2,
        completed: 3,
        canceled: 4,
      };
      result.sort((a, b) => {
        // First by team, then by type order
        if (a.teamId !== b.teamId) {
          return a.teamId.localeCompare(b.teamId);
        }
        return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
      });

      return result;
    } catch (error) {
      console.error('Failed to fetch workflow states:', error);
      return [];
    }
  }

  /**
   * Get active and upcoming cycles (sorted by start date, nearest first)
   */
  async getCycles(): Promise<CycleInfo[]> {
    try {
      const cycles = await this.client.cycles({
        filter: {
          isPast: { eq: false },
        },
      });
      const result: CycleInfo[] = [];
      for (const cycle of cycles.nodes) {
        const team = await cycle.team;
        result.push({
          id: cycle.id,
          name: cycle.name || `Cycle ${cycle.number}`,
          number: cycle.number,
          startsAt: cycle.startsAt?.toISOString() || '',
          endsAt: cycle.endsAt?.toISOString() || '',
          teamId: team?.id || '',
        });
      }

      // Sort by team, then by start date (nearest first)
      result.sort((a, b) => {
        if (a.teamId !== b.teamId) {
          return a.teamId.localeCompare(b.teamId);
        }
        // Sort by startsAt ascending (nearest/current cycle first)
        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      });

      return result;
    } catch (error) {
      console.error('Failed to fetch cycles:', error);
      return [];
    }
  }

  /**
   * Get all labels (workspace + team labels)
   */
  async getLabels(): Promise<LabelInfo[]> {
    try {
      const labels = await this.client.issueLabels({ first: 100 });
      const result: LabelInfo[] = [];

      for (const label of labels.nodes) {
        const team = await label.team;
        const parent = await label.parent;
        
        result.push({
          id: label.id,
          name: label.name,
          color: label.color,
          description: label.description || undefined,
          teamId: team?.id || undefined,
          parentId: parent?.id || undefined,
        });
      }

      // Sort by name for consistent display
      result.sort((a, b) => a.name.localeCompare(b.name));

      return result;
    } catch (error) {
      console.error('Failed to fetch labels:', error);
      return [];
    }
  }
}

/**
 * Create LinearService from settings store or environment variables
 */
export function createLinearServiceFromEnv(): LinearService | null {
  // First try settings store, then fallback to env
  const apiToken = getLinearToken();

  if (!apiToken) {
    console.error('Missing LINEAR_API_TOKEN. Please check Settings or .env file.');
    return null;
  }

  return new LinearService(apiToken);
}

/**
 * Validate a Linear API token by fetching the viewer info
 */
export async function validateLinearToken(token: string): Promise<{
  valid: boolean;
  user?: { id: string; name: string; email: string };
  error?: string;
}> {
  try {
    const client = new LinearClient({ apiKey: token });
    const viewer = await client.viewer;

    return {
      valid: true,
      user: {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid token';
    return { valid: false, error: message };
  }
}
