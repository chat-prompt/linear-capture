#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SESSION_DIR = '/Users/wine_ny/.claude/projects/-Users-wine-ny-side-project-linear-project-linear-capture';

// Get all session files (excluding agent files)
const sessionFiles = fs.readdirSync(SESSION_DIR)
  .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent'))
  .map(f => path.join(SESSION_DIR, f))
  .sort(); // Sort by filename

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
        const timestamp = entry.timestamp || Date.now();

        // Extract user text
        if (entry.type === 'user' && entry.message && entry.message.content) {
          const userTexts = entry.message.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .filter(t => !t.includes('<ide_opened_file>') &&
                         !t.includes('<ide_selection>') &&
                         !t.includes('<system-reminder>') &&
                         !t.includes('<command-message>') &&
                         !t.includes('<command-name>') &&
                         t.trim().length > 0);

          if (userTexts.length > 0) {
            conversations.push({
              timestamp,
              type: 'user',
              text: userTexts.join('\n').trim(),
              sessionId: entry.sessionId
            });
          }
        }

        // Extract assistant text
        if (entry.type === 'assistant' && entry.message && entry.message.content) {
          const assistantTexts = entry.message.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .filter(t => t.trim().length > 20); // Skip very short responses

          if (assistantTexts.length > 0) {
            conversations.push({
              timestamp,
              type: 'assistant',
              text: assistantTexts.join('\n').trim(),
              sessionId: entry.sessionId
            });
          }
        }
      }
    } catch (e) {
      // Skip invalid JSON lines
    }
  }
}

// Sort by timestamp
conversations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

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
