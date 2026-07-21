import { applyDecorators } from '@nestjs/common';
import { ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { AdminRoleValue } from '../constants/admin-rbac.constants';

/**
 * Swagger helper — documents required admin roles on an endpoint.
 * Use alongside @AdminRoles(...) on the same handler.
 */
export function ApiAdminRoles(...roles: AdminRoleValue[]) {
  const roleList = roles.join(', ');
  return applyDecorators(
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' }),
    ApiForbiddenResponse({
      description: `Requires one of: ${roleList}. SUPER_ADMIN always has access.`,
    }),
  );
}
