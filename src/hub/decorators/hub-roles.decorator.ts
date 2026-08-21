import { SetMetadata } from '@nestjs/common';

export const HUB_ROLES_KEY = 'hub_roles';
export const HUB_PERMISSION_KEY = 'hub_permission';

export const HubRoles = (...roles: string[]) =>
  SetMetadata(HUB_ROLES_KEY, roles);
export const HubPermission = (permission: string) =>
  SetMetadata(HUB_PERMISSION_KEY, permission);
