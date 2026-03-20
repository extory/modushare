import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

const MAX_DIMENSION = 2048;

export const imageService = {
  async validateAndSaveImage(
    buffer: Buffer,
    userId: string
  ): Promise<string> {
    // Validate that sharp can read the buffer (will throw on invalid image)
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image: could not read dimensions');
    }

    // Resize if necessary
    let pipeline = sharp(buffer);
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const outputBuffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();

    const userUploadDir = path.join(config.UPLOAD_DIR, userId);
    if (!fs.existsSync(userUploadDir)) {
      fs.mkdirSync(userUploadDir, { recursive: true });
    }

    const filename = `${uuidv4()}.png`;
    const absolutePath = path.join(userUploadDir, filename);
    fs.writeFileSync(absolutePath, outputBuffer);

    // Return a relative path that is safe to expose via the /uploads route
    return `${userId}/${filename}`;
  },

  getAbsolutePath(relativePath: string): string {
    return path.join(config.UPLOAD_DIR, relativePath);
  },
};
