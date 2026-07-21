import { SetMetadata } from '@nestjs/common';
import type { AdminRoleValue } from '../constants/admin-rbac.constants';

export const ADMIN_ROLES_KEY = 'admin_roles';

export const AdminRoles = (...roles: AdminRoleValue[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);

/** Alias for @AdminRoles — same decorator, semantic name */
export const Roles = AdminRoles;
