import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { config } from '../../config/env.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { query } from '../../database/db.js';

function isValidImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  // WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return true;
  }
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  return false;
}

export class StorageService {
  private visitorsDir: string;
  private documentsDir: string;

  constructor() {
    this.visitorsDir = path.resolve(config.storage.uploadDir, 'visitors');
    this.documentsDir = path.resolve(config.storage.uploadDir, 'documents');
    this.ensureDirectories();
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.visitorsDir)) {
      fs.mkdirSync(this.visitorsDir, { recursive: true });
    }
    if (!fs.existsSync(this.documentsDir)) {
      fs.mkdirSync(this.documentsDir, { recursive: true });
    }
  }

  /**
   * Save a base64 image data URL (captured from webcam or mobile camera / file upload)
   * Validates MIME type, file size, magic bytes, and generates a safe random filename.
   */
  public async saveBase64Photo(base64Data: string, prefix = 'photo'): Promise<string> {
    if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image')) {
      throw new Error('Invalid image format. Expected data:image/* data URL.');
    }

    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches || matches.length < 3) {
      throw new Error('Malformed base64 image data string.');
    }

    let rawExt = matches[1].toLowerCase();
    if (rawExt === 'jpeg') rawExt = 'jpg';

    const allowedExts = ['jpg', 'png', 'webp', 'gif'];
    if (!allowedExts.includes(rawExt)) {
      throw new Error('Unsupported image format. Allowed: JPG, PNG, WebP.');
    }

    const buffer = Buffer.from(matches[2], 'base64');

    // Max file size validation (default 5MB)
    const maxBytes = config.storage.maxFileSizeMb * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new Error(`Image size exceeds limit of ${config.storage.maxFileSizeMb}MB.`);
    }

    // Magic bytes content validation
    if (!isValidImageMagicBytes(buffer)) {
      throw new Error('Invalid image content. Magic byte verification failed.');
    }

    // Generate random collision-free filename
    const safePrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `${safePrefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${rawExt}`;
    const filePath = path.join(this.visitorsDir, filename);

    await fs.promises.writeFile(filePath, buffer);
    return `/api/storage/visitors/${filename}`;
  }

  public getVisitorPhotoPath(filename: string): string {
    const sanitized = path.basename(filename);
    const resolved = path.resolve(this.visitorsDir, sanitized);
    if (!resolved.startsWith(this.visitorsDir)) {
      throw new Error('Invalid file path traversal attempt.');
    }
    return resolved;
  }
}

export const storageService = new StorageService();

const router = Router();

// Private photo streaming endpoint: requires authentication, organization check, and private caching
router.get('/visitors/:filename', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = String(req.params.filename);
    const filePath = storageService.getVisitorPhotoPath(filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'Photo not found.' } });
      return;
    }

    // Verify organization and site authorization for the requested photo
    const photoUrlFragment = `/api/storage/visitors/${path.basename(filename)}`;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const userOrgId = req.user!.organizationId;
    const allowedSites = req.user!.allowedSiteIds || [];

    // Check all visits referencing this photo (as check-in photo or visitor profile photo)
    const photoVisitsRes = await query(`
      SELECT v.site_id, v.organization_id
      FROM visits v
      WHERE (v.checkin_photo_url = $1 OR v.visitor_id IN (SELECT id FROM visitors WHERE photo_url = $1 AND deleted_at IS NULL))
        AND v.deleted_at IS NULL
    `, [photoUrlFragment]);

    if (photoVisitsRes.rows.length > 0) {
      const orgId = photoVisitsRes.rows[0].organization_id;
      if (!isSuperAdmin && orgId !== userOrgId) {
        res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_PHOTO_ACCESS', message: 'Not authorized for this photo.' } });
        return;
      }

      // Priority 6: User authorized only for Site A must NOT retrieve Site B photo
      if (!isSuperAdmin) {
        const associatedSiteIds = photoVisitsRes.rows.map((r: any) => r.site_id);
        const hasSiteAccess = associatedSiteIds.some((sId: string) => allowedSites.includes(sId));
        if (!hasSiteAccess) {
          res.status(403).json({
            success: false,
            error: { code: 'UNAUTHORIZED_PHOTO_ACCESS', message: 'You are not authorized to view visitor photos for this factory site.' }
          });
          return;
        }
      }
    } else {
      // Fallback check against visitor master record if no visit has been registered yet
      const visitorRes = await query(`
        SELECT organization_id FROM visitors WHERE photo_url = $1 AND deleted_at IS NULL
      `, [photoUrlFragment]);

      if (visitorRes.rows.length > 0) {
        const visitorOrgId = visitorRes.rows[0].organization_id;
        if (!isSuperAdmin && visitorOrgId !== userOrgId) {
          res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_PHOTO_ACCESS', message: 'Not authorized for this photo.' } });
          return;
        }
      }
    }

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'PHOTO_STREAM_FAILED', message: 'Failed to retrieve visitor photo.' } });
  }
});

export const storageRouter = router;
