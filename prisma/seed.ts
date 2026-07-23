import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  BannerPlacement,
  BulkEnquiryStatus,
  EntityStatus,
  LoyaltyTier,
  LoyaltyTransactionType,
  MembershipStatus,
  NotificationType,
  OfferType,
  PaymentStatus,
  PrismaClient,
  ProductListingType,
  TestimonialType,
  VideoPlacement,
} from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { seedCmsHome } from './seedCmsHome';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding Customer APP data...');

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'cement' },
      update: {},
      create: {
        slug: 'cement',
        name: 'Cement',
        nameHi: 'सीमेंट',
        labelKey: 'cement',
        imageUrl: '/assets/category-cement.png',
        isFeatured: true,
        displayOrder: 1,
        priority: 10,
      },
    }),
    prisma.category.upsert({
      where: { slug: 'steel' },
      update: {},
      create: {
        slug: 'steel',
        name: 'Steel',
        nameHi: 'स्टील',
        labelKey: 'steel',
        imageUrl: '/assets/category-steel.png',
        isFeatured: true,
        displayOrder: 2,
        priority: 9,
      },
    }),
    prisma.category.upsert({
      where: { slug: 'sand' },
      update: {},
      create: {
        slug: 'sand',
        name: 'Sand',
        nameHi: 'रेत',
        labelKey: 'sand',
        imageUrl: '/assets/category-sand.png',
        isFeatured: true,
        displayOrder: 3,
        priority: 8,
      },
    }),
    prisma.category.upsert({
      where: { slug: 'bricks' },
      update: {},
      create: {
        slug: 'bricks',
        name: 'Bricks & Masonry',
        nameHi: 'ईंट और चिनाई',
        labelKey: 'bricksAndMasonry',
        imageUrl: '/assets/category-bricks.png',
        isFeatured: true,
        displayOrder: 4,
        priority: 7,
      },
    }),
    prisma.category.upsert({
      where: { slug: 'stone-chips' },
      update: {},
      create: {
        slug: 'stone-chips',
        name: 'Stone Chips',
        nameHi: 'गिट्टी',
        labelKey: 'stoneChip',
        imageUrl: '/assets/category-stone.png',
        isFeatured: true,
        displayOrder: 5,
        priority: 6,
      },
    }),
    prisma.category.upsert({
      where: { slug: 'aggregates' },
      update: {},
      create: {
        slug: 'aggregates',
        name: 'Aggregates',
        labelKey: 'aggregates',
        imageUrl: '/assets/category-aggregates.png',
        displayOrder: 6,
      },
    }),
    prisma.category.upsert({
      where: { slug: 'adhesives' },
      update: {},
      create: {
        slug: 'adhesives',
        name: 'Adhesives',
        labelKey: 'adhesives',
        imageUrl: '/assets/category-adhesives.png',
        displayOrder: 7,
      },
    }),
    prisma.category.upsert({
      where: { slug: 'waterproofing' },
      update: {},
      create: {
        slug: 'waterproofing',
        name: 'Waterproofing',
        labelKey: 'waterproofing',
        imageUrl: '/assets/category-waterproofing.png',
        displayOrder: 8,
      },
    }),
  ]);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const products = [
    {
      slug: 'ultratech-premium-ppc-cement',
      sku: 'CEM-UT-53',
      name: 'UltraTech Premium PPC',
      nameHi: 'UltraTech Premium PPC सीमेंट',
      detailName: 'UltraTech Premium PPC Cement',
      brand: 'UltraTech',
      categoryId: categoryMap['cement'],
      grade: '53',
      badge: '⚡ 90 min ETA',
      badgeColor: '#FEB623',
      status: 'READY FOR DISPATCH',
      spec: 'Minimum 20 Bags',
      unit: 'Bag',
      retailPrice: 425,
      bulkPrice: 398,
      bulkThreshold: 50,
      bulkLabel: 'Bulk Price (50+)',
      listingType: ProductListingType.FEATURED,
      isFeatured: true,
      isBestSelling: false,
      gst: 18,
      salesCount: 1250,
      displayOrder: 1,
      description:
        'Premium Portland Pozzolana Cement for high-strength structural construction.',
      specs: {
        GRADE: '53 Grade PPC',
        'SETTING TIME': '30–600 mins',
        STRENGTH: 'Superior Durability',
        COMPRESSION: '27 MPa (3 Days)',
      },
      images: [
        'https://images.unsplash.com/photo-1581094794329-cd11a4e4b8a8?w=800',
      ],
    },
    {
      slug: 'acc-gold-water-shield-cement',
      sku: 'CEM-ACC-WS',
      name: 'ACC Gold Water Shield',
      brand: 'ACC',
      categoryId: categoryMap['cement'],
      grade: '53',
      badge: 'IN STOCK',
      status: 'IN STOCK',
      spec: 'Minimum 20 Bags',
      unit: 'Bag',
      retailPrice: 410,
      bulkPrice: 385,
      bulkThreshold: 50,
      bulkLabel: 'Bulk Price (50+)',
      listingType: ProductListingType.BEST_SELLING,
      isFeatured: false,
      isBestSelling: true,
      gst: 18,
      salesCount: 980,
      displayOrder: 2,
      description: 'Water-resistant cement ideal for coastal and monsoon construction.',
      specs: { GRADE: '53 Grade', FEATURE: 'Water Shield Technology' },
      images: [
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
      ],
    },
    {
      slug: 'tata-tiscon-500d-tmt-bars',
      sku: 'STL-TATA-500D',
      name: 'TATA Tiscon 500D TMT Bars',
      brand: 'TATA Steel',
      categoryId: categoryMap['steel'],
      grade: 'Fe 500D',
      badge: '⚡ 90 min ETA',
      badgeColor: '#FEB623',
      status: 'READY FOR DISPATCH',
      spec: 'Minimum 500 kg',
      unit: 'kg',
      retailPrice: 62,
      bulkPrice: 58,
      bulkThreshold: 1000,
      bulkLabel: 'Bulk Price (1000+ kg)',
      listingType: ProductListingType.FEATURED,
      isFeatured: true,
      isBestSelling: true,
      gst: 18,
      salesCount: 2100,
      displayOrder: 1,
      hasVariants: true,
      description: 'High ductility TMT bars for earthquake-resistant structures.',
      specs: { GRADE: 'Fe 500D', YIELD: '500 MPa', ELONGATION: '16%' },
      images: [
        'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=800',
      ],
      variants: [
        { label: '8mm', price: 62, displayUnit: 'kg' },
        { label: '10mm', price: 62, displayUnit: 'kg' },
        { label: '12mm', price: 63, displayUnit: 'kg' },
        { label: '16mm', price: 63, displayUnit: 'kg' },
      ],
    },
    {
      slug: 'manufactured-sand-m-sand',
      sku: 'SND-MSAND',
      name: 'Manufactured Sand (M-Sand)',
      brand: 'Local',
      categoryId: categoryMap['sand'],
      status: 'IN STOCK',
      spec: 'Minimum 1 CFT',
      unit: 'CFT',
      retailPrice: 55,
      bulkPrice: 48,
      bulkThreshold: 100,
      bulkLabel: 'Bulk Price (100+ CFT)',
      listingType: ProductListingType.NEW_ARRIVAL,
      isFeatured: false,
      isBestSelling: false,
      gst: 5,
      salesCount: 450,
      displayOrder: 1,
      description: 'Premium manufactured sand for plastering and concrete work.',
      specs: { TYPE: 'M-Sand', GRADE: 'Zone II', MOISTURE: '< 5%' },
      images: [
        'https://images.unsplash.com/photo-1589939705382-10e7104a24bc?w=800',
      ],
    },
    {
      slug: 'red-clay-bricks',
      sku: 'BRK-RED-STD',
      name: 'Red Clay Bricks (Standard)',
      brand: 'Local',
      categoryId: categoryMap['bricks'],
      status: 'IN STOCK',
      spec: 'Minimum 500 pcs',
      unit: 'Piece',
      retailPrice: 8,
      bulkPrice: 7,
      bulkThreshold: 5000,
      bulkLabel: 'Bulk Price (5000+ pcs)',
      perPiecePrice: 8,
      listingType: ProductListingType.BEST_SELLING,
      isFeatured: false,
      isBestSelling: true,
      gst: 5,
      salesCount: 3200,
      displayOrder: 1,
      hasVariants: true,
      description: 'Standard red clay bricks for wall construction.',
      specs: { SIZE: '9x4x3 inches', STRENGTH: '3.5 N/mm²' },
      images: [
        'https://images.unsplash.com/photo-1628744448840-55bdb3526085?w=800',
      ],
      variants: [
        { label: '500 pcs', price: 4000, count: 500 },
        { label: '1000 pcs', price: 7500, count: 1000 },
        { label: '5000 pcs', price: 35000, count: 5000 },
      ],
    },
    {
      slug: '20mm-stone-chips',
      sku: 'STN-20MM',
      name: '20mm Stone Chips',
      brand: 'Local',
      categoryId: categoryMap['stone-chips'],
      status: 'IN STOCK',
      spec: 'Minimum 1 CFT',
      unit: 'CFT',
      retailPrice: 42,
      bulkPrice: 38,
      bulkThreshold: 200,
      bulkLabel: 'Bulk Price (200+ CFT)',
      listingType: ProductListingType.NEW_ARRIVAL,
      isFeatured: true,
      isBestSelling: false,
      gst: 5,
      salesCount: 680,
      displayOrder: 1,
      description: '20mm crushed stone chips for concrete and road work.',
      specs: { SIZE: '20mm', TYPE: 'Crushed Stone' },
      images: [
        'https://images.unsplash.com/photo-1518709268805-4e9042af2177?w=800',
      ],
    },
  ];

  for (const p of products) {
    const { images, variants, ...productData } = p;

    // Prefer slug match; fall back to sku so catalog-seed rows with the same SKU
    // but a different slug do not trip the unique constraint on create.
    const existingProduct = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: p.slug },
          ...(p.sku ? [{ sku: p.sku }] : []),
        ],
      },
    });

    const product = existingProduct
      ? existingProduct
      : await prisma.product.create({ data: productData });

    for (const [idx, url] of (images ?? []).entries()) {
      const existing = await prisma.productImage.findFirst({
        where: { productId: product.id, url },
      });
      if (!existing) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url,
            isPrimary: idx === 0,
            displayOrder: idx,
            altText: p.name,
          },
        });
      }
    }

    if (variants) {
      for (const [idx, v] of variants.entries()) {
        const existingVariant = await prisma.productVariant.findFirst({
          where: { productId: product.id, label: v.label },
        });
        if (!existingVariant) {
          await prisma.productVariant.create({
            data: {
              productId: product.id,
              label: v.label,
              displayUnit: 'displayUnit' in v ? v.displayUnit : undefined,
              count: 'count' in v ? v.count : undefined,
              price: v.price,
              displayOrder: idx,
            },
          });
        }
      }
    }
  }

  await prisma.banner.upsert({
    where: { slug: 'monsoon-construction-sale' },
    update: {},
    create: {
      slug: 'monsoon-construction-sale',
      title: 'Monsoon Construction Sale',
      subtitle: 'Up to 15% off on Cement & Steel',
      imageUrl:
        'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200',
      mobileUrl:
        'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800',
      ctaLabel: 'Shop Now',
      linkUrl: '/categories/cement',
      placement: BannerPlacement.HOME_HERO,
      linkType: 'category',
      linkTarget: 'cement',
      displayOrder: 1,
      priority: 10,
    },
  });

  await prisma.banner.upsert({
    where: { slug: 'bulk-procurement-banner' },
    update: {},
    create: {
      slug: 'bulk-procurement-banner',
      title: 'Bulk Procurement Made Easy',
      subtitle: 'Get custom quotes for large orders',
      imageUrl:
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200',
      mobileUrl:
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
      ctaLabel: 'Get Quote',
      linkUrl: '/bulk-procurement',
      placement: BannerPlacement.HOME_HERO,
      linkType: 'route',
      linkTarget: '/bulk-procurement',
      displayOrder: 2,
      priority: 5,
    },
  });

  const bundleProducts = await prisma.product.findMany({
    where: {
      slug: {
        in: [
          'ultratech-premium-ppc-cement',
          'tata-tiscon-500d-tmt-bars',
          'red-clay-bricks',
        ],
      },
    },
  });

  const offer = await prisma.offer.upsert({
    where: { slug: 'construction-starter-bundle' },
    update: {},
    create: {
      slug: 'construction-starter-bundle',
      title: 'Construction Starter Bundle',
      titleHi: 'निर्माण स्टार्टर बंडल',
      description: 'Cement + Steel + Bricks at a special bundle price',
      imageUrl:
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
      offerType: OfferType.BUNDLE,
      discountLabel: 'SAVE ₹7,000',
      bundlePrice: 45000,
      originalPrice: 52000,
      badge: 'SAVE ₹7,000',
      isFeatured: true,
      priority: 10,
      displayOrder: 1,
    },
  });

  for (const [idx, product] of bundleProducts.entries()) {
    await prisma.offerProduct.upsert({
      where: { offerId_productId: { offerId: offer.id, productId: product.id } },
      update: {},
      create: {
        offerId: offer.id,
        productId: product.id,
        quantity: 1,
        displayOrder: idx,
      },
    });
  }

  await prisma.video.upsert({
    where: { slug: 'home-hero-cement' },
    update: {},
    create: {
      slug: 'home-hero-cement',
      title: 'Build Strong with Premium Cement',
      description: 'Watch how Bajriwala delivers quality construction materials',
      videoUrl: '/assets/hero-video.mp4',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1581094794329-cd11a4e4b8a8?w=800',
      placement: VideoPlacement.HOME,
      linkTarget: 'ultratech-premium-ppc-cement',
      displayOrder: 1,
    },
  });

  await prisma.announcement.upsert({
    where: { slug: 'pro-loyalty-program' },
    update: {},
    create: {
      slug: 'pro-loyalty-program',
      title: 'BajriPro Loyalty Program',
      body: 'Earn points on every order. Unlock platinum benefits at 40,000 points.',
      linkTarget: '/account/loyalty',
      displayOrder: 1,
    },
  });

  const notifications = [
    {
      type: NotificationType.PAYMENT,
      label: 'PAYMENT DUE',
      title: 'Pending GST Invoice for Order #88294',
      body: 'Invoice for 500 Bags of Portland Cement is ready. Pay before 6:00 PM to avoid dispatch delay.',
      actionLabel: 'Pay Now',
      actionRoute: '/account/gst-compliance',
      actionVariant: 'filled',
      isGlobal: true,
    },
    {
      type: NotificationType.OFFER,
      label: 'SPECIAL OFFER',
      title: 'Monsoon Bundle: Save ₹2,400 on Cement + Sand',
      body: 'Limited-time bundle offer on UltraTech Cement and River Sand. Valid this week only.',
      actionLabel: 'View Offer',
      actionRoute: '/(tabs)/catalog',
      actionVariant: 'outline',
      isGlobal: true,
    },
    {
      type: NotificationType.ADMIN_ANNOUNCEMENT,
      label: 'ANNOUNCEMENT',
      title: 'New message from Site Manager Rajesh',
      body: 'Gate 3 will be closed for crane movement until 3 PM.',
      isGlobal: true,
    },
    {
      type: NotificationType.DELIVERY,
      label: 'DELIVERY UPDATE',
      title: 'Order #BJW-882 Out for Delivery',
      body: '50 Bags UltraTech Cement dispatched. Arriving by 4:15 PM today.',
      actionLabel: 'Track Order',
      actionRoute: '/(tabs)/orders',
      actionVariant: 'outline',
      isGlobal: true,
    },
    {
      type: NotificationType.ORDER,
      label: 'ORDER CONFIRMED',
      title: 'Order #BJW-901 Confirmed',
      body: 'Your order for TMT Steel Bars has been confirmed and is being packed.',
      actionLabel: 'View Order',
      actionRoute: '/(tabs)/orders',
      actionVariant: 'outline',
      isGlobal: true,
    },
    {
      type: NotificationType.BANNER,
      label: 'PROMO',
      title: 'Free delivery on orders above ₹10,000',
      body: 'Shop construction materials today and enjoy free same-day delivery in your city.',
      actionLabel: 'Shop Now',
      actionRoute: '/(tabs)/catalog',
      actionVariant: 'filled',
      isGlobal: true,
    },
  ];

  for (const n of notifications) {
    const existing = await prisma.notification.findFirst({
      where: { title: n.title },
    });
    if (!existing) {
      await prisma.notification.create({ data: n });
    }
  }

  const popularSearches = [
    { query: 'UltraTech Cement', searchCount: 120, displayOrder: 1 },
    { query: 'TMT Steel Bars', searchCount: 95, displayOrder: 2 },
    { query: 'River Sand', searchCount: 80, displayOrder: 3 },
    { query: 'Red Bricks', searchCount: 70, displayOrder: 4 },
    { query: 'Stone Chips', searchCount: 55, displayOrder: 5 },
  ];

  for (const ps of popularSearches) {
    await prisma.popularSearch.upsert({
      where: { query: ps.query },
      update: {
        searchCount: ps.searchCount,
        displayOrder: ps.displayOrder,
        isActive: true,
      },
      create: ps,
    });
  }

  const roles = [
    {
      slug: 'individual',
      name: 'Individual',
      description: 'Homeowner or personal buyer',
      displayOrder: 1,
    },
    {
      slug: 'contractor',
      name: 'Contractor',
      description: 'Construction contractor or subcontractor',
      displayOrder: 2,
    },
    {
      slug: 'interior-designer',
      name: 'Interior Designer',
      description: 'Interior design professional',
      displayOrder: 3,
    },
    {
      slug: 'builder',
      name: 'Builder',
      description: 'Builder or real estate developer',
      displayOrder: 4,
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name, description: role.description, displayOrder: role.displayOrder },
      create: role,
    });
  }

  // ─── Hubs & Inventory (Phase 4) ─────────────────────────────────────────────

  const hubs = await Promise.all([
    prisma.hub.upsert({
      where: { code: 'HUB-MUM-01' },
      update: {},
      create: {
        code: 'HUB-MUM-01',
        name: 'Bajriwala Mumbai Central Hub',
        addressLine1: 'Plot 12, Industrial Estate, Andheri East',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400069',
        latitude: 19.1136,
        longitude: 72.8697,
        phone: '9876543210',
        isActive: true,
      },
    }),
    prisma.hub.upsert({
      where: { code: 'HUB-PUN-01' },
      update: {},
      create: {
        code: 'HUB-PUN-01',
        name: 'Bajriwala Pune Hub',
        addressLine1: 'Survey No. 45, Hadapsar Industrial Area',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411013',
        latitude: 18.5089,
        longitude: 73.926,
        phone: '9876543211',
        isActive: true,
      },
    }),
    prisma.hub.upsert({
      where: { code: 'HUB-DEL-01' },
      update: { name: 'Noida North' },
      create: {
        code: 'HUB-DEL-01',
        name: 'Noida North',
        addressLine1: 'Sector 63, Industrial Area',
        city: 'Noida',
        state: 'Uttar Pradesh',
        pincode: '201301',
        latitude: 28.6276,
        longitude: 77.3649,
        phone: '9876543212',
        isActive: true,
      },
    }),
  ]);

  const allProducts = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  for (const hub of hubs) {
    for (const product of allProducts) {
      await prisma.hubInventory.upsert({
        where: {
          hubId_productId: { hubId: hub.id, productId: product.id },
        },
        update: {},
        create: {
          hubId: hub.id,
          productId: product.id,
          availableQty: 500,
          reservedQty: 0,
          lowStockThreshold: 20,
        },
      });
    }
  }

  console.log(`Seeded ${hubs.length} hubs with inventory for ${allProducts.length} products.`);

  // ─── Hub Panel Users, Drivers & Vehicles ────────────────────────────────────

  const hubPasswordHash = await bcrypt.hash('123456', 10);
  const noidaHub = hubs.find((h) => h.code === 'HUB-DEL-01') ?? hubs[2];
  const mumbaiHub = hubs[0];

  const hubManager = await prisma.hubUser.upsert({
    where: { employeeId: 'hubmanager01' },
    update: {
      passwordHash: hubPasswordHash,
      fullName: 'Amit Sharma',
      email: 'amit.sharma@hubops.com',
      phone: '9876500001',
      role: 'HUB_MANAGER',
      hubId: noidaHub.id,
      isActive: true,
    },
    create: {
      employeeId: 'hubmanager01',
      email: 'amit.sharma@hubops.com',
      passwordHash: hubPasswordHash,
      fullName: 'Amit Sharma',
      phone: '9876500001',
      role: 'HUB_MANAGER',
      hubId: noidaHub.id,
    },
  });

  await prisma.hubUser.upsert({
    where: { employeeId: 'huboperator01' },
    update: {},
    create: {
      employeeId: 'huboperator01',
      email: 'operator@hubops.com',
      passwordHash: hubPasswordHash,
      fullName: 'Hub Operator',
      phone: '9876500002',
      role: 'HUB_OPERATOR',
      hubId: mumbaiHub.id,
    },
  });

  await prisma.hubUser.upsert({
    where: { employeeId: 'dispatch01' },
    update: {},
    create: {
      employeeId: 'dispatch01',
      passwordHash: hubPasswordHash,
      fullName: 'Dispatch Staff',
      role: 'DISPATCH_STAFF',
      hubId: mumbaiHub.id,
    },
  });

  const vehicle1 = await prisma.vehicle.upsert({
    where: { registration: 'MH-12-AB-1234' },
    update: {},
    create: {
      hubId: mumbaiHub.id,
      registration: 'MH-12-AB-1234',
      capacity: 5000,
      vehicleType: 'TRUCK',
      status: 'AVAILABLE',
    },
  });

  const vehicle2 = await prisma.vehicle.upsert({
    where: { registration: 'MH-12-CD-5678' },
    update: {},
    create: {
      hubId: mumbaiHub.id,
      registration: 'MH-12-CD-5678',
      capacity: 2000,
      vehicleType: 'TEMPO',
      status: 'AVAILABLE',
    },
  });

  await prisma.driver.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      hubId: mumbaiHub.id,
      name: 'Ravi Kumar',
      phone: '9876500101',
      vehicleId: vehicle1.id,
      availability: 'AVAILABLE',
    },
  });

  await prisma.driver.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      hubId: mumbaiHub.id,
      name: 'Suresh Patel',
      phone: '9876500102',
      vehicleId: vehicle2.id,
      availability: 'AVAILABLE',
    },
  });

  await prisma.hubNotification.createMany({
    data: [
      {
        hubId: mumbaiHub.id,
        type: 'INVENTORY',
        title: 'Low Stock Alert',
        body: 'Some products are below minimum threshold at Mumbai hub.',
      },
      {
        hubId: mumbaiHub.id,
        type: 'ORDER',
        title: 'New Orders Assigned',
        body: 'New orders have been assigned to your hub.',
      },
    ],
    skipDuplicates: true,
  });

  console.log(`Seeded hub users (login: ${hubManager.employeeId} / 123456), drivers and vehicles.`);

  // ─── Membership, Loyalty, Bulk, Testimonials (Marketplace Extensions) ─

  const membershipPlans = [
    {
      name: 'Silver',
      price: 299,
      durationDays: 30,
      description: 'Essential membership with standard delivery benefits',
      benefits: ['5% off on bulk orders', 'Priority support', 'Free delivery on orders above ₹5,000'],
    },
    {
      name: 'Gold',
      price: 999,
      durationDays: 90,
      description: 'Premium membership with enhanced savings and delivery perks',
      benefits: ['10% membership pricing', 'Free bike delivery', 'Dedicated account manager'],
    },
    {
      name: 'Enterprise',
      price: 4999,
      durationDays: 365,
      description: 'Full-scale procurement membership for builders and contractors',
      benefits: ['15% membership pricing', 'Bulk procurement priority', 'Loading/unloading included'],
    },
  ];

  const seededPlans = [];
  for (const plan of membershipPlans) {
    const existing = await prisma.membershipPlan.findFirst({ where: { name: plan.name } });
    const record = existing
      ? await prisma.membershipPlan.update({
          where: { id: existing.id },
          data: {
            price: plan.price,
            durationDays: plan.durationDays,
            description: plan.description,
            benefits: plan.benefits,
            status: EntityStatus.ACTIVE,
          },
        })
      : await prisma.membershipPlan.create({
          data: {
            name: plan.name,
            price: plan.price,
            durationDays: plan.durationDays,
            description: plan.description,
            benefits: plan.benefits,
            status: EntityStatus.ACTIVE,
          },
        });
    seededPlans.push(record);
  }

  const goldPlan = seededPlans.find((p) => p.name === 'Gold')!;

  const demoCustomer = await prisma.customer.upsert({
    where: { phone: '9999900001' },
    update: { fullName: 'Rajesh Kumar', isVerified: true, profileCompleted: true },
    create: {
      phone: '9999900001',
      email: 'rajesh.kumar@demo.bajriwala.in',
      fullName: 'Rajesh Kumar',
      isVerified: true,
      profileCompleted: true,
    },
  });

  const loyaltyAccount = await prisma.loyaltyAccount.upsert({
    where: { customerId: demoCustomer.id },
    update: {
      currentPoints: 12500,
      availablePoints: 10500,
      redeemedPoints: 2000,
      tier: LoyaltyTier.GOLD,
    },
    create: {
      customerId: demoCustomer.id,
      currentPoints: 12500,
      availablePoints: 10500,
      redeemedPoints: 2000,
      tier: LoyaltyTier.GOLD,
    },
  });

  const existingLoyaltyTx = await prisma.loyaltyTransaction.findFirst({
    where: { accountId: loyaltyAccount.id, reason: 'Points earned on order #BJW-901' },
  });
  if (!existingLoyaltyTx) {
    await prisma.loyaltyTransaction.createMany({
      data: [
        {
          accountId: loyaltyAccount.id,
          points: 12500,
          type: LoyaltyTransactionType.EARN,
          reason: 'Points earned on order #BJW-901',
          referenceId: 'BJW-901',
        },
        {
          accountId: loyaltyAccount.id,
          points: 2000,
          type: LoyaltyTransactionType.REDEEM,
          reason: 'Redeemed for order discount',
          referenceId: 'BJW-882',
        },
      ],
    });
  }

  const purchaseDate = new Date();
  const expiryDate = new Date(purchaseDate);
  expiryDate.setDate(expiryDate.getDate() + goldPlan.durationDays);

  let membership = await prisma.customerMembership.findFirst({
    where: { customerId: demoCustomer.id, planId: goldPlan.id, status: MembershipStatus.ACTIVE },
  });
  if (!membership) {
    membership = await prisma.customerMembership.create({
      data: {
        customerId: demoCustomer.id,
        planId: goldPlan.id,
        purchaseDate,
        expiryDate,
        renewalDate: expiryDate,
        status: MembershipStatus.ACTIVE,
        paymentStatus: PaymentStatus.PAID,
      },
    });
  }

  await prisma.customer.update({
    where: { id: demoCustomer.id },
    data: {
      loyaltyAccountId: loyaltyAccount.id,
      membershipId: membership.id,
    },
  });

  const existingBulkEnquiry = await prisma.bulkEnquiry.findFirst({
    where: {
      customerId: demoCustomer.id,
      projectName: 'Skyline Residency Phase 2',
    },
  });
  if (!existingBulkEnquiry) {
    await prisma.bulkEnquiry.create({
      data: {
        customerId: demoCustomer.id,
        companyName: 'Kumar Constructions Pvt Ltd',
        projectName: 'Skyline Residency Phase 2',
        location: 'Pune, Maharashtra',
        remarks: 'Need cement and TMT bars for foundation work',
        expectedQuantity: 500,
        expectedUnit: 'Bags',
        status: BulkEnquiryStatus.NEW,
      },
    });
  }

  const testimonials = [
    {
      type: TestimonialType.VIDEO,
      customerName: 'Amit Sharma',
      designation: 'Site Engineer',
      company: 'Sharma Infra',
      location: 'Mumbai',
      rating: 5,
      review: 'Bajriwala delivered 200 bags of cement within 90 minutes. Lifesaver for our project timeline.',
      videoUrl: '/assets/testimonials/amit-sharma.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400',
      sortOrder: 1,
      isPublished: true,
    },
    {
      type: TestimonialType.IMAGE,
      customerName: 'Priya Desai',
      designation: 'Interior Designer',
      company: 'Desai Studios',
      location: 'Pune',
      rating: 5,
      review: 'Membership pricing and bulk quotes saved us over ₹40,000 on our last project.',
      imageUrl: 'https://images.unsplash.com/photo-1581094794329-cd11a4e4b8a8?w=400',
      sortOrder: 2,
      isPublished: true,
    },
    {
      type: TestimonialType.IMAGE,
      customerName: 'Vikram Patel',
      designation: 'Builder',
      company: 'Patel Builders',
      location: 'Ahmedabad',
      rating: 4,
      review: 'Reliable material quality and transparent invoicing. Our go-to marketplace for construction supplies.',
      imageUrl: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400',
      sortOrder: 3,
      isPublished: true,
    },
  ];

  for (const testimonial of testimonials) {
    const existing = await prisma.testimonial.findFirst({
      where: { customerName: testimonial.customerName, company: testimonial.company },
    });
    if (!existing) {
      await prisma.testimonial.create({ data: testimonial });
    }
  }

  // Backfill product marketplace fields for seeded catalog
  for (const p of products) {
    await prisma.product.updateMany({
      where: { slug: p.slug },
      data: {
        bulkMinQty: p.bulkThreshold,
        membershipPrice: Math.round(p.retailPrice * 0.9 * 100) / 100,
        showBulkPricing: true,
        stockLeft: 500,
        deliveryETA: '90 min',
      },
    });
  }

  const loyaltyTierSamples: Array<{ phone: string; name: string; tier: LoyaltyTier; points: number }> = [
    { phone: '9999900010', name: 'Bronze Member', tier: LoyaltyTier.BRONZE, points: 500 },
    { phone: '9999900011', name: 'Silver Member', tier: LoyaltyTier.SILVER, points: 2500 },
    { phone: '9999900012', name: 'Platinum Member', tier: LoyaltyTier.PLATINUM, points: 45000 },
  ];

  for (const sample of loyaltyTierSamples) {
    const customer = await prisma.customer.upsert({
      where: { phone: sample.phone },
      update: { fullName: sample.name },
      create: { phone: sample.phone, fullName: sample.name, isVerified: true },
    });

    const account = await prisma.loyaltyAccount.upsert({
      where: { customerId: customer.id },
      update: {
        tier: sample.tier,
        currentPoints: sample.points,
        availablePoints: sample.points,
      },
      create: {
        customerId: customer.id,
        tier: sample.tier,
        currentPoints: sample.points,
        availablePoints: sample.points,
      },
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: { loyaltyAccountId: account.id },
    });
  }

  // ─── Dev login customer: Karan Singh (+918240890242 / OTP 123456) ─────────
  const enterprisePlan =
    seededPlans.find((p) => p.name === 'Enterprise') ?? seededPlans[seededPlans.length - 1]!;

  const karanPhone = '+918240890242';
  const karan = await prisma.customer.upsert({
    where: { phone: karanPhone },
    update: {
      fullName: 'Karan Singh',
      email: 'karan@premierbuild.in',
      isVerified: true,
      profileCompleted: true,
      roleSelected: true,
      status: 'ACTIVE',
      language: 'en',
    },
    create: {
      phone: karanPhone,
      fullName: 'Karan Singh',
      email: 'karan@premierbuild.in',
      isVerified: true,
      profileCompleted: true,
      roleSelected: true,
      status: 'ACTIVE',
      language: 'en',
    },
  });

  await prisma.customerProfile.upsert({
    where: { customerId: karan.id },
    update: {
      companyName: 'Premier Construction Ltd.',
      legalEntityName: 'Premier Construction Private Limited',
      establishmentDate: new Date('2012-05-12'),
      registeredAddress: 'Level 5, Sky Tower, BKC G-Block, Mumbai 400051',
      gstNumber: '27AAACR1234F1Z5',
      gstVerified: true,
      gstVerifiedAt: new Date('2023-10-12T11:45:00.000Z'),
      jurisdiction: 'Maharashtra – Ward 12A',
      panNumber: 'ABCDE1234F',
      businessType: 'Construction Co.',
    },
    create: {
      customerId: karan.id,
      companyName: 'Premier Construction Ltd.',
      legalEntityName: 'Premier Construction Private Limited',
      establishmentDate: new Date('2012-05-12'),
      registeredAddress: 'Level 5, Sky Tower, BKC G-Block, Mumbai 400051',
      gstNumber: '27AAACR1234F1Z5',
      gstVerified: true,
      gstVerifiedAt: new Date('2023-10-12T11:45:00.000Z'),
      jurisdiction: 'Maharashtra – Ward 12A',
      panNumber: 'ABCDE1234F',
      businessType: 'Construction Co.',
    },
  });

  const karanLoyalty = await prisma.loyaltyAccount.upsert({
    where: { customerId: karan.id },
    update: {
      tier: LoyaltyTier.PLATINUM,
      currentPoints: 42000,
      availablePoints: 38500,
      redeemedPoints: 3500,
    },
    create: {
      customerId: karan.id,
      tier: LoyaltyTier.PLATINUM,
      currentPoints: 42000,
      availablePoints: 38500,
      redeemedPoints: 3500,
    },
  });

  const karanMembershipExpiry = new Date();
  karanMembershipExpiry.setFullYear(karanMembershipExpiry.getFullYear() + 1);

  let karanMembership = await prisma.customerMembership.findFirst({
    where: {
      customerId: karan.id,
      planId: enterprisePlan.id,
      status: MembershipStatus.ACTIVE,
    },
  });
  if (!karanMembership) {
    karanMembership = await prisma.customerMembership.create({
      data: {
        customerId: karan.id,
        planId: enterprisePlan.id,
        purchaseDate: new Date(),
        expiryDate: karanMembershipExpiry,
        renewalDate: karanMembershipExpiry,
        status: MembershipStatus.ACTIVE,
        paymentStatus: PaymentStatus.PAID,
      },
    });
  }

  await prisma.customer.update({
    where: { id: karan.id },
    data: {
      loyaltyAccountId: karanLoyalty.id,
      membershipId: karanMembership.id,
      isMember: true,
    },
  });

  const karanSites = [
    {
      label: 'Andheri East Site',
      line1: 'Plot 42, MIDC Industrial Estate, Near Metro Station',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400093',
      isDefault: true,
    },
    {
      label: 'Worli Project',
      line1: 'Senapati Bapat Marg, Opp. Phoenix Mall, Worli',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400018',
      isDefault: false,
    },
  ];

  for (const site of karanSites) {
    const existingSite = await prisma.address.findFirst({
      where: {
        customerId: karan.id,
        label: site.label,
        deletedAt: null,
      },
    });
    if (!existingSite) {
      await prisma.address.create({
        data: {
          customerId: karan.id,
          label: site.label,
          type: 'PROJECT_SITE',
          line1: site.line1,
          city: site.city,
          state: site.state,
          country: 'India',
          pincode: site.pincode,
          isDefault: site.isDefault,
        },
      });
    }
  }

  console.log(`Seeded dev customer Karan Singh (${karanPhone}) with PLATINUM membership.`);

  console.log('Seeded membership plans, loyalty, bulk enquiry, and testimonials.');

  await seedCmsHome(prisma);

  // ── Admin Users (3 RBAC roles) ─────────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash('Admin@1234', 10);
  const adminUsers = [
    { email: 'superadmin@bajriwala.in', fullName: 'Super Admin', role: 'SUPER_ADMIN' as const },
    { email: 'warehouse@bajriwala.in', fullName: 'Warehouse Manager', role: 'WAREHOUSE_MANAGER' as const },
    { email: 'executive@bajriwala.in', fullName: 'Customer Executive', role: 'CUSTOMER_EXECUTIVE' as const },
  ];

  for (const admin of adminUsers) {
    await prisma.adminUser.upsert({
      where: { email: admin.email },
      update: { fullName: admin.fullName, role: admin.role, passwordHash: adminPasswordHash, isActive: true },
      create: {
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
        passwordHash: adminPasswordHash,
        isActive: true,
      },
    });
  }

  console.log('Seeded admin users (superadmin@, warehouse@, executive@bajriwala.in / Admin@1234).');

  // Bust Redis catalog/home caches so APIs do not keep serving pre-seed empties
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IORedis = require('ioredis') as typeof import('ioredis').default;
    const redis = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    const patterns = [
      'categories*',
      'category:*',
      'products*',
      'product:*',
      'home:*',
      'cms:*',
    ];
    let deleted = 0;
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
          deleted += await redis.del(...keys);
        }
      } while (cursor !== '0');
    }
    await redis.quit();
    console.log(`Invalidated ${deleted} Redis catalog/home cache key(s).`);
  } catch (err) {
    console.warn('Redis cache invalidation skipped:', String(err));
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
