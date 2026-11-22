import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (RF-92 / RNF-14)
const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
};

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  filename: string;
}

@Controller('uploads')
export class UploadsController {
  @Post()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (/\.(sql|py|js|sh|exe|bat)$/i.test(file.originalname)) {
          return cb(
            new BadRequestException(
              'Archivo bloqueado por seguridad: no se permiten scripts (.sql, .py, .js) ni ejecutables.',
            ) as any,
            false,
          );
        }
        if (!ALLOWED_MIME[file.mimetype.toLowerCase()]) {
          return cb(
            new BadRequestException(
              'Formato no permitido. Solo se aceptan PDF e imágenes (PNG, JPG, WEBP).',
            ) as any,
            false,
          );
        }
        cb(null, true);
      },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(UPLOADS_DIR)) {
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
          }
          cb(null, UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext =
            ALLOWED_MIME[file.mimetype.toLowerCase()] ||
            path.extname(file.originalname).toLowerCase() ||
            '.bin';
          const base = path
            .basename(file.originalname, path.extname(file.originalname))
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 48);
          const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
          cb(null, `${unique}-${base}${ext}`);
        },
      }),
    }),
  )
  uploadFile(@Req() req: any) {
    const file = req.file as UploadedFileLike | undefined;
    if (!file) {
      throw new BadRequestException(
        'Debes adjuntar un archivo PDF o imagen (máx. 10 MB).',
      );
    }

    const protocol = req.protocol || 'http';
    const host = req.get?.('host') || `localhost:${process.env.PORT || 3000}`;
    const url = `${protocol}://${host}/uploads/${encodeURIComponent(file.filename)}`;

    return {
      url,
      filename: file.filename,
      originalName: file.originalname,
      tipoArchivo: file.mimetype.toLowerCase(),
      tamanoBytes: file.size,
    };
  }
}
