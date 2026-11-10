const fs = require('fs');
const path = require('path');

// Shop photos for account-master are stored as files, not inline in the JSON,
// so account lists (fetched often) don't carry every image.
const SHOP_PHOTO_DIR = path.join(__dirname, '..', 'db', 'shop-photos');
const SHOP_PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,/;
const SHOP_PHOTO_FILE_RE = /^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/;

/**
 * If record.shopPhoto is a data URL, write it to disk and replace it with the file name.
 * Leaves existing file names and empty values untouched.
 */
async function storeShopPhoto(record, idForName) {
  const photo = record.shopPhoto;
  if (typeof photo !== 'string' || !SHOP_PHOTO_RE.test(photo)) return;
  const kind = photo.match(SHOP_PHOTO_RE)[1];
  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const buf = Buffer.from(photo.replace(SHOP_PHOTO_RE, ''), 'base64');
  if (buf.length > 8 * 1024 * 1024) throw new Error('Shop photo is too large');
  const safeId = String(idForName || 'account').replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${safeId}-${Date.now()}.${ext}`;
  await fs.promises.mkdir(SHOP_PHOTO_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(SHOP_PHOTO_DIR, fileName), buf);
  record.shopPhoto = fileName;
}

module.exports = { SHOP_PHOTO_DIR, SHOP_PHOTO_FILE_RE, storeShopPhoto };
