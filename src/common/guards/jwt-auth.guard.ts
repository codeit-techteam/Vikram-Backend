import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ url?: string; path?: string }>();
    const url = request.url ?? request.path ?? '';

    // Hub and admin panels use their own JWT strategies/guards
    if (url.includes('/hub/') || url.includes('/admin/')) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic && !isOptionalAuth) {
      return true;
    }

    if (isOptionalAuth) {
      const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return true;
      }
    }

    return super.canActivate(context);
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isOptionalAuth && (err || !user)) {
      return null as TUser;
    }

    if (err || !user) {
      throw err ?? new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
