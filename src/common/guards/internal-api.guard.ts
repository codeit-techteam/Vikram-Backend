import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    const configuredKey =
      this.configService.get<string>('internal.apiKey') ??
      process.env.INTERNAL_API_KEY;

    if (!configuredKey) {
      throw new UnauthorizedException('Internal API key is not configured');
    }

    const providedKey =
      request.headers['x-internal-api-key'] ?? request.headers['x-api-key'];

    if (!providedKey || providedKey !== configuredKey) {
      throw new UnauthorizedException('Invalid internal API key');
    }

    return true;
  }
}
