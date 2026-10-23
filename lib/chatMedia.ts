import type * as ImagePicker from "expo-image-picker";

function decodeBase64(value: string): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = value.replace(/[^A-Za-z0-9+/=]/g, "");
  const output = new Uint8Array(
    Math.floor((normalized.length * 3) / 4) -
      (normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0),
  );
  let outputIndex = 0;

  for (let index = 0; index < normalized.length; index += 4) {
    const first = alphabet.indexOf(normalized[index] ?? "A");
    const second = alphabet.indexOf(normalized[index + 1] ?? "A");
    const third = alphabet.indexOf(normalized[index + 2] ?? "A");
    const fourth = alphabet.indexOf(normalized[index + 3] ?? "A");
    const combined =
      (first << 18) | (second << 12) | ((third & 63) << 6) | (fourth & 63);

    if (outputIndex < output.length) output[outputIndex++] = (combined >> 16) & 255;
    if (outputIndex < output.length) output[outputIndex++] = (combined >> 8) & 255;
    if (outputIndex < output.length) output[outputIndex++] = combined & 255;
  }

  return output;
}

export async function imageAssetToBytes(
  asset: ImagePicker.ImagePickerAsset,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  const contentType = asset.mimeType || "image/jpeg";
  if (asset.base64) {
    const bytes = decodeBase64(asset.base64);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return {
      body,
      contentType,
    };
  }

  const response = await fetch(asset.uri);
  if (!response.ok) {
    throw new Error(`Unable to read the selected image (${response.status}).`);
  }
  return { body: await response.arrayBuffer(), contentType };
}
