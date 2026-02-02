const { execSync } = require('child_process');
const packageJson = require('./package.json');

const devAppId = execSync('node scripts/get-dev-app-id.js', { encoding: 'utf-8' }).trim();
const suffix = devAppId.replace('com.gpters.linear-capture', '');
const devName = suffix ? `linear-capture${suffix}` : 'linear-capture';

module.exports = {
  ...packageJson.build,
  appId: devAppId,
  afterSign: undefined,
  extraMetadata: {
    name: devName
  },
  mac: {
    ...packageJson.build.mac,
    target: [{ target: 'dir', arch: ['arm64'] }]
  }
};
