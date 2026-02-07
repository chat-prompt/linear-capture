import { LinearService } from './src/services/linear-client';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const apiToken = process.env.LINEAR_API_TOKEN;
  if (!apiToken) {
    console.error('❌ LINEAR_API_TOKEN not found in .env');
    process.exit(1);
  }

  const service = new LinearService(apiToken);

  try {
    // Step 1: Get projects
    console.log("📋 Step 1: Fetching projects...");
    const projects = await service.getProjects();
    
    if (projects.length === 0) {
      console.log("❌ No active projects found");
      process.exit(1);
    }
    
    console.log("\n📦 Available Projects:");
    projects.forEach((p, i) => {
      console.log(`  [${i + 1}] ${p.name} (${p.id})`);
    });
    
    // Use first project
    const selectedProject = projects[0];
    console.log(`\n✅ Selected project: ${selectedProject.name}`);
    
    // Step 2: Create issue
    console.log("\n📋 Step 2: Creating issue...");
    
    const result = await service.createIssue({
      title: "[Search] 검색 결과 소스 편중 문제 개선",
      description: `## 배경

Linear Capture 앱의 하이브리드 검색(Semantic + Keyword + RRF)에서 소스 간 편중 문제 발견.
- Notion/Linear 페이지가 Slack 메시지보다 체계적으로 유리
- 기존 검색 품질 개선 계획(RecencyBoost, Reranker)을 그대로 적용하면 편중 악화 우려
- Oracle 아키텍처 상담 완료, 수정된 계획 수립됨

## 상세내용

### 발견된 편중 문제 (6가지)

1. **Slack 검색/동기화 불일치** 🔴
   - Sync: 전체 채널 동기화 / Search: 채널 미선택 시 Slack 제외
   - 위치: \`local-search.ts\`

2. **0.3 하드코딩 패널티** 🔴
   - Keyword-only 결과에 0.3 고정 점수 → Slack 불이익
   - 위치: \`local-search.ts\` line 445

3. **FTS Title 가중치** 🟡
   - Slack title은 "#채널-사용자" (무의미)
   - 위치: \`database.ts\` line 137-139

4. **문서 길이 편향** 🟡
5. **짧은 쿼리 편향** 🟡
6. **계획된 기능의 상충** (RecencyBoost ↔ Reranker)

### 분석 문서
\`.sisyphus/drafts/search-bias-analysis.md\`

## To Do

### Wave 0: 편중 기초 수정 (~4시간)
- [ ] Slack 검색/동기화 일관성
- [ ] 0.3 패널티 제거
- [ ] 소스별 균형 검색
- [ ] Slack title 처리 개선

### Wave 1-3: 기존 계획 (~1.5일)
- [ ] Worker 수정 (toUpperCase, 절단)
- [ ] recency-boost.ts
- [ ] text-chunker.ts
- [ ] Worker /rerank + reranker.ts
- [ ] 통합 + 바이어스 로깅`,
      teamId: "e108ae14-a354-4c09-86ac-6c1186bc6132",
      stateId: "6dc4154e-3a35-43d2-ac44-e3d66df85c9b",
      projectId: selectedProject.id,
    });
    
    if (result.success) {
      console.log(`✅ Issue created successfully!`);
      console.log(`   Title: [Search] 검색 결과 소스 편중 문제 개선`);
      console.log(`   ID: ${result.issueId}`);
      console.log(`   Identifier: ${result.issueIdentifier}`);
      console.log(`   URL: ${result.issueUrl}`);
    } else {
      console.error(`❌ Failed to create issue: ${result.error}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
