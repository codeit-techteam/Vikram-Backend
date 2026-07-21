import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { VideoQueryDto } from './dto/video-query.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideoService } from './video.service';

@Public()
@ApiTags(SWAGGER_TAGS.VIDEOS)
@Controller({ version: '1', path: 'videos' })
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get()
  @ApiOperation({
    summary: 'List visible videos',
    description: 'Returns visible CMS videos sorted by displayOrder.',
  })
  @ApiResponse({ status: 200, description: 'Videos fetched successfully' })
  async findAll(
    @Query() query: VideoQueryDto,
  ): Promise<{ success: boolean; message: string; data: VideoResponseDto[] }> {
    const data = await this.videoService.findAll(query.placement);
    return {
      success: true,
      message: 'Videos fetched successfully',
      data,
    };
  }
}
