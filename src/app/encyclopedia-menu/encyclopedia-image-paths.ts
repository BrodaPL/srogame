export function toRawImagePath(imagePath: string): string {
  if (imagePath.includes('/normal/')) {
    return imagePath.replace('/normal/', '/raw/');
  }

  if (imagePath.includes('/small/')) {
    return imagePath.replace('/small/', '/raw/');
  }

  return imagePath;
}
