import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SWAGGER_TAGS } from '../constants/swagger.constants';
import { Public } from '../decorators/public.decorator';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@Public()
@ApiTags(SWAGGER_TAGS.HEALTH)
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Application health check' })
  @ApiResponse({ status: 200, description: 'All services healthy', type: HealthResponseDto })
  @ApiResponse({ status: 503, description: 'One or more services unavailable', type: HealthResponseDto })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponseDto> {
    const health = await this.healthService.check();

    if (!this.healthService.isHealthy(health)) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
