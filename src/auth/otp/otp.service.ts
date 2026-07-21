import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../../common/database/redis.service';
import { PrismaService } from '../../common/database/prisma.service';
import { normalizePhone } from '../../common/utils/phone.util';
import {
  LOGIN_ATTEMPTS_PREFIX,
  LOGIN_ATTEMPTS_TTL_SECONDS,
  LOGIN_MAX_ATTEMPTS,
  OTP_ATTEMPTS_PREFIX,
  OTP_LENGTH,
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RATE_LIMIT_WINDOW_SECONDS,
  OTP_RATE_PREFIX,
  OTP_REDIS_PREFIX,
  OTP_TTL_SECONDS,
} from './otp.constants';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async sendOtp(mobile: string): Promise<{ expiresIn: number; otp: string }> {
    const phone = normalizePhone(mobile);
    await this.enforceRateLimit(phone);

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const client = this.redisService.getClient();

    await client.setex(`${OTP_REDIS_PREFIX}${phone}`, OTP_TTL_SECONDS, otpHash);
    await client.del(`${OTP_ATTEMPTS_PREFIX}${phone}`);

    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await this.prisma.otpRecord.create({
      data: {
        phone,
        otpHash,
        expiresAt,
        purpose: 'LOGIN',
      },
    });

    if (this.configService.get<string>('app.env') !== 'production') {
      this.logger.debug(`OTP for ${phone}: ${otp}`);
    }

    return { expiresIn: OTP_TTL_SECONDS, otp };
  }

  async verifyOtp(mobile: string, otp: string): Promise<void> {
    const phone = normalizePhone(mobile);
    const client = this.redisService.getClient();
    const attemptsKey = `${OTP_ATTEMPTS_PREFIX}${phone}`;

    const attempts = parseInt((await client.get(attemptsKey)) ?? '0', 10);
    if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      throw new HttpException(
        'Maximum OTP verification attempts exceeded. Please request a new OTP.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const storedHash = await client.get(`${OTP_REDIS_PREFIX}${phone}`);
    if (!storedHash) {
      throw new BadRequestException('OTP expired or not found. Please request a new OTP.');
    }

    const isValid = await bcrypt.compare(otp, storedHash);
    if (!isValid) {
      await client.incr(attemptsKey);
      await client.expire(attemptsKey, OTP_TTL_SECONDS);
      throw new BadRequestException('Invalid OTP. Please try again.');
    }

    await client.del(`${OTP_REDIS_PREFIX}${phone}`);
    await client.del(attemptsKey);

    await this.prisma.otpRecord.updateMany({
      where: {
        phone,
        isUsed: false,
        expiresAt: { gte: new Date() },
      },
      data: { isUsed: true },
    });
  }

  async enforceLoginAttempts(mobile: string): Promise<void> {
    const phone = normalizePhone(mobile);
    const client = this.redisService.getClient();
    const key = `${LOGIN_ATTEMPTS_PREFIX}${phone}`;
    const attempts = parseInt((await client.get(key)) ?? '0', 10);

    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many login attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailedLoginAttempt(mobile: string): Promise<void> {
    const phone = normalizePhone(mobile);
    const client = this.redisService.getClient();
    const key = `${LOGIN_ATTEMPTS_PREFIX}${phone}`;
    const attempts = await client.incr(key);

    if (attempts === 1) {
      await client.expire(key, LOGIN_ATTEMPTS_TTL_SECONDS);
    }
  }

  async clearLoginAttempts(mobile: string): Promise<void> {
    const phone = normalizePhone(mobile);
    await this.redisService.getClient().del(`${LOGIN_ATTEMPTS_PREFIX}${phone}`);
  }

  private async enforceRateLimit(phone: string): Promise<void> {
    const client = this.redisService.getClient();
    const key = `${OTP_RATE_PREFIX}${phone}`;
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, OTP_RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > OTP_MAX_SENDS_PER_WINDOW) {
      throw new HttpException(
        'Too many OTP requests. Please wait before requesting again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private generateOtp(): string {
    const isDev = this.configService.get<string>('app.env') !== 'production';
    if (isDev) {
      return this.configService.get<string>('otp.devBypassCode') ?? '123456';
    }

    return Array.from({ length: OTP_LENGTH }, () =>
      Math.floor(Math.random() * 10).toString(),
    ).join('');
  }
}
