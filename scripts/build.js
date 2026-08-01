const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXTENSION_DIR = path.join(__dirname, '../extension');
const TEMP_DIR = path.join(__dirname, '../extension_build_temp');
const MANIFEST_PATH = path.join(EXTENSION_DIR, 'manifest.json');

// Get version from manifest
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const version = manifest.version;

const outputDir = path.join(__dirname, '../versions');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}
const ZIP_NAME = `VietZhong_v${version}.zip`;
const outputZip = path.join(outputDir, ZIP_NAME);

console.log(`Building version ${version}...`);

// 1. Clean old temp dir if exists
if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

// 2. Copy extension to temp dir
console.log('Copying files...');
execSync(`cp -r "${EXTENSION_DIR}" "${TEMP_DIR}"`);

// 3. Minify JSON files in temp dir
const jsonFilesToMinify = [
  'data/dictionary.json',
  'data/decompostion/details.json',
  'data/decompostion/radicals.json',
  'data/t2s.json'
];

let sizeMultiLine = 0;
let sizeOneLine = 0;

console.log('Minifying JSON files...');
for (const relPath of jsonFilesToMinify) {
  const fullPath = path.join(TEMP_DIR, relPath);
  if (fs.existsSync(fullPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      
      const multiLineStr = JSON.stringify(data, null, 2);
      sizeMultiLine += Buffer.byteLength(multiLineStr, 'utf8');
      
      const oneLineStr = JSON.stringify(data);
      sizeOneLine += Buffer.byteLength(oneLineStr, 'utf8');
      
      fs.writeFileSync(fullPath, oneLineStr); 
      console.log(` - Minified ${relPath}`);
    } catch (e) {
      console.error(`Failed to minify ${relPath}:`, e.message);
    }
  } else {
    console.warn(` - Warning: ${relPath} not found.`);
  }
}

console.log(`\n--- JSON Raw Size Comparison ---`);
console.log(`Multi-line total: ${(sizeMultiLine / 1024 / 1024).toFixed(2)} MB (${sizeMultiLine} bytes)`);
console.log(`One-line total: ${(sizeOneLine / 1024 / 1024).toFixed(2)} MB (${sizeOneLine} bytes)`);
console.log(`Saved by minifying: ${((sizeMultiLine - sizeOneLine) / 1024 / 1024).toFixed(2)} MB\n`);

// 4. Create ZIP
if (fs.existsSync(outputZip)) {
  fs.unlinkSync(outputZip);
}

console.log('Creating ZIP file...');
try {
  // Zip the contents of TEMP_DIR, not the directory itself
  execSync(`cd "${TEMP_DIR}" && zip -r "${outputZip}" ./*`);
  console.log(`Success! Packaged to versions/${ZIP_NAME}`);
} catch (e) {
  console.error('Failed to create ZIP:', e.message);
}

// 5. Cleanup
console.log('Cleaning up...');
fs.rmSync(TEMP_DIR, { recursive: true, force: true });
console.log('Build completed.');

