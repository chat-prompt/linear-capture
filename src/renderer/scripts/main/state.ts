/**
 * Shared state for the main issue form page.
 * All module-scope variables that multiple modules need access to.
 */

// DOM Elements (initialized in initDomElements)
export let titleInput: HTMLInputElement;
export let descInput: HTMLTextAreaElement;
export let teamSelect: HTMLInputElement;
export let projectInput: HTMLInputElement;
export let statusSelect: HTMLInputElement;
export let prioritySelect: HTMLInputElement;
export let assigneeInput: HTMLInputElement;
export let estimateSelect: HTMLInputElement;
export let cycleSelect: HTMLInputElement;
export let form: HTMLFormElement;
export let preview: HTMLImageElement;
export let cancelBtn: HTMLButtonElement;
export let submitBtn: HTMLButtonElement;
export let errorDiv: HTMLDivElement;
export let loadingDiv: HTMLDivElement;
export let aiLoadingDiv: HTMLDivElement;
export let aiLoadingText: HTMLSpanElement;
export let aiModelSelect: HTMLInputElement;
export let reanalyzeBtn: HTMLButtonElement;
export let loadingText: HTMLSpanElement;
export let aiAnalysisSection: HTMLDivElement;
export let imageGallery: HTMLDivElement;
export let successScreen: HTMLDivElement;
export let successIssueId: HTMLSpanElement;
export let viewIssueBtn: HTMLButtonElement;
export let closeSuccessBtn: HTMLButtonElement;
export let imageModal: HTMLDivElement;
export let modalImage: HTMLImageElement;

// Data state
export let currentFilePath = '';
export let isSubmitting = false;
export let images: { filePath: string }[] = [];
export let maxImages = 10;
export let imageUrl = '';
export let allStates: any[] = [];
export let allCycles: any[] = [];
export let allTeams: any[] = [];
export let allProjects: any[] = [];
export let allUsers: any[] = [];
export let allLabels: any[] = [];
export let selectedLabelIds: string[] = [];
export let createdIssueUrl = '';

// Searchable select instances
export let projectSearchable: any;
export let assigneeSearchable: any;

// Setters (needed because ES module exports are read-only bindings from outside)
export function setCurrentFilePath(v: string) { currentFilePath = v; }
export function setIsSubmitting(v: boolean) { isSubmitting = v; }
export function setImages(v: { filePath: string }[]) { images = v; }
export function setMaxImages(v: number) { maxImages = v; }
export function setImageUrl(v: string) { imageUrl = v; }
export function setAllStates(v: any[]) { allStates = v; }
export function setAllCycles(v: any[]) { allCycles = v; }
export function setAllTeams(v: any[]) { allTeams = v; }
export function setAllProjects(v: any[]) { allProjects = v; }
export function setAllUsers(v: any[]) { allUsers = v; }
export function setAllLabels(v: any[]) { allLabels = v; }
export function setSelectedLabelIds(v: string[]) { selectedLabelIds = v; }
export function setCreatedIssueUrl(v: string) { createdIssueUrl = v; }
export function setProjectSearchable(v: any) { projectSearchable = v; }
export function setAssigneeSearchable(v: any) { assigneeSearchable = v; }

// DOM initialization (called once from app.ts)
export function initDomElements() {
  titleInput = document.getElementById('title') as HTMLInputElement;
  descInput = document.getElementById('description') as HTMLTextAreaElement;
  teamSelect = document.getElementById('team') as HTMLInputElement;
  projectInput = document.getElementById('project') as HTMLInputElement;
  statusSelect = document.getElementById('status') as HTMLInputElement;
  prioritySelect = document.getElementById('priority') as HTMLInputElement;
  assigneeInput = document.getElementById('assignee') as HTMLInputElement;
  estimateSelect = document.getElementById('estimate') as HTMLInputElement;
  cycleSelect = document.getElementById('cycle') as HTMLInputElement;
  form = document.getElementById('issueForm') as HTMLFormElement;
  preview = document.getElementById('preview') as HTMLImageElement;
  cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
  submitBtn = document.getElementById('submitBtn') as HTMLButtonElement;
  errorDiv = document.getElementById('error') as HTMLDivElement;
  loadingDiv = document.getElementById('loading') as HTMLDivElement;
  aiLoadingDiv = document.getElementById('aiLoading') as HTMLDivElement;
  aiLoadingText = document.getElementById('aiLoadingText') as HTMLSpanElement;
  aiModelSelect = document.getElementById('aiModel') as HTMLInputElement;
  reanalyzeBtn = document.getElementById('reanalyzeBtn') as HTMLButtonElement;
  loadingText = document.getElementById('loadingText') as HTMLSpanElement;
  aiAnalysisSection = document.getElementById('aiAnalysisSection') as HTMLDivElement;
  imageGallery = document.getElementById('imageGallery') as HTMLDivElement;
  successScreen = document.getElementById('successScreen') as HTMLDivElement;
  successIssueId = document.getElementById('successIssueId') as HTMLSpanElement;
  viewIssueBtn = document.getElementById('viewIssueBtn') as HTMLButtonElement;
  closeSuccessBtn = document.getElementById('closeSuccessBtn') as HTMLButtonElement;
  imageModal = document.getElementById('imageModal') as HTMLDivElement;
  modalImage = document.getElementById('modalImage') as HTMLImageElement;
}
