import { Module } from '@nestjs/common';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { JwtAuthModule } from '../jwt/jwt-auth.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [OtpModule, JwtAuthModule],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService],
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}
