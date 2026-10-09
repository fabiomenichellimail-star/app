import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

// Crop the central receipt region, straighten and resize for faster/cleaner OCR.
// All local; the temporary image is deleted by the caller after OCR.
export async function cropAndPrepare(
  uri: string, width: number, height: number
): Promise<string> {
  // central vertical region matching the on-screen guide (86% x 80%)
  const cw = Math.round(width * 0.86);
  const ch = Math.round(height * 0.8);
  const ox = Math.round((width - cw) / 2);
  const oy = Math.round((height - ch) / 2);
  const actions: ImageManipulator.Action[] = [
    { crop: { originX: ox, originY: oy, width: cw, height: ch } },
  ];
  if (cw > 1500) {
    actions.push({ resize: { width: 1500 } });
  }
  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8, format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

// Permanently remove a temporary photo (photos are never kept).
export async function deleteTemp(uri?: string | null) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}
}
