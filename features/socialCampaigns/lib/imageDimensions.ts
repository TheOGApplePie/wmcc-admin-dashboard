export type InstagramImageRatio = "4:5" | "9:16";

export function assertImageRatio(
  width: number,
  height: number,
  ratio: InstagramImageRatio,
) {
  const [x, y] = ratio === "4:5" ? [4, 5] : [9, 16];
  if (!width || !height || width * y !== height * x) {
    throw new Error(
      `Choose a ${ratio} JPEG, such as ${ratio === "4:5" ? "1080 × 1350" : "1080 × 1920"}. This image is ${width} × ${height}.`,
    );
  }
}
export function assertFourByFive(width: number, height: number) {
  assertImageRatio(width, height, "4:5");
}
export async function checkImageFileRatio(
  file: File,
  ratio: InstagramImageRatio = "4:5",
) {
  const bitmap = await createImageBitmap(file);
  try {
    assertImageRatio(bitmap.width, bitmap.height, ratio);
  } finally {
    bitmap.close();
  }
}
export async function checkImageUrlRatio(
  url: string,
  ratio: InstagramImageRatio = "4:5",
) {
  const image = new window.Image();
  image.src = url;
  await image.decode();
  assertImageRatio(image.naturalWidth, image.naturalHeight, ratio);
}
