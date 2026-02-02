#!/usr/bin/env node
/**
 * Get development appId with branch suffix for parallel worktree execution
 * Usage: node scripts/get-dev-app-id.js
 * Output: com.gpters.linear-capture[-branch-suffix]
 */

const { execSync } = require('child_process');

const BASE_APP_ID = 'com.gpters.linear-capture';
const MAIN_BRANCHES = ['master', 'main'];
const MAX_SUFFIX_LENGTH = 50;

function getCurrentBranch() {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    return branch || null;
  } catch (error) {
    return null;
  }
}

function sanitizeBranchName(branchName) {
  return branchName
    .replace(/^(feature|fix|hotfix|bugfix|release|chore)\//, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, MAX_SUFFIX_LENGTH)
    .replace(/-$/, '');
}

function getDevAppId() {
  const branch = getCurrentBranch();
  
  if (branch === null) {
    return `${BASE_APP_ID}-detached`;
  }
  
  if (MAIN_BRANCHES.includes(branch)) {
    return BASE_APP_ID;
  }
  
  const suffix = sanitizeBranchName(branch);
  return suffix ? `${BASE_APP_ID}-${suffix}` : BASE_APP_ID;
}

console.log(getDevAppId());
