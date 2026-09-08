import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { calculateDiscount } from '../../common/shopping/pricing.util';
import {
  isUnitRequiredForAttribute,
  labelFromAttributes,
  normalizeAttributesMap,
  normalizeVariantSku,
  primaryAttributeEntry,
  resolveAttributeName,
  variantCombinationKey,
  type VariantAttributesMap,
} from '../../common/shopping/product-variant.constants';
import type {
  CreateProductVariantDto,
  UpdateProductVariantDto,
} from './dto/admin-product-variants.dto';
import { Prisma } from '../../../generated/prisma/client';

type VariantRow = {
  id: string;
  productId: string;
  attribute: string | null;
  value: string | null;
  attributes?: unknown;
  label: string;
  displayUnit: string | null;
  size: unknown;
  sizeUnit: string | null;
  sku: string | null;
  price: unknown;
  mrp: unknown;
  bulkPrice: unknown;
  stock: number;
  inStock: boolean;
  isActive: boolean;
  imageUrl: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AdminProductVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(productId: string) {
    await this.assertProduct(productId);
    const variants = await this.prisma.productVariant.findMany({
      where: { productId, deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return variants.map((v) => this.mapAdminVariant(v));
  }

  async create(productId: string, dto: CreateProductVariantDto) {
    const product = await this.assertProduct(productId);
    const prepared = this.preparePayload(dto);
    this.assertPricing(prepared.price, prepared.mrp);
    await this.assertUniqueCombination(
      productId,
      prepared.attributes,
      prepared.unit,
    );
    await this.assertUniqueSku(prepared.sku);

    const maxOrder = await this.prisma.productVariant.aggregate({
      where: { productId, deletedAt: null },
      _max: { displayOrder: true },
    });

    const created = await this.prisma.productVariant.create({
      data: {
        productId,
        attribute: prepared.attribute,
        value: prepared.value,
        attributes: prepared.attributes as Prisma.InputJsonValue,
        label: prepared.label,
        displayUnit: prepared.unit,
        size: prepared.size,
        sizeUnit: prepared.unit,
        sku: prepared.sku,
        price: prepared.price,
        mrp: prepared.mrp,
        bulkPrice: prepared.bulkPrice,
        stock: prepared.stock,
        inStock: prepared.inStock,
        isActive: prepared.isActive,
        imageUrl: prepared.imageUrl,
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1,
      },
    });

    await this.syncProductFromVariants(product.id);
    await this.cache.invalidateProducts();
    return this.mapAdminVariant(created);
  }

  async update(
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ) {
    const existing = await this.assertVariant(productId, variantId);
    const existingAttributes = this.readAttributes(existing);
    const merged = {
      attribute: dto.attribute ?? existing.attribute ?? 'Size',
      customAttribute: dto.customAttribute,
      attributes: dto.attributes ?? existingAttributes,
      value: dto.value ?? existing.value ?? existing.label,
      unit:
        dto.unit !== undefined
          ? dto.unit
          : (existing.sizeUnit ?? existing.displayUnit ?? undefined),
      sku: dto.sku !== undefined ? dto.sku : existing.sku,
      price: dto.price ?? Number(existing.price),
      mrp: dto.mrp !== undefined ? dto.mrp : existing.mrp != null ? Number(existing.mrp) : undefined,
      bulkPrice:
        dto.bulkPrice !== undefined
          ? dto.bulkPrice
          : existing.bulkPrice != null
            ? Number(existing.bulkPrice)
            : undefined,
      stock: dto.stock ?? existing.stock,
      isActive: dto.isActive ?? existing.isActive,
      imageUrl:
        dto.imageUrl !== undefined ? dto.imageUrl : existing.imageUrl,
      displayOrder: dto.displayOrder ?? existing.displayOrder,
    };
    const prepared = this.preparePayload(merged);
    this.assertPricing(prepared.price, prepared.mrp);
    await this.assertUniqueCombination(
      productId,
      prepared.attributes,
      prepared.unit,
      variantId,
    );
    await this.assertUniqueSku(prepared.sku, variantId);

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        attribute: prepared.attribute,
        value: prepared.value,
        attributes: prepared.attributes as Prisma.InputJsonValue,
        label: prepared.label,
        displayUnit: prepared.unit,
        size: prepared.size,
        sizeUnit: prepared.unit,
        sku: prepared.sku,
        price: prepared.price,
        mrp: prepared.mrp,
        bulkPrice: prepared.bulkPrice,
        stock: prepared.stock,
        inStock: prepared.inStock,
        isActive: prepared.isActive,
        imageUrl: prepared.imageUrl,
        displayOrder: prepared.displayOrder,
      },
    });

    await this.syncProductFromVariants(productId);
    await this.cache.invalidateProducts();
    return this.mapAdminVariant(updated);
  }

  async remove(productId: string, variantId: string) {
    await this.assertVariant(productId, variantId);
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { deletedAt: new Date(), isActive: false, inStock: false },
    });
    await this.syncProductFromVariants(productId);
    await this.cache.invalidateProducts();
    return { deleted: true };
  }

  async setStatus(productId: string, variantId: string, isActive: boolean) {
    const existing = await this.assertVariant(productId, variantId);
    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        isActive,
        inStock: isActive && existing.stock > 0,
      },
    });
    await this.syncProductFromVariants(productId);
    await this.cache.invalidateProducts();
    return this.mapAdminVariant(updated);
  }

  async duplicate(productId: string, variantId: string) {
    const existing = await this.assertVariant(productId, variantId);
    const attrs = this.readAttributes(existing);
    const primary = primaryAttributeEntry(attrs);
    const copyValue = `${existing.value ?? existing.label} copy`;
    const copiedAttributes = primary
      ? { ...attrs, [primary.name]: copyValue }
      : { Option: copyValue };
    return this.create(productId, {
      attribute: existing.attribute || primary?.name || 'Custom',
      attributes: copiedAttributes,
      value: copyValue,
      unit: existing.sizeUnit ?? existing.displayUnit ?? undefined,
      price: Number(existing.price),
      mrp: existing.mrp != null ? Number(existing.mrp) : undefined,
      bulkPrice: existing.bulkPrice != null ? Number(existing.bulkPrice) : undefined,
      stock: existing.stock,
      isActive: existing.isActive,
      imageUrl: existing.imageUrl ?? undefined,
    });
  }

  async reorder(productId: string, variantIds: string[]) {
    await this.assertProduct(productId);
    const existing = await this.prisma.productVariant.findMany({
      where: { productId, deletedAt: null, id: { in: variantIds } },
      select: { id: true },
    });
    if (existing.length !== variantIds.length) {
      throw new BadRequestException(
        'One or more variants do not belong to this product',
      );
    }

    await this.prisma.$transaction(
      variantIds.map((id, index) =>
        this.prisma.productVariant.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    await this.cache.invalidateProducts();
    return this.list(productId);
  }

  mapAdminVariant(variant: VariantRow) {
    const price = Number(variant.price);
    const mrp = variant.mrp != null ? Number(variant.mrp) : null;
    const { discountAmount, discountPercent } = calculateDiscount(mrp, price);
    const attributes = this.readAttributes(variant);
    const unit = variant.sizeUnit ?? variant.displayUnit;
    return {
      id: variant.id,
      productId: variant.productId,
      attribute: variant.attribute,
      value: variant.value,
      attributes,
      label: variant.label,
      unit,
      displayUnit: variant.displayUnit,
      size: variant.size != null ? Number(variant.size) : null,
      sizeUnit: variant.sizeUnit,
      sku: variant.sku,
      price,
      sellingPrice: price,
      mrp,
      discount: discountAmount,
      discountAmount,
      discountPercent,
      bulkPrice: variant.bulkPrice != null ? Number(variant.bulkPrice) : null,
      stock: variant.stock,
      inStock: variant.inStock,
      isActive: variant.isActive,
      imageUrl: variant.imageUrl,
      displayOrder: variant.displayOrder,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    };
  }

  private preparePayload(dto: {
    attribute: string;
    customAttribute?: string | null;
    attributes?: VariantAttributesMap | null;
    value: string;
    unit?: string | null;
    sku?: string | null;
    price: number;
    mrp?: number | null;
    bulkPrice?: number | null;
    stock?: number;
    isActive?: boolean;
    imageUrl?: string | null;
    displayOrder?: number;
  }) {
    let attributeName: string;
    try {
      attributeName = resolveAttributeName(dto.attribute, dto.customAttribute);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid variant attribute',
      );
    }

    const value = dto.value.trim();
    if (!value) {
      throw new BadRequestException('Variant value is required');
    }

    const unit = dto.unit?.trim() || null;
    if (isUnitRequiredForAttribute(attributeName) && !unit) {
      throw new BadRequestException(`Unit is required for ${attributeName}`);
    }

    const attributes = normalizeAttributesMap(
      dto.attributes,
      attributeName,
      value,
    );
    if (Object.keys(attributes).length === 0) {
      throw new BadRequestException('Variant attributes are required');
    }

    const primary = primaryAttributeEntry(attributes);
    const storedAttribute = primary?.name ?? attributeName;
    const storedValue = attributes[storedAttribute] ?? value;
    const numericValue = Number(storedValue);
    const sku = normalizeVariantSku(dto.sku);
    const stock = Math.max(0, Math.floor(dto.stock ?? 0));
    const isActive = dto.isActive !== false;

    return {
      attribute: storedAttribute,
      value: storedValue,
      attributes,
      unit,
      label: labelFromAttributes(attributes, unit),
      size:
        Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(storedValue)
          ? numericValue
          : null,
      sku,
      price: dto.price,
      mrp: dto.mrp ?? null,
      bulkPrice: dto.bulkPrice ?? null,
      stock,
      isActive,
      inStock: isActive && stock > 0,
      imageUrl: dto.imageUrl?.trim() || null,
      displayOrder: dto.displayOrder,
    };
  }

  private assertPricing(price: number, mrp: number | null) {
    if (!(price > 0)) {
      throw new BadRequestException('Selling price must be greater than 0');
    }
    if (mrp != null && mrp < price) {
      throw new BadRequestException('MRP must be greater than or equal to selling price');
    }
  }

  private readAttributes(variant: VariantRow): VariantAttributesMap {
    const raw = variant.attributes;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return normalizeAttributesMap(
        raw as VariantAttributesMap,
        variant.attribute,
        variant.value ?? variant.label,
      );
    }
    return normalizeAttributesMap(
      undefined,
      variant.attribute,
      variant.value ?? variant.label,
    );
  }

  private async assertUniqueCombination(
    productId: string,
    attributes: VariantAttributesMap,
    unit: string | null,
    excludeId?: string,
  ) {
    const siblings = await this.prisma.productVariant.findMany({
      where: {
        productId,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    const key = variantCombinationKey(attributes, unit);
    const duplicate = siblings.find((row) => {
      const rowAttrs = this.readAttributes(row);
      const rowUnit = row.sizeUnit || row.displayUnit;
      return variantCombinationKey(rowAttrs, rowUnit) === key;
    });
    if (duplicate) {
      throw new BadRequestException(
        `A variant with ${labelFromAttributes(attributes, unit)} already exists for this product`,
      );
    }
  }

  private async assertUniqueSku(sku: string | null, excludeVariantId?: string) {
    if (!sku) return;

    const [productSku, variantSku] = await Promise.all([
      this.prisma.product.findFirst({
        where: { sku, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.productVariant.findFirst({
        where: {
          sku,
          deletedAt: null,
          ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
        },
        select: { id: true },
      }),
    ]);

    if (productSku || variantSku) {
      throw new BadRequestException('SKU already exists');
    }
  }

  private async assertProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async assertVariant(productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  private async syncProductFromVariants(productId: string) {
    const variants = await this.prisma.productVariant.findMany({
      where: { productId, deletedAt: null, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const hasVariants = variants.length > 0;
    const cheapest = [...variants].sort(
      (a, b) => Number(a.price) - Number(b.price),
    )[0];
    const stockLeft = variants.reduce((sum, v) => sum + v.stock, 0);
    const variantUnit = cheapest?.sizeUnit ?? cheapest?.displayUnit ?? null;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        hasVariants,
        defaultVariantId: cheapest?.id ?? null,
        ...(cheapest
          ? {
              retailPrice: cheapest.price,
              ...(cheapest.mrp != null ? { mrp: cheapest.mrp } : {}),
              ...(variantUnit ? { unit: variantUnit } : {}),
              stockLeft,
            }
          : {}),
      },
    });
  }
}
