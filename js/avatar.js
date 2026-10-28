// Profile-picture helper: crop/resize an uploaded image (kept on this device only).

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

