import { Module } from '@nestjs/common';
import { EmailModule } from '../../common/email/email.module';
import { CustomerInvoicesController } from './customer-invoices.controller';
import { InvoiceController } from './invoice.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceStorageService } from './invoice-storage.service';
import { InvoiceService } from './invoice.service';

@Module({
  imports: [EmailModule],
  controllers: [InvoiceController, CustomerInvoicesController],
  providers: [InvoiceService, InvoicePdfService, InvoiceStorageService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
