import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import type { GstInvoiceData } from './types/invoice.types';
import {
  formatAddress,
  formatCurrency,
  formatPaymentMethod,
  formatPaymentStatus,
} from './utils/gst.util';

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(private readonly configService: ConfigService) {}

  async generatePdf(data: GstInvoiceData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.renderInvoice(doc, data);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private renderInvoice(doc: PDFKit.PDFDocument, data: GstInvoiceData): void {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    // Header
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#1a1a1a')
      .text('TAX INVOICE', left, doc.y, { align: 'center', width: pageWidth });

    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text('GST Compliant Invoice', left, doc.y, { align: 'center', width: pageWidth });

    doc.moveDown(1.2);

    // Company block (left) + Invoice meta (right)
    const headerTop = doc.y;

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111111');
    doc.text(data.company.name, left, headerTop, { width: pageWidth * 0.55 });

    doc.fontSize(9).font('Helvetica').fillColor('#333333');
    doc.text(`GSTIN: ${data.company.gstin || 'N/A'}`, left);
    doc.text(
      [
        data.company.addressLine1,
        data.company.addressLine2,
        `${data.company.city}, ${data.company.state} - ${data.company.pincode}`,
      ]
        .filter(Boolean)
        .join('\n'),
      left,
    );
    if (data.company.phone) doc.text(`Phone: ${data.company.phone}`);
    if (data.company.email) doc.text(`Email: ${data.company.email}`);

    const metaX = left + pageWidth * 0.58;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111');
    doc.text('Invoice No:', metaX, headerTop, { continued: true, width: 90 });
    doc.font('Helvetica').text(` ${data.invoiceNumber}`);

    doc.font('Helvetica-Bold').text('Invoice Date:', metaX, doc.y, {
      continued: true,
      width: 90,
    });
    doc.font('Helvetica').text(
      ` ${new Date(data.invoiceDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`,
    );

    doc.font('Helvetica-Bold').text('Order No:', metaX, doc.y, {
      continued: true,
      width: 90,
    });
    doc.font('Helvetica').text(` ${data.orderNumber}`);

    doc.font('Helvetica-Bold').text('Status:', metaX, doc.y, {
      continued: true,
      width: 90,
    });
    doc.font('Helvetica').text(` ${data.status}`);

    doc.moveDown(2);

    // Customer & addresses
    const addressTop = doc.y;
    const colWidth = pageWidth / 2 - 8;

    this.drawSectionTitle(doc, 'Bill To', left, addressTop);
    this.drawCustomerBlock(doc, data, left, addressTop + 16, colWidth);

    const shipX = left + colWidth + 16;
    this.drawSectionTitle(doc, 'Ship To', shipX, addressTop);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#333333')
      .text(formatAddress(data.shippingAddress), shipX, addressTop + 16, {
        width: colWidth,
      });

    doc.y = Math.max(doc.y, addressTop + 80);
    doc.moveDown(1.5);

    // Items table
    this.drawItemsTable(doc, data, left, pageWidth);

    doc.moveDown(1);

    // Totals + QR placeholder side by side
    const totalsTop = doc.y;
    const totalsWidth = pageWidth * 0.55;
    const qrX = left + totalsWidth + 20;
    const qrSize = 90;

    this.drawTotals(doc, data, left, totalsTop, totalsWidth);

    doc
      .rect(qrX, totalsTop, qrSize, qrSize)
      .strokeColor('#cccccc')
      .lineWidth(1)
      .stroke();
    doc
      .fontSize(8)
      .fillColor('#999999')
      .font('Helvetica')
      .text('QR Code\n(Placeholder)', qrX, totalsTop + qrSize / 2 - 12, {
        width: qrSize,
        align: 'center',
      });

    doc.y = Math.max(doc.y, totalsTop + qrSize + 10);
    doc.moveDown(1.5);

    // Payment info
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#111111');
    doc.text('Payment Details', left);
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    doc.text(
      `Method: ${formatPaymentMethod(data.paymentMethod)}  |  Status: ${formatPaymentStatus(data.paymentStatus)}`,
      left,
    );

    doc.moveDown(1.5);

    // Terms
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
    doc.text('Terms & Conditions', left);
    doc.font('Helvetica').fontSize(8).fillColor('#555555');
    doc.text(data.termsAndConditions, left, doc.y, { width: pageWidth });

    doc.moveDown(1);
    doc
      .fontSize(7)
      .fillColor('#999999')
      .text(
        'This is a computer-generated invoice and does not require a physical signature.',
        left,
        doc.page.height - doc.page.margins.bottom - 20,
        { align: 'center', width: pageWidth },
      );
  }

  private drawSectionTitle(
    doc: PDFKit.PDFDocument,
    title: string,
    x: number,
    y: number,
  ): void {
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111').text(title, x, y);
  }

  private drawCustomerBlock(
    doc: PDFKit.PDFDocument,
    data: GstInvoiceData,
    x: number,
    y: number,
    width: number,
  ): void {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
    doc.text(
      data.customer.companyName ?? data.customer.fullName ?? 'Customer',
      x,
      y,
      { width },
    );
    doc.font('Helvetica');
    if (data.customer.gstNumber) doc.text(`GSTIN: ${data.customer.gstNumber}`, x);
    doc.text(`Phone: ${data.customer.phone}`, x);
    if (data.customer.email) doc.text(`Email: ${data.customer.email}`, x);
    doc.text(formatAddress(data.billingAddress), x, doc.y, { width });
  }

  private drawItemsTable(
    doc: PDFKit.PDFDocument,
    data: GstInvoiceData,
    left: number,
    pageWidth: number,
  ): void {
    const cols = {
      sno: 28,
      desc: pageWidth - 28 - 45 - 55 - 55 - 55 - 55 - 55,
      qty: 45,
      rate: 55,
      disc: 55,
      gst: 55,
      tax: 55,
      amount: 55,
    };

    const tableTop = doc.y;
    const rowHeight = 20;
    const headerBg = '#f3f4f6';

    doc.rect(left, tableTop, pageWidth, rowHeight).fill(headerBg);
    doc.fillColor('#111111').fontSize(8).font('Helvetica-Bold');

    let x = left + 4;
    doc.text('#', x, tableTop + 6, { width: cols.sno - 4 });
    x += cols.sno;
    doc.text('Description', x, tableTop + 6, { width: cols.desc - 4 });
    x += cols.desc;
    doc.text('Qty', x, tableTop + 6, { width: cols.qty - 4, align: 'right' });
    x += cols.qty;
    doc.text('Rate', x, tableTop + 6, { width: cols.rate - 4, align: 'right' });
    x += cols.rate;
    doc.text('Disc.', x, tableTop + 6, { width: cols.disc - 4, align: 'right' });
    x += cols.disc;
    doc.text('GST%', x, tableTop + 6, { width: cols.gst - 4, align: 'right' });
    x += cols.gst;
    doc.text('Tax', x, tableTop + 6, { width: cols.tax - 4, align: 'right' });
    x += cols.tax;
    doc.text('Amount', x, tableTop + 6, { width: cols.amount - 4, align: 'right' });

    let y = tableTop + rowHeight;
    doc.font('Helvetica').fontSize(8).fillColor('#333333');

    data.items.forEach((item, index) => {
      if (y > doc.page.height - doc.page.margins.bottom - 120) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      if (index % 2 === 1) {
        doc.rect(left, y, pageWidth, rowHeight).fill('#fafafa');
        doc.fillColor('#333333');
      }

      const lineTotal = item.subtotal + (item.gstAmount ?? 0);
      x = left + 4;
      doc.text(String(index + 1), x, y + 6, { width: cols.sno - 4 });
      x += cols.sno;
      doc.text(`${item.name} (${item.unit})`, x, y + 6, {
        width: cols.desc - 4,
        ellipsis: true,
      });
      x += cols.desc;
      doc.text(String(item.quantity), x, y + 6, {
        width: cols.qty - 4,
        align: 'right',
      });
      x += cols.qty;
      doc.text(formatCurrency(item.unitPrice), x, y + 6, {
        width: cols.rate - 4,
        align: 'right',
      });
      x += cols.rate;
      doc.text(formatCurrency(item.discount ?? 0), x, y + 6, {
        width: cols.disc - 4,
        align: 'right',
      });
      x += cols.disc;
      doc.text(`${item.gst}%`, x, y + 6, {
        width: cols.gst - 4,
        align: 'right',
      });
      x += cols.gst;
      doc.text(formatCurrency(item.gstAmount ?? 0), x, y + 6, {
        width: cols.tax - 4,
        align: 'right',
      });
      x += cols.tax;
      doc.text(formatCurrency(lineTotal), x, y + 6, {
        width: cols.amount - 4,
        align: 'right',
      });

      y += rowHeight;
    });

    doc
      .moveTo(left, y)
      .lineTo(left + pageWidth, y)
      .strokeColor('#dddddd')
      .stroke();

    doc.y = y + 8;
  }

  private drawTotals(
    doc: PDFKit.PDFDocument,
    data: GstInvoiceData,
    left: number,
    top: number,
    width: number,
  ): void {
    const labelX = left;
    const valueX = left + width - 100;
    let y = top;

    const rows: Array<[string, number, boolean?]> = [
      ['Subtotal', data.subtotal],
      ['Discount', -data.discountAmount],
      ['Delivery Charges', data.deliveryCharge],
      ['Loyalty Redeemed', -data.loyaltyRedeemedAmount],
      ['Membership Discount', -data.membershipDiscount],
      ['Bulk Discount', -data.bulkDiscount],
    ];

    doc.fontSize(9).font('Helvetica').fillColor('#333333');

    for (const [label, amount] of rows) {
      if (amount === 0) continue;
      doc.text(label, labelX, y, { width: width - 110 });
      doc.text(formatCurrency(Math.abs(amount)), valueX, y, {
        width: 100,
        align: 'right',
      });
      y += 16;
    }

    y += 4;
    doc.font('Helvetica-Bold');
    doc.text('GST Total', labelX, y);
    doc.text(formatCurrency(data.gstAmount), valueX, y, {
      width: 100,
      align: 'right',
    });
    y += 16;

    if (data.taxBreakdown.isInterState) {
      doc.font('Helvetica');
      doc.text('IGST', labelX + 12, y);
      doc.text(formatCurrency(data.taxBreakdown.igst), valueX, y, {
        width: 100,
        align: 'right',
      });
      y += 14;
    } else {
      doc.font('Helvetica');
      doc.text('CGST', labelX + 12, y);
      doc.text(formatCurrency(data.taxBreakdown.cgst), valueX, y, {
        width: 100,
        align: 'right',
      });
      y += 14;
      doc.text('SGST', labelX + 12, y);
      doc.text(formatCurrency(data.taxBreakdown.sgst), valueX, y, {
        width: 100,
        align: 'right',
      });
      y += 14;
    }

    y += 6;
    doc
      .moveTo(labelX, y)
      .lineTo(labelX + width, y)
      .strokeColor('#111111')
      .lineWidth(1)
      .stroke();
    y += 8;

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111');
    doc.text('Grand Total', labelX, y);
    doc.text(formatCurrency(data.grandTotal), valueX, y, {
      width: 100,
      align: 'right',
    });

    doc.y = y + 20;
  }
}
