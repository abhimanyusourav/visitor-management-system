import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { config } from '../../config/env.js';

export class StorageService {
  private visitorsDir: string;
  private documentsDir: string;

  constructor() {
    this.visitorsDir = path.join(config.storage.uploadDir, 'visitors');
    this.documentsDir = path.join(config.storage.uploadDir, 'documents');
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
   */
  public async saveBase64Photo(base64Data: string, prefix = 'photo'): Promise<string> {
    if (!base64Data.startsWith('data:image')) {
      throw new Error('Invalid image format. Expected data:image/* data URL.');
    }

    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches || matches.length < 3) {
      throw new Error('Malformed base64 image data string.');
    }

    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');

    // Max file size validation
    const maxBytes = config.storage.maxFileSizeMb * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new Error(`Image size exceeds limit of ${config.storage.maxFileSizeMb}MB.`);
    }

    const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const filePath = path.join(this.visitorsDir, filename);

    await fs.promises.writeFile(filePath, buffer);
    return `/api/storage/visitors/${filename}`;
  }

  public getVisitorPhotoPath(filename: string): string {
    const sanitized = path.basename(filename);
    return path.join(this.visitorsDir, sanitized);
  }
}

export const storageService = new StorageService();

const router = Router();

// Public photo streaming endpoint for badge rendering and verification
router.get('/visitors/:filename', (req: Request, res: Response): void => {
  const filename = String(req.params.filename);
  const filePath = storageService.getVisitorPhotoPath(filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'Photo not found' } });
    return;
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

export const storageRouter = router;
