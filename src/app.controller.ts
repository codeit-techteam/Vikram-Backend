import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { SWAGGER_TAGS } from './common/constants/swagger.constants';
import { Public } from './common/decorators/public.decorator';

@Public()
@ApiTags(SWAGGER_TAGS.ROOT)
@Controller({ path: '', version: VERSION_NEUTRAL })
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'API landing page',
    description:
      'Public root used by DigitalOcean Live App and uptime checks. Does not require auth.',
  })
  @ApiOkResponse({ description: 'API is live' })
  getRoot() {
    return this.appService.getRoot();
  }
}
