import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HUB_PERMISSION_KEY, HUB_ROLES_KEY } from '../decorators/hub-roles.decorator';
import { HUB_ROLE_PERMISSIONS } from '../constants/hub.constants';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';

@Injectable()
export class HubRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(HUB_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      HUB_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<{ user: AuthenticatedHubUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    const rolePermissions = HUB_ROLE_PERMISSIONS[user.role] ?? [];

    if (rolePermissions.includes('*')) {
      return true;
    }

    if (requiredRoles?.length) {
      if (!requiredRoles.includes(user.role)) {
        throw new ForbiddenException(
          `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
        );
      }
      return true;
    }

    if (requiredPermission) {
      const hasPermission = rolePermissions.some(
        (p) => p === requiredPermission || p === `${requiredPermission.split('.')[0]}.*`,
      );
      if (!hasPermission && !rolePermissions.includes(requiredPermission.split('.')[0])) {
        throw new ForbiddenException('Insufficient hub permissions');
      }
    }

    return true;
  }
}
