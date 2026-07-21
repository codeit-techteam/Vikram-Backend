import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CustomerAuthModule } from './customer/customer-auth.module';
import { JwtAuthModule } from './jwt/jwt-auth.module';
import { OtpModule } from './otp/otp.module';

@Module({
  imports: [OtpModule, JwtAuthModule, CustomerAuthModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [CustomerAuthModule, JwtAuthModule, OtpModule],
})
export class AuthModule {}
