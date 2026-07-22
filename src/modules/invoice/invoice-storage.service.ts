import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';

@Injectable()
export class InvoiceStorageService {
  private readonly logger = new Logger(InvoiceStorageService.name);
  private readonly uploadsDir: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadsDir = this.configService.get<string>(
      'invoice.uploadsDir',
      'uploads/invoices',
    );
  }

  private resolveAbsolutePath(relativePath: string): string {
    return resolve(process.cwd(), relativePath);
  }

  getRelativePath(invoiceId: string): string {
    return join(this.uploadsDir, `${invoiceId}.pdf`);
  }

  async savePdf(invoiceId: string, buffer: Buffer): Promise<string> {
    const relativePath = this.getRelativePath(invoiceId);
    const absolutePath = this.resolveAbsolutePath(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
    this.logger.log(`Saved invoice PDF: ${relativePath}`);
    return relativePath;
  }

  async readPdf(relativePath: string): Promise<Buffer | null> {
    try {
      const absolutePath = this.resolveAbsolutePath(relativePath);
      return await readFile(absolutePath);
    } catch {
      return null;
    }
  }

  async deletePdf(relativePath: string | null | undefined): Promise<void> {
    if (!relativePath) return;
    try {
      const absolutePath = this.resolveAbsolutePath(relativePath);
      await unlink(absolutePath);
      this.logger.log(`Deleted invoice PDF: ${relativePath}`);
    } catch {
      // File may not exist — safe to ignore
    }
  }
}
