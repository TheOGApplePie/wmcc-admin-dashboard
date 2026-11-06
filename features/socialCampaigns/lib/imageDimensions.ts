export function assertFourByFive(width: number, height: number) {
  if (!width || !height || width * 5 !== height * 4) {
    throw new Error(`Choose a 4:5 image, such as 1080 × 1350. This image is ${width} × ${height}.`);
  }
}

export async function checkImageFileRatio(file: File) {
  const bitmap = await createImageBitmap(file);
  try { assertFourByFive(bitmap.width, bitmap.height); }
  finally { bitmap.close(); }
}

export async function checkImageUrlRatio(url: string) {
  const image = new window.Image();
  image.src = url;
  await image.decode();
  assertFourByFive(image.naturalWidth, image.naturalHeight);
}
