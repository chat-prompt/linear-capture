#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SESSION_DIR = '/Users/wine_ny/.claude/projects/-Users-wine-ny-side-project-linear-project-linear-capture';

// Get all session files (excluding agent files)
const sessionFiles = fs.readdirSync(SESSION_DIR)
  .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent'))
  .map(f => path.join(SESSION_DIR, f));

// Parse all sessions
const conversations = [];

for (const file of sessionFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.trim().split('\n').filter(l => l.trim());

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Only keep user and assistant messages
      if (entry.type === 'user' || entry.type === 'assistant') {
        // Extract text content
        let text = '';
        if (Array.isArray(entry.content)) {
          text = entry.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
        } else if (typeof entry.content === 'string') {
          text = entry.content;
        }

        // Filter out IDE metadata
        if (text.includes('<ide_opened_file>') ||
            text.includes('<ide_selection>') ||
            text.includes('<system-reminder>') ||
            text.length < 50) {
          continue;
        }

        conversations.push({
          timestamp: entry.timestamp || Date.now(),
          type: entry.type,
          text: text.trim()
        });
      }
    } catch (e) {
      // Skip invalid JSON lines
    }
  }
}

// Sort by timestamp
conversations.sort((a, b) => a.timestamp - b.timestamp);

// Group by date
const groupedByDate = {};
for (const conv of conversations) {
  const date = new Date(conv.timestamp).toISOString().split('T')[0];
  if (!groupedByDate[date]) {
    groupedByDate[date] = [];
  }
  groupedByDate[date].push(conv);
}

// Output as JSON
console.log(JSON.stringify(groupedByDate, null, 2));
