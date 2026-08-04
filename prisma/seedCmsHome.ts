import {
  BannerPlacement,
  BannerType,
  HomeSectionType,
  PrismaClient,
  RedirectType,
  TestimonialType,
} from '../generated/prisma/client';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80';
const EMERGENCY_IMAGE =
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=80';

/**
 * Seeds Home Screen CMS content migrated from frontend static arrays.
 * Idempotent via upsert on slug / sectionType / customerName.
 */
export async function seedCmsHome(prisma: PrismaClient): Promise<void> {
  // ─── Home sections (layout order) ──────────────────────────────────────────
  const sections: Array<{
    sectionType: HomeSectionType;
    title: string;
    subtitle?: string;
    displayOrder: number;
    apiSource: string;
    layoutType: string;
  }> = [
    {
      sectionType: HomeSectionType.HERO_BANNER,
      title: 'Hero Banner',
      displayOrder: 1,
      apiSource: 'cms.banners',
      layoutType: 'carousel',
    },
    {
      sectionType: HomeSectionType.LOYALTY,
      title: 'Loyalty Progress',
      displayOrder: 2,
      apiSource: 'loyalty',
      layoutType: 'card',
    },
    {
      sectionType: HomeSectionType.MATERIAL_CATEGORIES,
      title: 'Material Categories',
      displayOrder: 3,
      apiSource: 'categories',
      layoutType: 'horizontal',
    },
    {
      sectionType: HomeSectionType.EMERGENCY_DELIVERY,
      title: 'Emergency Delivery',
      displayOrder: 4,
      apiSource: 'cms.promotions',
      layoutType: 'banner',
    },
    {
      sectionType: HomeSectionType.VIDEO_BANNER,
      title: 'Promotional Video',
      displayOrder: 5,
      apiSource: 'cms.banners',
      layoutType: 'video',
    },
    {
      sectionType: HomeSectionType.ADVERTISEMENTS,
      title: 'Brand Advertisements',
      displayOrder: 6,
      apiSource: 'cms.ads',
      layoutType: 'horizontal',
    },
    {
      sectionType: HomeSectionType.TESTIMONIALS,
      title: 'Customer Testimonials',
      subtitle: 'Trusted by Contractors, Builders and Home Owners across India.',
      displayOrder: 7,
      apiSource: 'cms.testimonials',
      layoutType: 'carousel',
    },
    {
      sectionType: HomeSectionType.MEMBERSHIP,
      title: 'Bajriwala Membership',
      displayOrder: 8,
      apiSource: 'cms.promotions',
      layoutType: 'card',
    },
    {
      sectionType: HomeSectionType.BULK_PROCUREMENT,
      title: 'Bulk Procurement',
      displayOrder: 9,
      apiSource: 'cms.promotions',
      layoutType: 'card',
    },
    {
      sectionType: HomeSectionType.RECOMMENDED,
      title: 'Recommended For You',
      subtitle: 'Products based on your browsing and purchases',
      displayOrder: 10,
      apiSource: 'products.recommended',
      layoutType: 'horizontal',
    },
    {
      sectionType: HomeSectionType.PRIORITY_EXPRESS,
      title: 'Priority Express',
      displayOrder: 11,
      apiSource: 'cms.promotions',
      layoutType: 'card',
    },
    {
      sectionType: HomeSectionType.PRODUCT_DISCOVERY,
      title: 'Discover Products',
      displayOrder: 4,
      apiSource: 'products.home',
      layoutType: 'grid',
    },
    {
      sectionType: HomeSectionType.OFFER_FOR_YOU,
      title: 'Offers For You',
      displayOrder: 5,
      apiSource: 'cms.offers',
      layoutType: 'horizontal',
    },
    {
      sectionType: HomeSectionType.QUICK_ACTIONS,
      title: 'Quick Actions',
      displayOrder: 2,
      apiSource: 'cms.quickActions',
      layoutType: 'row',
    },
    {
      sectionType: HomeSectionType.EMERGENCY_BANNER,
      title: 'Emergency Banner',
      displayOrder: 0,
      apiSource: 'cms.emergencyBanner',
      layoutType: 'strip',
    },
    {
      sectionType: HomeSectionType.FEATURED_COLLECTION,
      title: 'Featured Collections',
      displayOrder: 12,
      apiSource: 'cms.promotions',
      layoutType: 'carousel',
    },
  ];

  for (const section of sections) {
    await prisma.homeSection.upsert({
      where: { sectionType: section.sectionType },
      update: {
        title: section.title,
        subtitle: section.subtitle ?? null,
        displayOrder: section.displayOrder,
        apiSource: section.apiSource,
        layoutType: section.layoutType,
        enabled:
          section.sectionType !== HomeSectionType.PRIORITY_EXPRESS &&
          section.sectionType !== HomeSectionType.FEATURED_COLLECTION &&
          section.sectionType !== HomeSectionType.EMERGENCY_BANNER &&
          section.sectionType !== HomeSectionType.RECOMMENDED,
      },
      create: {
        sectionType: section.sectionType,
        title: section.title,
        subtitle: section.subtitle ?? null,
        displayOrder: section.displayOrder,
        apiSource: section.apiSource,
        layoutType: section.layoutType,
        enabled:
          section.sectionType !== HomeSectionType.PRIORITY_EXPRESS &&
          section.sectionType !== HomeSectionType.FEATURED_COLLECTION &&
          section.sectionType !== HomeSectionType.EMERGENCY_BANNER &&
          section.sectionType !== HomeSectionType.RECOMMENDED,
      },
    });
  }

  // ─── Hero banners (from Home carousel) ─────────────────────────────────────
  const heroBanners = [
    {
      slug: 'home-hero-slide-1',
      title: 'Everything Your Site Needs — Delivered Fast',
      subtitle: 'Shop construction materials with 2-hour delivery',
      badge: '2-Hour Delivery',
      displayOrder: 1,
      priority: 10,
    },
    {
      slug: 'home-hero-slide-2',
      title: 'Everything Your Site Needs — Delivered Fast',
      subtitle: 'Shop construction materials with 2-hour delivery',
      badge: '2-Hour Delivery',
      displayOrder: 2,
      priority: 9,
    },
    {
      slug: 'home-hero-slide-3',
      title: 'Everything Your Site Needs — Delivered Fast',
      subtitle: 'Shop construction materials with 2-hour delivery',
      badge: '2-Hour Delivery',
      displayOrder: 3,
      priority: 8,
    },
  ];

  for (const banner of heroBanners) {
    await prisma.banner.upsert({
      where: { slug: banner.slug },
      update: {
        title: banner.title,
        subtitle: banner.subtitle,
        badge: banner.badge,
        bannerType: BannerType.CAROUSEL,
        imageUrl: HERO_IMAGE,
        mobileUrl: HERO_IMAGE,
        ctaLabel: 'Shop Now',
        buttonAction: 'route',
        linkType: 'route',
        linkUrl: '/(tabs)/catalog',
        linkTarget: '/(tabs)/catalog',
        secondaryCtaLabel: 'Bulk Inquiry',
        secondaryLinkType: 'route',
        secondaryLinkUrl: '/bulk-procurement',
        secondaryLinkTarget: '/bulk-procurement',
        placement: BannerPlacement.HOME_HERO,
        displayOrder: banner.displayOrder,
        priority: banner.priority,
        isVisible: true,
      },
      create: {
        slug: banner.slug,
        title: banner.title,
        subtitle: banner.subtitle,
        badge: banner.badge,
        bannerType: BannerType.CAROUSEL,
        imageUrl: HERO_IMAGE,
        mobileUrl: HERO_IMAGE,
        ctaLabel: 'Shop Now',
        buttonAction: 'route',
        linkType: 'route',
        linkUrl: '/(tabs)/catalog',
        linkTarget: '/(tabs)/catalog',
        secondaryCtaLabel: 'Bulk Inquiry',
        secondaryLinkType: 'route',
        secondaryLinkUrl: '/bulk-procurement',
        secondaryLinkTarget: '/bulk-procurement',
        placement: BannerPlacement.HOME_HERO,
        displayOrder: banner.displayOrder,
        priority: banner.priority,
      },
    });
  }

  // ─── Promotional video banner ──────────────────────────────────────────────
  await prisma.banner.upsert({
    where: { slug: 'home-delivery-video-banner' },
    update: {
      title: 'Materials Delivered Right to Your Site',
      subtitle: 'Real-time tracking, verified drivers, zero delays.',
      badge: '2-Hour Delivery',
      bannerType: BannerType.VIDEO,
      imageUrl: HERO_IMAGE,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      thumbnailUrl: HERO_IMAGE,
      ctaLabel: 'Shop Now',
      buttonAction: 'product',
      linkType: 'product',
      linkTarget: 'ultratech-premium-ppc-cement',
      placement: BannerPlacement.HOME_PROMO,
      displayOrder: 1,
      priority: 10,
      isVisible: true,
    },
    create: {
      slug: 'home-delivery-video-banner',
      title: 'Materials Delivered Right to Your Site',
      subtitle: 'Real-time tracking, verified drivers, zero delays.',
      badge: '2-Hour Delivery',
      bannerType: BannerType.VIDEO,
      imageUrl: HERO_IMAGE,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      thumbnailUrl: HERO_IMAGE,
      ctaLabel: 'Shop Now',
      buttonAction: 'product',
      linkType: 'product',
      linkTarget: 'ultratech-premium-ppc-cement',
      placement: BannerPlacement.HOME_PROMO,
      displayOrder: 1,
      priority: 10,
    },
  });

  // Align legacy video seed path with frontend asset
  await prisma.video.updateMany({
    where: { slug: 'home-hero-cement' },
    data: {
      title: 'Materials Delivered Right to Your Site',
      description: 'Real-time tracking, verified drivers, zero delays.',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      thumbnailUrl: HERO_IMAGE,
      linkTarget: 'ultratech-premium-ppc-cement',
    },
  });

  // ─── Brand advertisements ──────────────────────────────────────────────────
  const ads = [
    {
      slug: 'ad-ultratech',
      title: 'UltraTech Cement',
      brandName: 'UltraTech',
      description: 'Premium PPC cement for strong foundations',
      imageUrl: 'assets/product-ultratech.png',
      buttonText: 'Shop Now',
      redirectType: RedirectType.PRODUCT,
      redirectId: 'ultratech-premium-ppc-cement',
      displayOrder: 1,
      priority: 10,
    },
    {
      slug: 'ad-acc',
      title: 'ACC Cement',
      brandName: 'ACC',
      description: 'Trusted cement for every construction site',
      imageUrl: 'assets/product-acc.png',
      buttonText: 'Shop Now',
      redirectType: RedirectType.PRODUCT,
      redirectId: 'acc-cement',
      displayOrder: 2,
      priority: 9,
    },
    {
      slug: 'ad-jk-cement',
      title: 'JK Wall Putty',
      brandName: 'JK Cement',
      description: 'Smooth finish putty for interior walls',
      imageUrl: 'assets/product-jk-wall-putty.png',
      buttonText: 'Shop Now',
      redirectType: RedirectType.PRODUCT,
      redirectId: 'jk-wall-putty',
      displayOrder: 3,
      priority: 8,
    },
    {
      slug: 'ad-dr-fixit',
      title: 'Dr Fixit Waterproofing',
      brandName: 'Dr Fixit',
      description: 'Complete waterproofing solutions',
      imageUrl: 'assets/product-dr-fixit-301.png',
      buttonText: 'Shop Now',
      redirectType: RedirectType.PRODUCT,
      redirectId: 'dr-fixit-301-pidicrete-urp',
      displayOrder: 4,
      priority: 7,
    },
    {
      slug: 'ad-fevicol',
      title: 'Fevicol Marine',
      brandName: 'Fevicol',
      description: 'Industrial-grade adhesives for site work',
      imageUrl: 'assets/product-fevicol-marine.png',
      buttonText: 'Shop Now',
      redirectType: RedirectType.PRODUCT,
      redirectId: 'fevicol-marine',
      displayOrder: 5,
      priority: 6,
    },
  ];

  for (const ad of ads) {
    await prisma.advertisement.upsert({
      where: { slug: ad.slug },
      update: { ...ad, isActive: true },
      create: ad,
    });
  }

  // ─── Promotional cards ─────────────────────────────────────────────────────
  const promotions = [
    {
      slug: 'promo-emergency-delivery',
      title: 'Emergency Delivery',
      subtitle:
        'Site running short? Get essential materials to your site fast — 24/7 logistics.',
      description: 'Emergency site delivery available around the clock.',
      imageUrl: EMERGENCY_IMAGE,
      buttonText: 'Order Now',
      badge: '30–90 Minutes',
      benefits: null,
      redirectType: RedirectType.ROUTE,
      redirectId: '/emergency-order',
      cardType: 'EMERGENCY_DELIVERY',
      priority: 10,
      displayOrder: 1,
    },
    {
      slug: 'promo-bulk-procurement',
      title: 'Bulk Procurement Benefits',
      subtitle: 'Unlock exclusive benefits for large construction orders.',
      description: 'Bulk Procurement',
      imageUrl: null,
      buttonText: 'Unlock Benefits',
      badge: 'Unlock',
      benefits: [
        'Unlock Discount up to 15%',
        'International Trips',
        'Lucky Draw',
        'Loyalty Points',
      ],
      redirectType: RedirectType.ROUTE,
      redirectId: '/bulk-procurement',
      cardType: 'BULK_PROCUREMENT',
      priority: 9,
      displayOrder: 2,
    },
    {
      slug: 'promo-membership',
      title: 'Bajriwala Membership',
      subtitle: 'Unlock premium savings and perks for your sites.',
      description: '₹299/year',
      imageUrl: null,
      buttonText: 'Join Now',
      badge: 'MEMBERSHIP',
      benefits: [
        'Extra Discount',
        'Free Delivery',
        'Bulk Discounts',
        'International Trips',
        'Lucky Draw',
        'Loyalty Points',
      ],
      redirectType: RedirectType.NONE,
      redirectId: null,
      cardType: 'MEMBERSHIP',
      priority: 8,
      displayOrder: 3,
    },
    {
      slug: 'promo-priority-express',
      title: 'Priority Express',
      subtitle:
        'Guaranteed same-day site delivery for all core inventory items.',
      description: null,
      imageUrl: null,
      buttonText: 'Know More',
      badge: null,
      benefits: null,
      redirectType: RedirectType.ROUTE,
      redirectId: '/(tabs)/catalog',
      cardType: 'PRIORITY_EXPRESS',
      priority: 7,
      displayOrder: 4,
    },
  ];

  for (const promo of promotions) {
    await prisma.promotionalCard.upsert({
      where: { slug: promo.slug },
      update: {
        title: promo.title,
        subtitle: promo.subtitle,
        description: promo.description,
        imageUrl: promo.imageUrl,
        buttonText: promo.buttonText,
        badge: promo.badge,
        benefits: promo.benefits ?? undefined,
        redirectType: promo.redirectType,
        redirectId: promo.redirectId,
        cardType: promo.cardType,
        priority: promo.priority,
        displayOrder: promo.displayOrder,
        isActive: true,
      },
      create: {
        slug: promo.slug,
        title: promo.title,
        subtitle: promo.subtitle,
        description: promo.description,
        imageUrl: promo.imageUrl,
        buttonText: promo.buttonText,
        badge: promo.badge,
        benefits: promo.benefits ?? undefined,
        redirectType: promo.redirectType,
        redirectId: promo.redirectId,
        cardType: promo.cardType,
        priority: promo.priority,
        displayOrder: promo.displayOrder,
      },
    });
  }

  // Also keep emergency/bulk as Banner placement for legacy /home consumers
  await prisma.banner.upsert({
    where: { slug: 'emergency-delivery-home' },
    update: {
      title: 'Emergency Delivery',
      subtitle:
        'Site running short? Get essential materials to your site fast — 24/7 logistics.',
      badge: '30–90 Minutes',
      imageUrl: EMERGENCY_IMAGE,
      mobileUrl: EMERGENCY_IMAGE,
      ctaLabel: 'Order Now',
      buttonAction: 'route',
      linkType: 'route',
      linkUrl: '/emergency-order',
      linkTarget: '/emergency-order',
      placement: BannerPlacement.EMERGENCY_DELIVERY,
      bannerType: BannerType.CLICKABLE,
      displayOrder: 1,
      priority: 10,
      isVisible: true,
    },
    create: {
      slug: 'emergency-delivery-home',
      title: 'Emergency Delivery',
      subtitle:
        'Site running short? Get essential materials to your site fast — 24/7 logistics.',
      badge: '30–90 Minutes',
      imageUrl: EMERGENCY_IMAGE,
      mobileUrl: EMERGENCY_IMAGE,
      ctaLabel: 'Order Now',
      buttonAction: 'route',
      linkType: 'route',
      linkUrl: '/emergency-order',
      linkTarget: '/emergency-order',
      placement: BannerPlacement.EMERGENCY_DELIVERY,
      bannerType: BannerType.CLICKABLE,
      displayOrder: 1,
      priority: 10,
    },
  });

  await prisma.banner.upsert({
    where: { slug: 'bulk-procurement-home-card' },
    update: {
      title: 'Bulk Procurement Benefits',
      subtitle: 'Unlock exclusive benefits for large construction orders.',
      badge: 'Unlock',
      imageUrl: HERO_IMAGE,
      ctaLabel: 'Unlock Benefits',
      buttonAction: 'route',
      linkType: 'route',
      linkUrl: '/bulk-procurement',
      linkTarget: '/bulk-procurement',
      placement: BannerPlacement.BULK_PROCUREMENT,
      bannerType: BannerType.CLICKABLE,
      displayOrder: 1,
      priority: 9,
      isVisible: true,
    },
    create: {
      slug: 'bulk-procurement-home-card',
      title: 'Bulk Procurement Benefits',
      subtitle: 'Unlock exclusive benefits for large construction orders.',
      badge: 'Unlock',
      imageUrl: HERO_IMAGE,
      ctaLabel: 'Unlock Benefits',
      buttonAction: 'route',
      linkType: 'route',
      linkUrl: '/bulk-procurement',
      linkTarget: '/bulk-procurement',
      placement: BannerPlacement.BULK_PROCUREMENT,
      bannerType: BannerType.CLICKABLE,
      displayOrder: 1,
      priority: 9,
    },
  });

  // ─── Testimonials (from frontend testimonialData.ts) ───────────────────────
  const videoTestimonials = [
    {
      type: TestimonialType.VIDEO,
      customerName: 'Rajesh Mehta',
      designation: 'Contractor',
      city: 'Mumbai',
      location: 'Mumbai, Maharashtra',
      rating: 5,
      review:
        'Cement delivered to our site within 2 hours. Quality was exactly as promised.',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail: 'assets/category-cement.png',
      sortOrder: 1,
      featured: true,
      isPublished: true,
    },
    {
      type: TestimonialType.VIDEO,
      customerName: 'Suresh Patil',
      designation: 'Builder',
      city: 'Pune',
      location: 'Pune, Maharashtra',
      rating: 5,
      review:
        'Bulk brick order handled professionally. Saved us two days of procurement.',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
      thumbnail: 'assets/category-bricks.png',
      sortOrder: 2,
      featured: true,
      isPublished: true,
    },
    {
      type: TestimonialType.VIDEO,
      customerName: 'Anil Sharma',
      designation: 'Site Engineer',
      city: 'Delhi',
      location: 'Delhi NCR',
      rating: 5,
      review:
        'Reliable partner for every project. Materials always arrive on schedule.',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
      thumbnail: 'assets/category-steel.png',
      sortOrder: 3,
      featured: true,
      isPublished: true,
    },
    {
      type: TestimonialType.VIDEO,
      customerName: 'Arjun Rathore',
      designation: 'Contractor',
      city: 'Jodhpur',
      location: 'Jodhpur, Rajasthan',
      rating: 5,
      review:
        'Premium river sand delivered in bulk — fine grain, zero debris. Our plaster finish turned out flawless.',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail: 'assets/category-sand.png',
      sortOrder: 4,
      featured: false,
      isPublished: true,
    },
    {
      type: TestimonialType.VIDEO,
      customerName: 'Deepak Reddy',
      designation: 'Builder',
      city: 'Hyderabad',
      location: 'Hyderabad, Telangana',
      rating: 5,
      review:
        'Bajriwala has transformed how we manage site logistics. Highly recommended.',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail: 'assets/category-aggregates.png',
      sortOrder: 5,
      featured: false,
      isPublished: true,
    },
  ];

  const textTestimonials = [
    {
      type: TestimonialType.TEXT,
      customerName: 'Arjun Rathore',
      designation: 'Contractor',
      city: 'Jodhpur',
      location: 'Jodhpur, Rajasthan',
      rating: 5,
      review:
        'Ordered 20 tonnes of river sand for a villa project. Clean, well-graded sand delivered within 3 hours — saved us an entire day of sourcing.',
      sortOrder: 10,
      featured: false,
      isPublished: true,
    },
    {
      type: TestimonialType.TEXT,
      customerName: 'Priya Nair',
      designation: 'Home Owner',
      city: 'Kochi',
      location: 'Kochi, Kerala',
      rating: 5,
      review:
        'Smooth ordering experience. The team helped me choose the right cement grade.',
      sortOrder: 11,
      featured: false,
      isPublished: true,
    },
    {
      type: TestimonialType.TEXT,
      customerName: 'Karan Malhotra',
      designation: 'Builder',
      city: 'Chandigarh',
      location: 'Chandigarh',
      rating: 5,
      review:
        'Bulk procurement saved us 12% on our last project. Will order again.',
      sortOrder: 12,
      featured: false,
      isPublished: true,
    },
    {
      type: TestimonialType.TEXT,
      customerName: 'Ravi Kumar',
      designation: 'Contractor',
      city: 'Jaipur',
      location: 'Jaipur, Rajasthan',
      rating: 5,
      review:
        'Emergency delivery at midnight saved our pour. Bajriwala is a lifesaver.',
      sortOrder: 13,
      featured: true,
      isPublished: true,
    },
    {
      type: TestimonialType.TEXT,
      customerName: 'Neha Gupta',
      designation: 'Interior Designer',
      city: 'Delhi',
      location: 'Delhi NCR',
      rating: 5,
      review:
        'Wide product range and transparent pricing. My go-to for all site materials.',
      sortOrder: 14,
      featured: false,
      isPublished: true,
    },
  ];

  for (const item of [...videoTestimonials, ...textTestimonials]) {
    const existing = await prisma.testimonial.findFirst({
      where: {
        customerName: item.customerName,
        type: item.type,
        review: item.review,
      },
    });

    if (existing) {
      await prisma.testimonial.update({
        where: { id: existing.id },
        data: {
          designation: item.designation,
          city: item.city,
          location: item.location,
          rating: item.rating,
          videoUrl: 'videoUrl' in item ? item.videoUrl : existing.videoUrl,
          thumbnail: 'thumbnail' in item ? item.thumbnail : existing.thumbnail,
          sortOrder: item.sortOrder,
          featured: item.featured,
          isPublished: true,
        },
      });
    } else {
      await prisma.testimonial.create({ data: item });
    }
  }

  const quickActions = [
    {
      slug: 'bulk-inquiry',
      label: 'Bulk Inquiry',
      iconKey: 'bulk',
      redirectType: RedirectType.BULK_INQUIRY,
      redirectId: '/bulk-procurement',
      displayOrder: 1,
    },
    {
      slug: 'whatsapp',
      label: 'WhatsApp',
      iconKey: 'whatsapp',
      redirectType: RedirectType.WHATSAPP,
      redirectId: 'https://wa.me/919999999999',
      displayOrder: 2,
    },
    {
      slug: 'call',
      label: 'Call',
      iconKey: 'call',
      redirectType: RedirectType.ROUTE,
      redirectId: 'tel:+919999999999',
      displayOrder: 3,
    },
    {
      slug: 'membership',
      label: 'Membership',
      iconKey: 'membership',
      redirectType: RedirectType.MEMBERSHIP,
      redirectId: '/membership',
      displayOrder: 4,
    },
    {
      slug: 'track-order',
      label: 'Track Order',
      iconKey: 'track',
      redirectType: RedirectType.ROUTE,
      redirectId: '/orders',
      displayOrder: 5,
    },
  ];

  for (const action of quickActions) {
    await prisma.quickAction.upsert({
      where: { slug: action.slug },
      update: {
        label: action.label,
        iconKey: action.iconKey,
        redirectType: action.redirectType,
        redirectId: action.redirectId,
        displayOrder: action.displayOrder,
        isVisible: true,
      },
      create: {
        ...action,
        isVisible: true,
      },
    });
  }

  console.log(
    'Seeded Home Screen CMS (sections, banners, ads, promotions, testimonials, quick actions).',
  );
}
