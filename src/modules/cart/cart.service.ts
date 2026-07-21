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
} from '../../common/shopping/pricing.util';
import {
  AddCartItemDto,
  CartItemResponseDto,
  CartResponseDto,
  UpdateCartItemDto,
} from './dto/cart.dto';

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
    const availableStock = await this.getAvailableStock(dto.productId);

    const cart = await this.ensureCart(customerId);
    const existing = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: { cartId: cart.id, productId: dto.productId },
      },
    });

    const newQty = (existing?.quantity ?? 0) + quantityToAdd;
    this.assertQuantityAllowed(newQty, product.minOrder, product.maxOrder, availableStock);

    const unitPrice = decimalToNumber(product.retailPrice);
    const gstPercent = decimalToNumber(product.gst);
    const line = calculateLinePricing({
      unitPrice,
      quantity: newQty,
      gstPercent,
    });

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: newQty,
          price: line.price,
          gst: line.gst,
          subtotal: line.lineSubtotal,
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: newQty,
          price: line.price,
          gst: line.gst,
          subtotal: line.lineSubtotal,
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
      include: { product: true },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.assertProductPurchasable(item.productId);
    const availableStock = await this.getAvailableStock(item.productId);
    this.assertQuantityAllowed(
      dto.quantity,
      item.product.minOrder,
      item.product.maxOrder,
      availableStock,
    );

    const unitPrice = decimalToNumber(item.product.retailPrice);
    const gstPercent = decimalToNumber(item.product.gst);
    const line = calculateLinePricing({
      unitPrice,
      quantity: dto.quantity,
      gstPercent,
    });

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: {
        quantity: dto.quantity,
        price: line.price,
        gst: line.gst,
        subtotal: line.lineSubtotal,
      },
    });

    await this.cache.invalidateCart(customerId);
    return this.getCart(customerId);
  }

  async removeItem(customerId: string, itemId: string): Promise<CartResponseDto> {
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

  /** Aggregate available stock across all active hubs. */
  async getAvailableStock(productId: string): Promise<number> {
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
                images: {
                  where: { deletedAt: null },
                  orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
                  take: 1,
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

      return {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        price,
        gst,
        subtotal,
        gstAmount,
        lineTotal,
        product: {
          id: item.product.id,
          slug: item.product.slug,
          name: item.product.name,
          brand: item.product.brand,
          unit: item.product.unit,
          thumbnailUrl: item.product.images[0]?.url ?? null,
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
