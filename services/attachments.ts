import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  extensionForMime,
  validateMediaFile,
} from "@/lib/validation/media";
import type {
  Attachment,
  AttachmentDescriptor,
  AttachmentType,
} from "@/types/media";
import { buildStoragePath } from "@/lib/media/storage-path";

export const ATTACHMENT_BUCKETS = {
  image: "chat-images",
  audio: "chat-audio",
  document: "chat-documents",
} as const;

interface AttachmentRow {
  id: string;
  user_id: string;
  conversation_id: string;
  message_id: string | null;
  type: AttachmentType;
  storage_bucket: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  metadata: Record<string, unknown> | null;
}

export function attachmentDescriptorFromRow(row: AttachmentRow): AttachmentDescriptor {
  return {
    id: row.id,
    type: row.type,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    userId: row.user_id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    metadata: row.metadata ?? {},
  };
}

export function attachmentFromDescriptor(
  descriptor: AttachmentDescriptor,
): Attachment {
  return {
    id: descriptor.id,
    type: descriptor.type,
    originalName: descriptor.originalName,
    mimeType: descriptor.mimeType,
    sizeBytes: descriptor.sizeBytes,
    metadata: descriptor.metadata,
    url: `/api/attachments/${descriptor.id}/content`,
  };
}

export function attachmentFromRow(row: AttachmentRow): Attachment {
  return attachmentFromDescriptor(attachmentDescriptorFromRow(row));
}

export async function storeAttachmentDescriptor({
  userId,
  conversationId,
  file,
  type,
  metadata = {},
}: {
  userId: string;
  conversationId: string;
  file: File;
  type: AttachmentType;
  metadata?: Record<string, unknown>;
}) {
  const { extension } = await validateMediaFile(file, type);
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("UNAUTHENTICATED");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");

  const id = crypto.randomUUID();
  const bucket = ATTACHMENT_BUCKETS[type];
  const storagePath = buildStoragePath({
    userId,
    conversationId,
    fileId: id,
    extension,
  });
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      id,
      user_id: userId,
      conversation_id: conversationId,
      message_id: null,
      type,
      storage_bucket: bucket,
      storage_path: storagePath,
      original_name: file.name.slice(0, 255),
      mime_type: file.type,
      size_bytes: file.size,
      metadata,
    })
    .select(
      "id,user_id,conversation_id,message_id,type,storage_bucket,storage_path,original_name,mime_type,size_bytes,metadata",
    )
    .single();

  if (error || !data) {
    await supabase.storage.from(bucket).remove([storagePath]);
    throw error ?? new Error("ATTACHMENT_NOT_SAVED");
  }

  return attachmentDescriptorFromRow(data as AttachmentRow);
}

export async function storeAttachment(options: {
  userId: string;
  conversationId: string;
  file: File;
  type: AttachmentType;
  metadata?: Record<string, unknown>;
}) {
  return attachmentFromDescriptor(await storeAttachmentDescriptor(options));
}

export async function getOwnedAttachments({
  userId,
  conversationId,
  ids,
}: {
  userId: string;
  conversationId: string;
  ids: string[];
}) {
  if (!ids.length) return [] as AttachmentDescriptor[];
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("UNAUTHENTICATED");
  const { data, error } = await supabase
    .from("attachments")
    .select(
      "id,user_id,conversation_id,message_id,type,storage_bucket,storage_path,original_name,mime_type,size_bytes,metadata",
    )
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .in("id", ids);
  if (error) throw error;
  if ((data?.length ?? 0) !== ids.length) throw new Error("ATTACHMENT_NOT_FOUND");
  return (data as AttachmentRow[]).map(attachmentDescriptorFromRow);
}

export async function downloadAttachmentBytes(descriptor: AttachmentDescriptor) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("UNAUTHENTICATED");
  const { data, error } = await supabase.storage
    .from(descriptor.storageBucket)
    .download(descriptor.storagePath);
  if (error || !data) {
    throw error ?? new Error("ATTACHMENT_DOWNLOAD_FAILED");
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function attachmentImageDataUrl(descriptor: AttachmentDescriptor) {
  if (descriptor.type !== "image") throw new Error("ATTACHMENT_NOT_IMAGE");
  const bytes = Buffer.from(await downloadAttachmentBytes(descriptor));
  return `data:${descriptor.mimeType};base64,${bytes.toString("base64")}`;
}

export async function deleteOwnedAttachment(userId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("UNAUTHENTICATED");
  const { data } = await supabase
    .from("attachments")
    .select("id,storage_bucket,storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;

  const { error: storageError } = await supabase.storage
    .from(data.storage_bucket)
    .remove([data.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  return true;
}

export function safeExtensionForMime(mimeType: string) {
  return extensionForMime(mimeType) ?? "bin";
}
