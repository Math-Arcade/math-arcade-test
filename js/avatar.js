// Profile-picture helpers: crop/resize an uploaded image, and make the tiny thumbnail shown in Ranks.

const loadImage = (url) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('Could not read that image.'));
  i.src = url;
});

function squareJpeg(img, size, quality) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error('Could not read that image.');
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', quality);
}

// Uploaded file -> 128px square JPEG data URL.
export async function fileToAvatar(file, size = 128) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is too large.');
  const url = URL.createObjectURL(file);
  try { return squareJpeg(await loadImage(url), size, 0.85); }
  finally { URL.revokeObjectURL(url); }
}


// Avatar data URL -> ~64px JPEG small enough (< 8000 chars) to store with a leaderboard entry.
export async function thumbFrom(dataUrl, size = 64) {
  if (!dataUrl) return '';
  const img = await loadImage(dataUrl);
  for (const q of [0.7, 0.5, 0.35]) {
    const out = squareJpeg(img, size, q);
    if (out.length <= 7500) return out;
  }
  return '';
}

// Only ever render JPEG data URLs of sane size that came from the leaderboard.
export const safePic = (v) => (typeof v === 'string' && v.length <= 8000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '');
