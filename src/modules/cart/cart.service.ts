import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, Visibility } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import {
  calculateCartTotals,
  calculateLinePricing,
  decimalToNumber,
  toMoney,
} from '../../common/shopping/pricing.util';
import {
  AddCartItemDto,
  CartItemResponseDto,
  CartResponseDto,
  UpdateCartItemDto,
} from './dto/cart.dto';
import { pickPreferredMediaUrl } from '../../common/utils/media-url';
import { normalizeCatalogUnit } from '../catalog/catalog-display';

type BulkTier = { minQty: number; price: number; label?: string | null };

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getCart(customerId: string): Promise<CartResponseDto> {
    const cacheKey = CACHE_KEYS.CART(customerId);
    const cached = await this.cache.get<CartResponseDto>(cacheKey);
    if (cached) return cached;

    const cart = await this.ensureCart(customerId);
    const data = await this.buildCartResponse(cart.id);
    await this.cache.set(cacheKey, data, CACHE_TTL.CART);
    return data;
  }

  async addItem(
    customerId: string,
    dto: AddCartItemDto,
  ): Promise<CartResponseDto> {
    const quantityToAdd = dto.quantity ?? 1;
    const product = await this.assertProductPurchasable(dto.productId);
    const variant = await this.resolveVariant(
      product.id,
      dto.variantId,
      product.hasVariants,
    );
    const availableStock = await this.getAvailableStock(
      dto.productId,
      dto.variantId,
    );

    const cart = await this.ensureCart(customerId);
    const existing = await this.findCartLine(
      cart.id,
      dto.productId,
      variant?.id ?? null,
    );

    const newQty = (existing?.quantity ?? 0) + quantityToAdd;
    this.assertQuantityAllowed(
      newQty,
      product.minOrder,
      product.maxOrder,
      availableStock,
    );

    const unitRetail = variant
      ? decimalToNumber(variant.price)
      : decimalToNumber(product.retailPrice);
    const { unitPrice, bulkDiscount } = this.resolveUnitPrice(
      product,
      variant,
      newQty,
    );
    const gstPercent = decimalToNumber(product.gst);
    const line = calculateLinePricing({
      unitPrice,
      quantity: newQty,
      gstPercent,
    });
    const lineBulkDiscount = toMoney((unitRetail - unitPrice) * newQty);

    const lineData = {
      quantity: newQty,
      price: line.price,
      gst: line.gst,
      subtotal: line.lineSubtotal,
      variantId: variant?.id ?? null,
      hubId: dto.hubId ?? existing?.hubId ?? null,
      bulkDiscount: bulkDiscount > 0 ? lineBulkDiscount : 0,
      etaMinutes: dto.etaMinutes ?? existing?.etaMinutes ?? null,
    };

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: lineData,
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          ...lineData,
        },
      });
    }

    await this.cache.invalidateCart(customerId);
    return this.getCart(customerId);
  }

  async updateItem(
    customerId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const cart = await this.ensureCart(customerId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: {
        product: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    const product = await this.assertProductPurchasable(item.productId);
    const variant = await this.resolveVariant(
      product.id,
      item.variantId ?? undefined,
      product.hasVariants,
      false,
    );
    const availableStock = await this.getAvailableStock(
      item.productId,
      item.variantId ?? undefined,
    );
    this.assertQuantityAllowed(
      dto.quantity,
      item.product.minOrder,
      item.product.maxOrder,
      availableStock,
    );

    const unitRetail = variant
      ? decimalToNumber(variant.price)
      : decimalToNumber(product.retailPrice);
    const { unitPrice, bulkDiscount } = this.resolveUnitPrice(
      product,
      variant,
      dto.quantity,
    );
    const gstPercent = decimalToNumber(product.gst);
    const line = calculateLinePricing({
      unitPrice,
      quantity: dto.quantity,
      gstPercent,
    });
    const lineBulkDiscount = toMoney((unitRetail - unitPrice) * dto.quantity);

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: {
        quantity: dto.quantity,
        price: line.price,
        gst: line.gst,
        subtotal: line.lineSubtotal,
        bulkDiscount: bulkDiscount > 0 ? lineBulkDiscount : 0,
      },
    });

    await this.cache.invalidateCart(customerId);
    return this.getCart(customerId);
  }

  async removeItem(
    customerId: string,
    itemId: string,
  ): Promise<CartResponseDto> {
    const cart = await this.ensureCart(customerId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({ where: { id: item.id } });
    await this.cache.invalidateCart(customerId);
    return this.getCart(customerId);
  }

  async clearCart(customerId: string): Promise<CartResponseDto> {
    const cart = await this.ensureCart(customerId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.cache.invalidateCart(customerId);
    return this.getCart(customerId);
  }

  /** Used by checkout / order placement — fresh DB read, no cache. */
  async getCartForCheckout(customerId: string): Promise<CartResponseDto> {
    const cart = await this.ensureCart(customerId);
    return this.buildCartResponse(cart.id);
  }

  private async ensureCart(customerId: string) {
    return this.prisma.cart.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
  }

  private async findCartLine(
    cartId: string,
    productId: string,
    variantId: string | null,
  ) {
    return this.prisma.cartItem.findFirst({
      where: {
        cartId,
        productId,
        variantId: variantId ?? null,
      },
    });
  }

  private async assertProductPurchasable(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
        entityStatus: EntityStatus.ACTIVE,
        isVisible: true,
        visibility: { not: Visibility.HIDDEN },
      },
    });

    if (!product) {
      throw new BadRequestException(
        'Cannot add product: product is hidden, inactive, or does not exist',
      );
    }

    return product;
  }

  private async resolveVariant(
    productId: string,
    variantId: string | undefined,
    hasVariants: boolean,
    requireWhenMulti = true,
  ) {
    const variants = await this.prisma.productVariant.findMany({
      where: { productId, deletedAt: null },
      orderBy: { displayOrder: 'asc' },
    });

    if (variants.length === 0) {
      if (variantId) {
        throw new BadRequestException('Product has no variants');
      }
      return null;
    }

    if (variantId) {
      const match = variants.find((v) => v.id === variantId);
      if (!match) {
        throw new BadRequestException('Invalid variant for this product');
      }
      if (!match.inStock) {
        throw new BadRequestException('Selected variant is out of stock');
      }
      return match;
    }

    if (variants.length === 1) {
      return variants[0];
    }

    if (requireWhenMulti && (hasVariants || variants.length > 1)) {
      throw new BadRequestException(
        'Please select a variant before adding this product to cart',
      );
    }

    return variants[0] ?? null;
  }

  private resolveUnitPrice(
    product: {
      retailPrice: unknown;
      bulkPrice: unknown;
      bulkThreshold: number;
      bulkPricing: unknown;
    },
    variant: { price: unknown; bulkPrice: unknown } | null,
    quantity: number,
  ): { unitPrice: number; bulkDiscount: number } {
    const retail = variant
      ? decimalToNumber(variant.price as number)
      : decimalToNumber(product.retailPrice as number);

    const tiers = this.resolveBulkTiers(product, variant);
    let unitPrice = retail;
    for (const tier of tiers) {
      if (quantity >= tier.minQty && tier.price < unitPrice) {
        unitPrice = tier.price;
      }
    }

    return {
      unitPrice,
      bulkDiscount: retail > unitPrice ? toMoney(retail - unitPrice) : 0,
    };
  }

  private resolveBulkTiers(
    product: {
      bulkPrice: unknown;
      bulkThreshold: number;
      bulkPricing: unknown;
    },
    variant: { bulkPrice: unknown } | null,
  ): BulkTier[] {
    if (Array.isArray(product.bulkPricing) && product.bulkPricing.length > 0) {
      return (product.bulkPricing as BulkTier[])
        .filter(
          (t) =>
            t && typeof t.minQty === 'number' && typeof t.price === 'number',
        )
        .map((t) => ({
          minQty: t.minQty,
          price: Number(t.price),
          label: t.label,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }

    const variantBulk =
      variant?.bulkPrice != null ? decimalToNumber(variant.bulkPrice) : null;
    const productBulk =
      product.bulkPrice != null ? decimalToNumber(product.bulkPrice) : null;
    const bulk = variantBulk ?? productBulk;
    if (bulk != null && product.bulkThreshold > 0) {
      return [{ minQty: product.bulkThreshold, price: bulk }];
    }
    return [];
  }

  async getAvailableStock(
    productId: string,
    _variantId?: string,
  ): Promise<number> {
    const aggregates = await this.prisma.hubInventory.aggregate({
      where: {
        productId,
        hub: {
          deletedAt: null,
          isActive: true,
          status: EntityStatus.ACTIVE,
        },
      },
      _sum: { availableQty: true },
    });

    return aggregates._sum.availableQty ?? 0;
  }

  private assertQuantityAllowed(
    quantity: number,
    minOrder: number,
    maxOrder: number | null,
    availableStock: number,
  ): void {
    if (quantity < minOrder) {
      throw new BadRequestException(`Minimum order quantity is ${minOrder}`);
    }
    if (maxOrder !== null && quantity > maxOrder) {
      throw new BadRequestException(`Maximum order quantity is ${maxOrder}`);
    }
    if (availableStock <= 0) {
      throw new BadRequestException('Product is out of stock');
    }
    if (quantity > availableStock) {
      throw new BadRequestException(
        `Quantity exceeds available stock (${availableStock})`,
      );
    }
  }

  private async buildCartResponse(cartId: string): Promise<CartResponseDto> {
    const cart = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              include: {
                category: { select: { name: true } },
                images: {
                  where: { deletedAt: null },
                  orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
                  take: 6,
                },
                variants: {
                  where: { deletedAt: null },
                  orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
                  select: { id: true, label: true, displayUnit: true },
                },
              },
            },
          },
        },
      },
    });

    const items: CartItemResponseDto[] = cart.items.map((item) => {
      const price = decimalToNumber(item.price);
      const gst = decimalToNumber(item.gst);
      const subtotal = decimalToNumber(item.subtotal);
      const gstAmount = Math.round(((subtotal * gst) / 100) * 100) / 100;
      const lineTotal = Math.round((subtotal + gstAmount) * 100) / 100;
      const matchedVariant = item.variantId
        ? item.product.variants.find((v) => v.id === item.variantId)
        : item.product.variants[0];
      const variantLabel =
        matchedVariant?.label ??
        matchedVariant?.displayUnit ??
        item.product.spec ??
        null;
      const mrp =
        item.product.mrp != null
          ? decimalToNumber(item.product.mrp)
          : decimalToNumber(item.product.retailPrice);

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price,
        gst,
        subtotal,
        gstAmount,
        lineTotal,
        bulkDiscount: decimalToNumber(item.bulkDiscount),
        etaMinutes: item.etaMinutes,
        product: {
          id: item.product.id,
          slug: item.product.slug,
          name: item.product.name,
          brand: item.product.brand,
          sku: item.product.sku,
          category: item.product.category?.name ?? null,
          productType: item.product.productType ?? null,
          grade: item.product.grade ?? null,
          variant: variantLabel,
          mrp,
          unit: normalizeCatalogUnit(item.product.unit) || item.product.unit,
          thumbnailUrl: pickPreferredMediaUrl(
            item.product.images.map((img) => img.url),
          ),
          maxOrder: item.product.maxOrder,
          minOrder: item.product.minOrder,
        },
      };
    });

    const totals = calculateCartTotals(
      items.map((i) => ({
        lineSubtotal: i.subtotal,
        lineGstAmount: i.gstAmount,
      })),
    );

    return {
      id: cart.id,
      items,
      itemCount: totals.itemCount,
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      deliveryCharge: totals.deliveryCharge,
      grandTotal: totals.grandTotal,
    };
  }
}
