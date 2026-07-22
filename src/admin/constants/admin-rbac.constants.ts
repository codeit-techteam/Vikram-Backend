/**
 * Admin RBAC — 3 roles only: SUPER_ADMIN, WAREHOUSE_MANAGER, CUSTOMER_EXECUTIVE
 */

export const ADMIN_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  CUSTOMER_EXECUTIVE: 'CUSTOMER_EXECUTIVE',
} as const;

export type AdminRoleValue = (typeof ADMIN_ROLES)[keyof typeof ADMIN_ROLES];

export const ADMIN_PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',
  CMS_VIEW: 'cms:view',
  CMS_MANAGE: 'cms:manage',
  CUSTOMERS_VIEW: 'customers:view',
  CUSTOMERS_MANAGE: 'customers:manage',
  WAREHOUSE_VIEW: 'warehouse:view',
  WAREHOUSE_MANAGE: 'warehouse:manage',
  HUB_VIEW: 'hub:view',
  HUB_MANAGE: 'hub:manage',
  LOGISTICS_VIEW: 'logistics:view',
  LOGISTICS_MANAGE: 'logistics:manage',
  PRODUCTS_VIEW: 'products:view',
  PRODUCTS_MANAGE: 'products:manage',
  CATEGORIES_VIEW: 'categories:view',
  CATEGORIES_MANAGE: 'categories:manage',
  ORDERS_VIEW: 'orders:view',
  ORDERS_MANAGE: 'orders:manage',
  DISPATCH_VIEW: 'dispatch:view',
  DISPATCH_MANAGE: 'dispatch:manage',
  MEMBERSHIP_VIEW: 'membership:view',
  MEMBERSHIP_MANAGE: 'membership:manage',
  LOYALTY_VIEW: 'loyalty:view',
  LOYALTY_MANAGE: 'loyalty:manage',
  BULK_VIEW: 'bulk:view',
  BULK_MANAGE: 'bulk:manage',
  EMERGENCY_VIEW: 'emergency:view',
  EMERGENCY_MANAGE: 'emergency:manage',
  FINANCE_VIEW: 'finance:view',
  FINANCE_MANAGE: 'finance:manage',
  REPORTS_VIEW: 'reports:view',
  AUDIT_VIEW: 'audit:view',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',
  USERS_VIEW: 'users:view',
  USERS_MANAGE: 'users:manage',
  NOTIFICATIONS_VIEW: 'notifications:view',
  NOTIFICATIONS_MANAGE: 'notifications:manage',
  CUSTOMER_EXECUTIVE_VIEW: 'customer_executive:view',
  CUSTOMER_EXECUTIVE_MANAGE: 'customer_executive:manage',
  SUPPORT_VIEW: 'support:view',
  SUPPORT_MANAGE: 'support:manage',
} as const;

export type AdminPermission =
  (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

/** Role → permission matrix */
export const ROLE_PERMISSIONS: Record<AdminRoleValue, AdminPermission[]> = {
  [ADMIN_ROLES.SUPER_ADMIN]: Object.values(ADMIN_PERMISSIONS),

  [ADMIN_ROLES.WAREHOUSE_MANAGER]: [
    ADMIN_PERMISSIONS.WAREHOUSE_VIEW,
    ADMIN_PERMISSIONS.WAREHOUSE_MANAGE,
    ADMIN_PERMISSIONS.HUB_VIEW,
    ADMIN_PERMISSIONS.LOGISTICS_VIEW,
    ADMIN_PERMISSIONS.LOGISTICS_MANAGE,
    ADMIN_PERMISSIONS.PRODUCTS_VIEW,
    ADMIN_PERMISSIONS.ORDERS_VIEW,
    ADMIN_PERMISSIONS.ORDERS_MANAGE,
    ADMIN_PERMISSIONS.DISPATCH_VIEW,
    ADMIN_PERMISSIONS.DISPATCH_MANAGE,
    ADMIN_PERMISSIONS.EMERGENCY_VIEW,
    ADMIN_PERMISSIONS.EMERGENCY_MANAGE,
    ADMIN_PERMISSIONS.BULK_VIEW,
    ADMIN_PERMISSIONS.NOTIFICATIONS_VIEW,
  ],

  [ADMIN_ROLES.CUSTOMER_EXECUTIVE]: [
    ADMIN_PERMISSIONS.CUSTOMERS_VIEW,
    ADMIN_PERMISSIONS.CUSTOMERS_MANAGE,
    ADMIN_PERMISSIONS.ORDERS_VIEW,
    ADMIN_PERMISSIONS.ORDERS_MANAGE,
    ADMIN_PERMISSIONS.MEMBERSHIP_VIEW,
    ADMIN_PERMISSIONS.MEMBERSHIP_MANAGE,
    ADMIN_PERMISSIONS.LOYALTY_VIEW,
    ADMIN_PERMISSIONS.BULK_VIEW,
    ADMIN_PERMISSIONS.BULK_MANAGE,
    ADMIN_PERMISSIONS.EMERGENCY_VIEW,
    ADMIN_PERMISSIONS.EMERGENCY_MANAGE,
    ADMIN_PERMISSIONS.CUSTOMER_EXECUTIVE_VIEW,
    ADMIN_PERMISSIONS.CUSTOMER_EXECUTIVE_MANAGE,
    ADMIN_PERMISSIONS.SUPPORT_VIEW,
    ADMIN_PERMISSIONS.SUPPORT_MANAGE,
    ADMIN_PERMISSIONS.NOTIFICATIONS_VIEW,
  ],
};

/** Convenience role groups for @AdminRoles decorator */
export const ROLE_GROUPS = {
  ALL: [
    ADMIN_ROLES.SUPER_ADMIN,
    ADMIN_ROLES.WAREHOUSE_MANAGER,
    ADMIN_ROLES.CUSTOMER_EXECUTIVE,
  ] as AdminRoleValue[],
  SUPER_ADMIN_ONLY: [ADMIN_ROLES.SUPER_ADMIN] as AdminRoleValue[],
  WAREHOUSE: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.WAREHOUSE_MANAGER] as AdminRoleValue[],
  CUSTOMER_EXECUTIVE: [
    ADMIN_ROLES.SUPER_ADMIN,
    ADMIN_ROLES.CUSTOMER_EXECUTIVE,
  ] as AdminRoleValue[],
  DASHBOARD: [ADMIN_ROLES.SUPER_ADMIN] as AdminRoleValue[],
};

export interface SidebarNavItem {
  label: string;
  href: string;
  icon?: string;
  children?: SidebarNavItem[];
}

/** Sidebar config returned on login — mirrors admin panel IA */
export const ROLE_SIDEBAR_CONFIG: Record<AdminRoleValue, SidebarNavItem[]> = {
  [ADMIN_ROLES.SUPER_ADMIN]: [
    { label: 'Dashboard', href: '/dashboard' },
    {
      label: 'Customer App CMS',
      href: '/customer-app-cms',
      children: [
        { label: 'Banners', href: '/customer-app-cms/banners' },
        { label: 'Offers', href: '/customer-app-cms/offers' },
        { label: 'Videos', href: '/customer-app-cms/videos' },
        { label: 'Testimonials', href: '/customer-app-cms/testimonials' },
        { label: 'Push Notifications', href: '/customer-app-cms/push-notifications' },
      ],
    },
    { label: 'Warehouse', href: '/central-warehouse' },
    { label: 'Hub Network', href: '/sub-hub-network' },
    { label: 'Logistics', href: '/logistics' },
    { label: 'Finance & Payments', href: '/finance-payments' },
    { label: 'User Management', href: '/user-management' },
    { label: 'Customer Executive', href: '/customer-executive' },
    { label: 'Products', href: '/central-warehouse/products' },
    { label: 'Categories', href: '/customer-app-cms/categories' },
    { label: 'Orders', href: '/orders' },
    { label: 'Membership', href: '/user-management/membership-plans' },
    { label: 'Loyalty', href: '/user-management/customer-loyalty' },
    { label: 'Bulk Procurement', href: '/customer-executive/bulk-procurement' },
    { label: 'Emergency Orders', href: '/customer-executive/emergency-orders' },
    { label: 'Reports', href: '/analytics-reports' },
    { label: 'Settings', href: '/system-settings' },
  ],

  [ADMIN_ROLES.WAREHOUSE_MANAGER]: [
    { label: 'Dashboard', href: '/central-warehouse' },
    { label: 'Warehouse', href: '/central-warehouse' },
    { label: 'Hub Network', href: '/sub-hub-network' },
    { label: 'Logistics', href: '/logistics' },
    { label: 'Products', href: '/central-warehouse/products' },
    { label: 'Orders', href: '/orders' },
    { label: 'Dispatch', href: '/logistics/dispatch' },
    { label: 'Drivers', href: '/user-management/drivers' },
    { label: 'Vehicles', href: '/logistics/fleet' },
    { label: 'Inventory', href: '/central-warehouse/inventory' },
  ],

  [ADMIN_ROLES.CUSTOMER_EXECUTIVE]: [
    { label: 'Dashboard', href: '/customer-executive' },
    { label: 'Customers', href: '/customer-executive/customers' },
    { label: 'Create Order', href: '/customer-executive/orders/new' },
    { label: 'Orders', href: '/customer-executive/orders' },
    { label: 'Bulk Procurement', href: '/customer-executive/bulk-procurement' },
    { label: 'Emergency Orders', href: '/customer-executive/emergency-orders' },
    { label: 'Membership', href: '/customer-executive/membership' },
    { label: 'Loyalty', href: '/customer-executive/loyalty' },
    { label: 'Support Tickets', href: '/customer-executive/complaints' },
  ],
};

export function getPermissionsForRole(role: string): AdminPermission[] {
  return ROLE_PERMISSIONS[role as AdminRoleValue] ?? [];
}

export function hasAdminPermission(
  role: string,
  permission: AdminPermission,
): boolean {
  if (role === ADMIN_ROLES.SUPER_ADMIN) return true;
  return getPermissionsForRole(role).includes(permission);
}
