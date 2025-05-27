#!/usr/bin/env node

console.log('🔍 Verifying Instantly MCP Server setup...\n');

let hasErrors = false;

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
if (majorVersion < 18) {
  console.error('❌ Node.js version 18 or higher is required. Current version:', nodeVersion);
  hasErrors = true;
} else {
  console.log('✅ Node.js version:', nodeVersion);
}

// Check environment variables
if (!process.env.INSTANTLY_API_KEY) {
  console.error('❌ INSTANTLY_API_KEY environment variable is not set');
  console.log('   Please set it in your .env file or Railway environment');
  hasErrors = true;
} else {
  console.log('✅ INSTANTLY_API_KEY is set');
}

// Check if TypeScript build exists
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distPath, 'index.js');

if (!fs.existsSync(distPath)) {
  console.error('❌ Build directory (dist/) does not exist');
  console.log('   Run "npm run build" to compile the TypeScript code');
  hasErrors = true;
} else if (!fs.existsSync(indexPath)) {
  console.error('❌ Compiled index.js not found in dist/');
  console.log('   Run "npm run build" to compile the TypeScript code');
  hasErrors = true;
} else {
  console.log('✅ Build files found');
}

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('\n❌ Setup verification failed. Please fix the issues above.');
  process.exit(1);
} else {
  console.log('\n✅ All checks passed! Your Instantly MCP Server is ready.');
  console.log('\nNext steps:');
  console.log('1. Deploy to Railway');
  console.log('2. Add to Claude Desktop with URL: https://your-app.railway.app/sse');
  console.log('   (Remember to include /sse at the end!)');
}
