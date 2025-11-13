// scripts/setup-env.js
const fs = require('fs');
const path = require('path');

const env = process.env.NODE_ENV || 'development';
const rootDir = path.resolve(__dirname, '..');

console.log(`Setting up environment for: ${env}`);

// Determine which env file to use
const envFile = env === 'production' ? '.env.production' : '.env.local';

const sourcePath = path.join(rootDir, envFile);
const targetPath = path.join(rootDir, '.env');

// Check if source file exists
if (!fs.existsSync(sourcePath)) {
  console.error(`${envFile} not found!`);
  console.log(`Please create ${envFile} from .env.example`);

  // Check if .env.example exists and provide helpful message
  const examplePath = path.join(rootDir, '.env.example');
  if (fs.existsSync(examplePath)) {
    console.log('\nTo create it, run:');
    console.log(`cp .env.example ${envFile}`);
    console.log(`Then fill in your environment variables.`);
  }
  process.exit(1);
}

// Copy or symlink the appropriate env file to .env
try {
  // Remove existing .env if it exists
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    console.log('Removed existing .env file');
  }

  // Copy the file
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Copied ${envFile} to .env`);

  // Verify DATABASE_URL exists
  const envContent = fs.readFileSync(targetPath, 'utf8');
  if (!envContent.includes('DATABASE_URL=')) {
    console.warn('Warning: DATABASE_URL not found in environment file');
  } else {
    console.log('DATABASE_URL found');
  }
} catch (error) {
  console.error('Failed to setup environment:', error);
  process.exit(1);
}
