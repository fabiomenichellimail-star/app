import TextRecognition, { TextRecognitionScript } from "@react-native-ml-kit/text-recognition";

// On-device OCR (Google ML Kit, bundled Latin model). Works fully offline.
// Returns the recognized plain text (lines preserved).
export async function recognizeText(imageUri: string): Promise<string> {
  const result: any = await TextRecognition.recognize(imageUri, TextRecognitionScript.LATIN);
  if (result?.text) return result.text as string;
  if (Array.isArray(result?.blocks)) {
    return result.blocks.map((b: any) => b.text).join("\n");
  }
  return "";
}
