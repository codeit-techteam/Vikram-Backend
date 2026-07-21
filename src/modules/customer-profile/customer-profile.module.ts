import { Module } from '@nestjs/common';
import { OtpModule } from '../../auth/otp/otp.module';
import { CustomerModule } from '../customer/customer.module';
import { CustomerProfileController } from './customer-profile.controller';
import { CustomerProfileService } from './customer-profile.service';

@Module({
  imports: [CustomerModule, OtpModule],
  controllers: [CustomerProfileController],
  providers: [CustomerProfileService],
  exports: [CustomerProfileService],
})
export class CustomerProfileModule {}
