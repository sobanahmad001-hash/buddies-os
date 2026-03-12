const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create icons directory
const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// You'll need to create a source logo at public/logo.png (1024x1024)
const sourceLogo = path.join(__dirname, '../public/logo.png');

async function generateIcons() {
  console.log('🎨 Generating PWA icons...');

  for (const size of sizes) {
    await sharp(sourceLogo)
      .resize(size, size)
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`));

    console.log(`✅ Generated ${size}x${size}`);
  }

  // Generate Apple Touch Icon
  await sharp(sourceLogo)
    .resize(180, 180)
    .toFile(path.join(__dirname, '../public/apple-touch-icon.png'));

  console.log('✅ Generated apple-touch-icon.png');
  console.log('🎉 All icons generated!');
}

// Only run if source logo exists
if (fs.existsSync(sourceLogo)) {
  generateIcons().catch(console.error);
} else {
  console.log('⚠️  Please create public/logo.png (1024x1024) first, then run: node scripts/generate-icons.js');
}
