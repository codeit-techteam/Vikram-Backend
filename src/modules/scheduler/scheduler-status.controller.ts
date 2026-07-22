import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { SchedulerStatusService } from './scheduler-status.service';

@ApiTags(SWAGGER_TAGS.SYSTEM)
@Controller({ version: '1', path: 'system/scheduler' })
export class SchedulerStatusController {
  constructor(private readonly statusService: SchedulerStatusService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Internal scheduler / queue health status',
    description:
      'Returns queue depths, last run stats, and next cron fire times. Internal use only.',
  })
  @ApiResponse({ status: 200, description: 'Scheduler status snapshot' })
  async getStatus() {
    return this.statusService.getStatus();
  }
}
