// Test Gemini analyzer independently
require('dotenv').config({ path: '.env' });

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

async function testGeminiAnalyzer() {
  console.log('=== Gemini Analyzer Test ===\n');

  // Check API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('❌ GEMINI_API_KEY not set');
    return;
  }
  console.log('✅ GEMINI_API_KEY found:', apiKey.substring(0, 10) + '...');

  // Create a simple test image (1x1 pixel PNG)
  const testImagePath = '/tmp/test-screenshot.png';

  // Check if we have a real screenshot to test with
  const screenshotsDir = '/tmp';
  const pngFiles = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'));

  let imagePath = testImagePath;
  if (pngFiles.length > 0) {
    // Use a random existing PNG
    imagePath = path.join(screenshotsDir, pngFiles[0]);
    console.log('📷 Using existing image:', imagePath);
  } else {
    console.log('⚠️ No existing screenshots found, creating test image');
    // Create minimal PNG
    const minimalPNG = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
      0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
      0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(testImagePath, minimalPNG);
  }

  try {
    const client = new GoogleGenAI({ apiKey });

    const imgBytes = fs.readFileSync(imagePath);
    const base64Data = imgBytes.toString('base64');
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

    console.log('\n📤 Sending request to Gemini...');
    console.log('   Image size:', imgBytes.length, 'bytes');
    console.log('   MIME type:', mimeType);

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Analyze this image and respond with JSON: {"title": "test", "description": "test"}'
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

    console.log('\n📥 Response received:');
    const text = response.text || '';
    console.log('   Raw text:', text.substring(0, 500));

    // Parse JSON
    const cleanedText = text.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`\n?/g, '').trim();
    try {
      const json = JSON.parse(cleanedText);
      console.log('\n✅ Parsed JSON successfully:');
      console.log('   Title:', json.title);
      console.log('   Description:', json.description);
    } catch (parseError) {
      console.log('\n❌ JSON parse error:', parseError.message);
      console.log('   Cleaned text:', cleanedText.substring(0, 200));
    }

  } catch (error) {
    console.log('\n❌ Gemini API error:', error.message);
  }
}

testGeminiAnalyzer();
