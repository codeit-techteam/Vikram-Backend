export interface InvoiceFinancialSnapshot {
  loyaltyPointsUsed: number;
  loyaltyRedeemedAmount: number;
  membershipDiscount: number;
  bulkDiscount: number;
  bulkOrder: boolean;
}

export interface InvoiceAddress {
  id?: string;
  label?: string | null;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface InvoiceLineItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  gst: number;
  subtotal: number;
  discount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  gstAmount?: number;
}

export interface GstTaxBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  isInterState: boolean;
}

export interface GstInvoiceData {
  company: {
    name: string;
    gstin: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    website: string;
  };
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  status: string;
  customer: {
    fullName: string | null;
    phone: string;
    email: string | null;
    companyName: string | null;
    gstNumber: string | null;
  };
  billingAddress: InvoiceAddress;
  shippingAddress: InvoiceAddress;
  items: InvoiceLineItem[];
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  loyaltyPointsUsed: number;
  loyaltyRedeemedAmount: number;
  membershipDiscount: number;
  bulkDiscount: number;
  gstAmount: number;
  taxBreakdown: GstTaxBreakdown;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  termsAndConditions: string;
}
