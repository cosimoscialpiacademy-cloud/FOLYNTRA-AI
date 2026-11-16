/** Preparazione nel browser di un'immagine caricata dall'utente per la copertina (ridimensiona e comprime). */
export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
}

const MAX_SIDE = 2400;
const MAX_BYTES = 2_200_000; // il pacchetto di export ha un limite di 6 MB in totale

export async function prepareCoverImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Formato non supportato: usa JPG, PNG o WebP.');
  if (file.size > 25_000_000) throw new Error('File troppo grande (massimo 25 MB).');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Impossibile leggere l’immagine: il file potrebbe essere danneggiato.');
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Il browser non supporta l’elaborazione delle immagini.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const q of [0.9, 0.82, 0.74, 0.66, 0.58]) {
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    if (dataUrl.length * 0.75 <= MAX_BYTES) return { dataUrl, width, height };
  }
  throw new Error('Immagine troppo pesante anche dopo la compressione: usane una più semplice o più piccola.');
}

async function canvasJpeg(source: ImageBitmap, maxSide: number, maxChars: number): Promise<{ base64: string; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Il browser non supporta l’elaborazione delle immagini.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  for (const q of [0.78, 0.68, 0.58, 0.48, 0.38]) {
    const base64 = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? '';
    if (base64.length <= maxChars) return { base64, width, height };
  }
  throw new Error('Immagine troppo complessa da comprimere: usa uno screenshot più piccolo.');
}

/** Screenshot di una copertina concorrente: lato lungo 720 px, JPEG in base64 (senza prefisso), entro il limite del server. */
export async function prepareCompetitorShot(file: File): Promise<{ base64: string; width: number; height: number }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Formato non supportato: usa JPG, PNG o WebP.');
  if (file.size > 20_000_000) throw new Error('File troppo grande (massimo 20 MB).');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Impossibile leggere l’immagine.');
  });
  try {
    return await canvasJpeg(bitmap, 720, 200_000);
  } finally {
    bitmap.close();
  }
}

/** Riduce un'immagine (es. la nostra copertina disegnata dal server) per inviarla all'agente. */
export async function blobToJpegBase64(blob: Blob, maxSide = 720): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    return (await canvasJpeg(bitmap, maxSide, 200_000)).base64;
  } finally {
    bitmap.close();
  }
}
