export function buildStoragePath({
  userId,
  conversationId,
  fileId,
  extension,
}: {
  userId: string;
  conversationId: string;
  fileId: string;
  extension: string;
}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(userId) ||
    !uuid.test(conversationId) ||
    !uuid.test(fileId) ||
    !/^[a-z0-9]{2,5}$/i.test(extension)
  ) {
    throw new Error("INVALID_STORAGE_PATH");
  }
  return `${userId}/${conversationId}/${fileId}.${extension.toLowerCase()}`;
}
