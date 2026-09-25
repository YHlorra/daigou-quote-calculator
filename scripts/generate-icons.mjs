import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 从 public/icons/icon.svg 生成 PWA 所需的 PNG 图标（192 / 512 / apple-touch 180）。
 * 生成的 PNG 需提交进仓库（CI 构建只跑 esbuild，不重新生成图标）。
 * 修改 icon.svg 后执行：npm run icons
 */
const iconsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

for (const size of [512, 192, 180]) {
  const out = path.join(iconsDir, `icon-${size}.png`);
  await sharp(svgPath, { density: 384 }).resize(size, size).png().toFile(out);
  console.log(`generated ${out}`);
}
