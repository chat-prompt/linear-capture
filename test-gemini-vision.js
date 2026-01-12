const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY;
const client = new GoogleGenAI({ apiKey });

async function testVisionWithRealImage(modelName, imagePath) {
  console.log(`\n=== Testing ${modelName} with real image ===`);

  try {
    const imgBytes = fs.readFileSync(imagePath);
    const base64Data = imgBytes.toString('base64');
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

    const startTime = Date.now();

    const response = await client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `이 스크린샷을 분석하여 Linear 이슈용 제목과 설명을 생성하세요.

규칙:
1. 제목: 한 줄로 명확하게 (예: "[버그] 로그인 버튼 클릭 시 에러 발생")
2. 설명: 화면에서 발견한 내용 요약, 중요한 텍스트 인용 포함

반드시 JSON 형식으로만 응답 (마크다운 코드블록 없이):
{"title": "...", "description": "..."}`
            },
            {
              inlineData: {
                mimeType,
                data: base64Data
              }
            }
          ]
        }
      ]
    });

    const elapsed = Date.now() - startTime;
    const text = response.text || '';

    console.log(`✅ SUCCESS (${elapsed}ms)`);
    console.log('Raw response:', text.substring(0, 200));

    // Try to parse JSON
    try {
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const json = JSON.parse(cleanedText);
      console.log('Parsed title:', json.title);
      console.log('Parsed description:', json.description?.substring(0, 100));
    } catch (e) {
      console.log('JSON parse failed:', e.message);
    }

    return { success: true, elapsed };
  } catch (error) {
    console.log(`❌ FAILED: ${error.message.substring(0, 150)}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  // Find a test image - use an existing capture or create a simple one
  const testImages = [
    '/var/folders/84/w0m6jgk5579_rh0ypb0rtzzw0000gn/T/linear-capture-1768226424100.png',
    '/tmp/test-screenshot.png'
  ];

  let testImage = null;
  for (const img of testImages) {
    if (fs.existsSync(img)) {
      testImage = img;
      break;
    }
  }

  if (!testImage) {
    // Create a simple test by taking a screenshot
    console.log('No test image found. Creating one...');
    const { execSync } = require('child_process');
    testImage = '/tmp/test-screenshot.png';
    try {
      execSync(`screencapture -x -R0,0,800,600 ${testImage}`);
      console.log('Created test screenshot:', testImage);
    } catch (e) {
      console.error('Failed to create screenshot:', e.message);
      return;
    }
  }

  console.log('Using test image:', testImage);
  console.log('File size:', fs.statSync(testImage).size, 'bytes');

  // Test models in order of preference
  const modelsToTest = [
    'gemini-2.5-flash-lite',  // Fastest, most cost-effective
    'gemini-2.5-flash',       // Balanced
    'gemini-3-flash-preview', // Newest
  ];

  const results = [];

  for (const model of modelsToTest) {
    const result = await testVisionWithRealImage(model, testImage);
    results.push({ model, ...result });

    // Small delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== Summary ===');
  for (const r of results) {
    const status = r.success ? `✅ ${r.elapsed}ms` : `❌ ${r.error?.substring(0, 50)}`;
    console.log(`${r.model}: ${status}`);
  }

  // Recommend best model
  const working = results.filter(r => r.success).sort((a, b) => a.elapsed - b.elapsed);
  if (working.length > 0) {
    console.log(`\n🎯 Recommended model: ${working[0].model} (${working[0].elapsed}ms)`);
  }
}

main().catch(console.error);
