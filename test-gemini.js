const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY;
console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');

const client = new GoogleGenAI({ apiKey });

async function listModels() {
  console.log('\n=== Available Models ===');
  try {
    const models = await client.models.list();
    for await (const model of models) {
      if (model.name.includes('gemini')) {
        console.log(`- ${model.name}`);
        console.log(`  Display: ${model.displayName}`);
        console.log(`  Methods: ${model.supportedGenerationMethods?.join(', ')}`);
        console.log('');
      }
    }
  } catch (error) {
    console.error('Failed to list models:', error.message);
  }
}

async function testModel(modelName) {
  console.log(`\n=== Testing Model: ${modelName} ===`);
  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Say "Hello" in one word.' }]
        }
      ]
    });
    console.log('✅ SUCCESS:', response.text);
    return true;
  } catch (error) {
    console.log('❌ FAILED:', error.message.substring(0, 100));
    return false;
  }
}

async function testVisionModel(modelName) {
  console.log(`\n=== Testing Vision: ${modelName} ===`);

  // Create a simple test image (1x1 red pixel PNG)
  const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'What color is this image? Answer in one word.' },
            {
              inlineData: {
                mimeType: 'image/png',
                data: testImageBase64
              }
            }
          ]
        }
      ]
    });
    console.log('✅ VISION SUCCESS:', response.text);
    return true;
  } catch (error) {
    console.log('❌ VISION FAILED:', error.message.substring(0, 150));
    return false;
  }
}

async function main() {
  // List available models
  await listModels();

  // Test various model names
  const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-flash-lite',
  ];

  console.log('\n=== Testing Text Generation ===');
  for (const model of modelsToTest) {
    await testModel(model);
  }

  console.log('\n=== Testing Vision Capability ===');
  const visionModels = [
    'gemini-2.5-flash',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite',
  ];

  for (const model of visionModels) {
    await testVisionModel(model);
  }
}

main().catch(console.error);
