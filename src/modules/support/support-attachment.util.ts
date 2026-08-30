import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

/** Support attachments cap at 10 MB per file. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Presigned download URLs live long enough to open, not to be shared around. */
export const ATTACHMENT_URL_TTL_SECONDS = 3600;

/** Only images a browser/Flutter can render, plus PDF documents. */
export const ALLOWED_ATTACHMENT_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

/** The multipart shape Multer's memory storage hands the controller. */
export interface UploadedAttachment {
  originalname?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Rejects a missing, oversized, or disallowed-type file before anything is written. */
export function assertValidAttachment(
  file?: UploadedAttachment,
): asserts file is UploadedAttachment {
  if (!file) {
    throw new BadRequestException({ error: 'NO_FILE', message: 'No file sent' });
  }
  if (!ALLOWED_ATTACHMENT_MIME[file.mimetype]) {
    throw new BadRequestException({
      error: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Attachments must be JPEG, PNG, WebP, GIF or PDF',
    });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new BadRequestException({
      error: 'FILE_TOO_LARGE',
      message: 'Each attachment must be 10 MB or smaller',
    });
  }
}

/** A conservative, path-safe rendering of a user-supplied filename. */
export function safeAttachmentName(name?: string): string {
  const base = (name ?? 'file').split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned.slice(0, 200) || 'file';
}

/** Object key layout: `support/<ticketId>/<messageId>/<uuid>-<safeFilename>`. */
export function attachmentObjectKey(
  ticketId: string,
  messageId: string,
  filename?: string,
): string {
  return `support/${ticketId}/${messageId}/${randomUUID()}-${safeAttachmentName(filename)}`;
}
