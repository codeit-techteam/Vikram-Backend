import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { RoleResponseDto, SelectRoleDto } from './dto/role.dto';
import {
  CreateProfileDto,
  ProfileResponseDto,
  UpsertProfileDto,
} from './dto/profile.dto';
import {
  AddressResponseDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/address.dto';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getRoles(): Promise<RoleResponseDto[]> {
    const roles = await this.prisma.role.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
      },
    });
    return roles;
  }

  async selectRole(
    customerId: string,
    dto: SelectRoleDto,
  ): Promise<ProfileResponseDto> {
    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, isActive: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        roleId: dto.roleId,
        roleSelected: true,
      },
    });

    await this.cache.invalidateProfile(customerId);
    return this.getProfile(customerId);
  }

  async createProfile(
    customerId: string,
    dto: CreateProfileDto,
  ): Promise<ProfileResponseDto> {
    const result = await this.upsertProfileData(customerId, dto, true);
    await this.cache.invalidateProfile(customerId);
    return result;
  }

  async getProfile(customerId: string): Promise<ProfileResponseDto> {
    const cacheKey = CACHE_KEYS.PROFILE(customerId);
    const cached = await this.cache.get<ProfileResponseDto>(cacheKey);
    if (cached) return cached;

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: { profile: true, role: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const profile = this.mapProfile(customer);
    await this.cache.set(cacheKey, profile, CACHE_TTL.PROFILE);
    return profile;
  }

  async updateProfile(
    customerId: string,
    dto: UpsertProfileDto,
  ): Promise<ProfileResponseDto> {
    const result = await this.upsertProfileData(customerId, dto, false);
    await this.cache.invalidateProfile(customerId);
    return result;
  }

  async createAddress(
    customerId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    if (dto.isDefault) {
      await this.clearDefaultAddresses(customerId);
    }

    const isFirst = !(await this.prisma.address.count({
      where: { customerId, deletedAt: null },
    }));

    const address = await this.prisma.address.create({
      data: {
        customerId,
        label: dto.label,
        type: dto.type ?? 'DELIVERY',
        line1: dto.address,
        line2: dto.line2,
        city: dto.city,
        state: dto.state,
        country: dto.country ?? 'India',
        pincode: dto.pincode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isDefault: dto.isDefault ?? isFirst,
      },
    });

    return this.mapAddress(address);
  }

  async getAddresses(customerId: string): Promise<AddressResponseDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: { customerId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map((a) => this.mapAddress(a));
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    await this.ensureAddressOwnership(customerId, addressId);

    if (dto.isDefault) {
      await this.clearDefaultAddresses(customerId);
    }

    const address = await this.prisma.address.update({
      where: { id: addressId },
      data: {
        label: dto.label,
        type: dto.type,
        line1: dto.address,
        line2: dto.line2,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        pincode: dto.pincode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isDefault: dto.isDefault,
      },
    });

    return this.mapAddress(address);
  }

  async deleteAddress(customerId: string, addressId: string): Promise<void> {
    await this.ensureAddressOwnership(customerId, addressId);

    await this.prisma.address.update({
      where: { id: addressId },
      data: { deletedAt: new Date() },
    });
  }

  async setDefaultAddress(
    customerId: string,
    addressId: string,
  ): Promise<AddressResponseDto> {
    await this.ensureAddressOwnership(customerId, addressId);
    await this.clearDefaultAddresses(customerId);

    const address = await this.prisma.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    });

    return this.mapAddress(address);
  }

  private async upsertProfileData(
    customerId: string,
    dto: UpsertProfileDto,
    isCreate: boolean,
  ): Promise<ProfileResponseDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: { profile: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (isCreate && customer.profile) {
      throw new BadRequestException(
        'Profile already exists. Use PATCH /customer/profile to update.',
      );
    }

    const profileCompleted = Boolean(
      (dto.fullName ?? customer.fullName) &&
        (dto.email ?? customer.email),
    );

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        fullName: dto.fullName,
        email: dto.email,
        profileCompleted,
        profile: {
          upsert: {
            create: {
              companyName: dto.companyName,
              gstNumber: dto.gstNumber,
              panNumber: dto.panNumber,
              businessType: dto.businessType,
              profileImage: dto.profileImage,
            },
            update: {
              companyName: dto.companyName,
              gstNumber: dto.gstNumber,
              panNumber: dto.panNumber,
              businessType: dto.businessType,
              profileImage: dto.profileImage,
            },
          },
        },
      },
    });

    return this.getProfile(customerId);
  }

  private async ensureAddressOwnership(
    customerId: string,
    addressId: string,
  ): Promise<void> {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, customerId, deletedAt: null },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }
  }

  private async clearDefaultAddresses(customerId: string): Promise<void> {
    await this.prisma.address.updateMany({
      where: { customerId, deletedAt: null, isDefault: true },
      data: { isDefault: false },
    });
  }

  private mapProfile(customer: {
    id: string;
    phone: string;
    email: string | null;
    fullName: string | null;
    profileCompleted: boolean;
    role: { id: string; name: string; slug: string } | null;
    profile: {
      companyName: string | null;
      gstNumber: string | null;
      panNumber: string | null;
      businessType: string | null;
      profileImage: string | null;
    } | null;
  }): ProfileResponseDto {
    return {
      id: customer.id,
      phone: customer.phone,
      email: customer.email,
      fullName: customer.fullName,
      profileCompleted: customer.profileCompleted,
      companyName: customer.profile?.companyName,
      gstNumber: customer.profile?.gstNumber,
      panNumber: customer.profile?.panNumber,
      businessType: customer.profile?.businessType,
      profileImage: customer.profile?.profileImage,
      role: customer.role
        ? { id: customer.role.id, name: customer.role.name, slug: customer.role.slug }
        : null,
    };
  }

  private mapAddress(address: {
    id: string;
    label: string | null;
    type: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    country: string;
    pincode: string;
    latitude: unknown;
    longitude: unknown;
    isDefault: boolean;
  }): AddressResponseDto {
    return {
      id: address.id,
      label: address.label,
      type: address.type as AddressResponseDto['type'],
      address: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      country: address.country,
      pincode: address.pincode,
      latitude: address.latitude ? Number(address.latitude) : null,
      longitude: address.longitude ? Number(address.longitude) : null,
      isDefault: address.isDefault,
    };
  }
}
