#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Multilingual Mandi project setup...\n');

const checks = [
  {
    name: 'Root package.json exists',
    check: () => fs.existsSync('package.json'),
  },
  {
    name: 'Backend directory structure',
    check: () => fs.existsSync('backend/package.json') && fs.existsSync('backend/src/server/app.js'),
  },
  {
    name: 'Frontend directory structure', 
    check: () => fs.existsSync('frontend/package.json') && fs.existsSync('frontend/src/App.tsx'),
  },
  {
    name: 'Environment configuration files',
    check: () => fs.existsSync('backend/.env.example') && fs.existsSync('frontend/.env.example'),
  },
  {
    name: 'Docker configuration',
    check: () => fs.existsSync('docker-compose.yml') && fs.existsSync('backend/Dockerfile'),
  },
  {
    name: 'Development scripts',
    check: () => fs.existsSync('scripts/dev.js'),
  },
  {
    name: 'Documentation',
    check: () => fs.existsSync('README.md') && fs.existsSync('.gitignore'),
  },
  {
    name: 'Test files',
    check: () => fs.existsSync('backend/src/server/app.test.js') && fs.existsSync('frontend/src/App.test.tsx'),
  },
];

let passed = 0;
let failed = 0;

checks.forEach(({ name, check }) => {
  const result = check();
  if (result) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n🎉 Project setup validation completed successfully!');
  console.log('\n📋 Next steps:');
  console.log('1. Configure AWS credentials in backend/.env');
  console.log('2. Run "npm run dev" to start development servers');
  console.log('3. Access frontend at http://localhost:3000');
  console.log('4. Access backend at http://localhost:5000');
  console.log('\n🚀 Ready to proceed with Task 2: AWS Bedrock integration');
} else {
  console.log('\n⚠️  Some validation checks failed. Please review the setup.');
  process.exit(1);
}