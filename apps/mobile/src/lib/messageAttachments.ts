import { Platform } from "react-native";

import { MessageAttachmentDraft } from "../types";

export const maxAttachmentSizeBytes = 3_500_000;

export const nativeAttachmentDependencyMessage =
  "إرفاق الملفات والتسجيل الصوتي على الهاتف يحتاج تثبيت حزم Expo للملفات والصوت: expo-document-picker و expo-file-system و expo-av.";

function optionalRequire(moduleName: string) {
  try {
    const loader = Function("return typeof require === 'function' ? require : null")() as
      | ((name: string) => unknown)
      | null;
    return loader ? loader(moduleName) : null;
  } catch {
    return null;
  }
}

function cleanBase64(value: string) {
  return value.includes(",") ? value.split(",").pop() ?? "" : value;
}

function base64ByteLength(base64: string) {
  const clean = cleanBase64(base64).replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function assertAttachmentSize(sizeBytes: number) {
  if (sizeBytes > maxAttachmentSizeBytes) {
    throw new Error("حجم الملف أكبر من الحد المسموح. الحد الأعلى 3.5 ميغابايت.");
  }
}

function normalizeAttachment(input: {
  fileName: string;
  mimeType?: string | null;
  contentBase64: string;
  sizeBytes?: number | null;
}): MessageAttachmentDraft {
  const contentBase64 = cleanBase64(input.contentBase64);
  const sizeBytes = input.sizeBytes && input.sizeBytes > 0 ? input.sizeBytes : base64ByteLength(contentBase64);
  assertAttachmentSize(sizeBytes);

  return {
    fileName: input.fileName.slice(0, 160),
    mimeType: input.mimeType || "application/octet-stream",
    contentBase64,
    sizeBytes
  };
}

export function attachmentDataUri(attachment: MessageAttachmentDraft) {
  return `data:${attachment.mimeType};base64,${attachment.contentBase64}`;
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} بايت`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} ك.ب`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

export function getAttachmentKind(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("pdf")) return "pdf";
  return "file";
}

export async function blobToMessageAttachment(
  blob: unknown,
  fileName: string,
  fallbackMimeType = "application/octet-stream"
) {
  const Reader = (globalThis as Record<string, unknown>).FileReader as
    | (new () => {
        onload: null | (() => void);
        onerror: null | (() => void);
        result: unknown;
        readAsDataURL: (value: unknown) => void;
      })
    | undefined;

  if (!Reader) {
    throw new Error("قراءة الملفات غير مدعومة في هذه البيئة.");
  }

  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new Reader();
    reader.onload = () => resolve(cleanBase64(String(reader.result ?? "")));
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(blob);
  });

  const blobSize = typeof blob === "object" && blob && "size" in blob ? Number((blob as { size?: number }).size) : null;
  const blobType = typeof blob === "object" && blob && "type" in blob ? String((blob as { type?: string }).type) : "";

  return normalizeAttachment({
    fileName,
    mimeType: blobType || fallbackMimeType,
    contentBase64,
    sizeBytes: blobSize
  });
}

async function fileToMessageAttachment(file: unknown) {
  const fileRecord = file as { name?: string; type?: string; size?: number };
  if (fileRecord.size) assertAttachmentSize(fileRecord.size);

  return blobToMessageAttachment(file, fileRecord.name || `attachment-${Date.now()}`, fileRecord.type || undefined);
}

async function pickWebAttachment() {
  const documentRef = (globalThis as Record<string, unknown>).document as
    | {
        body?: { appendChild: (node: unknown) => void; removeChild: (node: unknown) => void };
        createElement: (tagName: string) => {
          type: string;
          accept: string;
          multiple: boolean;
          files?: unknown[];
          style: { display: string };
          onchange: null | (() => void);
          oncancel: null | (() => void);
          click: () => void;
        };
      }
    | undefined;

  if (!documentRef?.body) {
    throw new Error("اختيار الملفات غير مدعوم في هذه البيئة.");
  }

  const input = documentRef.createElement("input");
  input.type = "file";
  input.accept = "image/*,audio/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt";
  input.multiple = false;
  input.style.display = "none";
  documentRef.body.appendChild(input);

  return new Promise<MessageAttachmentDraft | null>((resolve, reject) => {
    const cleanup = () => {
      try {
        documentRef.body?.removeChild(input);
      } catch {
        undefined;
      }
    };

    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    input.onchange = () => {
      const selected = input.files?.[0];
      if (!selected) {
        cleanup();
        resolve(null);
        return;
      }

      fileToMessageAttachment(selected)
        .then((attachment) => {
          cleanup();
          resolve(attachment);
        })
        .catch((error) => {
          cleanup();
          reject(error);
        });
    };

    input.click();
  });
}

async function pickNativeAttachment() {
  const DocumentPicker = optionalRequire("expo-document-picker") as
    | {
        getDocumentAsync: (options: Record<string, unknown>) => Promise<{
          canceled?: boolean;
          type?: string;
          assets?: Array<{ uri: string; name?: string; mimeType?: string; size?: number }>;
          uri?: string;
          name?: string;
          mimeType?: string;
          size?: number;
        }>;
      }
    | null;
  const FileSystem = optionalRequire("expo-file-system") as
    | {
        EncodingType?: { Base64?: string };
        readAsStringAsync: (uri: string, options: Record<string, unknown>) => Promise<string>;
      }
    | null;

  if (!DocumentPicker || !FileSystem) {
    throw new Error(nativeAttachmentDependencyMessage);
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false
  });

  if (result.canceled) return null;

  const asset = result.assets?.[0] ?? result;
  if (!asset.uri) return null;
  if (asset.size) assertAttachmentSize(asset.size);

  const contentBase64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType?.Base64 ?? "base64"
  });

  return normalizeAttachment({
    fileName: asset.name || `attachment-${Date.now()}`,
    mimeType: asset.mimeType,
    contentBase64,
    sizeBytes: asset.size
  });
}

export function pickMessageAttachment() {
  return Platform.OS === "web" ? pickWebAttachment() : pickNativeAttachment();
}

export async function startNativeAudioRecording() {
  const ExpoAv = optionalRequire("expo-av") as
    | {
        Audio?: {
          requestPermissionsAsync?: () => Promise<{ status?: string; granted?: boolean }>;
          setAudioModeAsync?: (mode: Record<string, unknown>) => Promise<void>;
          Recording?: {
            createAsync?: (options: Record<string, unknown>) => Promise<{ recording: unknown }>;
            new (): {
              prepareToRecordAsync: (options: Record<string, unknown>) => Promise<void>;
              startAsync: () => Promise<void>;
            };
          };
          RecordingOptionsPresets?: { HIGH_QUALITY?: Record<string, unknown> };
        };
      }
    | null;

  const Audio = ExpoAv?.Audio;
  if (!Audio?.Recording) {
    throw new Error(nativeAttachmentDependencyMessage);
  }

  const permission = await Audio.requestPermissionsAsync?.();
  if (permission && permission.status !== "granted" && permission.granted !== true) {
    throw new Error("لم يتم منح صلاحية الميكروفون.");
  }

  await Audio.setAudioModeAsync?.({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    staysActiveInBackground: false
  });

  const recordingOptions = Audio.RecordingOptionsPresets?.HIGH_QUALITY ?? {};
  if (Audio.Recording.createAsync) {
    const result = await Audio.Recording.createAsync(recordingOptions);
    return result.recording;
  }

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(recordingOptions);
  await recording.startAsync();
  return recording;
}

export async function stopNativeAudioRecording(recording: unknown) {
  const recorder = recording as {
    stopAndUnloadAsync?: () => Promise<void>;
    getURI?: () => string | null;
  };
  const FileSystem = optionalRequire("expo-file-system") as
    | {
        EncodingType?: { Base64?: string };
        readAsStringAsync: (uri: string, options: Record<string, unknown>) => Promise<string>;
      }
    | null;

  if (!recorder?.stopAndUnloadAsync || !FileSystem) {
    throw new Error(nativeAttachmentDependencyMessage);
  }

  await recorder.stopAndUnloadAsync();
  const uri = recorder.getURI?.();
  if (!uri) {
    throw new Error("تعذر حفظ التسجيل الصوتي.");
  }

  const contentBase64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType?.Base64 ?? "base64"
  });

  return normalizeAttachment({
    fileName: `voice-note-${Date.now()}.m4a`,
    mimeType: "audio/mp4",
    contentBase64
  });
}
