import type { ActionKey, ModuleKey, PermissionMap, Role } from "./types";

export const MODULES: { key: ModuleKey; label: string; actions: ActionKey[]; /** Shown under the module name when the generic action labels need translating. */ note?: string }[] = [
  { key: "products", label: "Products", actions: ["view", "create", "edit", "delete", "export", "financial"] },
  { key: "inventory", label: "Inventory / Stock", actions: ["view", "create", "edit", "delete", "approve", "export"] },
  {
    key: "pos",
    label: "POS (Point of Sale)",
    actions: ["view", "create", "edit", "delete", "approve", "export", "financial"],
    note: "Create = sell & run own session · Edit = override limits (discount cap, return window) · Delete = void a sale · Approve = returns & exchanges · Financial = everyone's cash & profit",
  },
  { key: "orders", label: "Orders", actions: ["view", "create", "edit", "delete", "update_status", "export", "financial"] },
  { key: "courier", label: "Courier / Delivery Result", actions: ["view", "create", "edit", "delete", "financial"] },
  { key: "settlement", label: "Settlement", actions: ["view", "create", "edit", "delete", "approve", "export", "financial", "settlement"] },
  { key: "suppliers", label: "Suppliers", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "purchase", label: "Purchase Orders", actions: ["view", "create", "edit", "delete", "approve", "export", "financial"] },
  { key: "returns", label: "Returns", actions: ["view", "create", "edit", "delete", "approve", "export"] },
  { key: "warranty", label: "Warranty & Claims", actions: ["view", "create", "edit", "delete", "approve", "export"] },
  { key: "reports", label: "Reports", actions: ["view", "export", "financial"] },
  {
    key: "accounting",
    label: "Accounting (expenses, income, accounts)",
    actions: ["view", "create", "edit", "delete", "export"],
    note: "View = see expenses, accounts and the profit & loss statement · Create/Edit/Delete = record and change entries · Export = download CSV",
  },
  { key: "settings", label: "Settings", actions: ["view", "edit", "settings"] },
  { key: "audit", label: "Audit Logs", actions: ["view", "export"] },
];

export const ACTION_COLUMNS: { key: ActionKey; label: string; hint: string }[] = [
  { key: "view", label: "View", hint: "See the module's screens and data" },
  { key: "create", label: "Create", hint: "Add new records" },
  { key: "edit", label: "Edit", hint: "Change existing records" },
  { key: "delete", label: "Delete", hint: "Soft-delete records" },
  { key: "approve", label: "Approve", hint: "Approve / confirm (PO approve, receiving, return approve…)" },
  { key: "export", label: "Export", hint: "Download CSV / report exports" },
  { key: "update_status", label: "Update status", hint: "Move orders through their workflow" },
  { key: "financial", label: "Financial", hint: "See cost price, profit / loss and courier cost" },
  { key: "settlement", label: "Settlement", hint: "Add / edit settlement entries" },
  { key: "settings", label: "Settings access", hint: "Critical settings: users, roles, security" },
];

export const ACTION_LABELS = Object.fromEntries(ACTION_COLUMNS.map((a) => [a.key, a.label])) as Record<ActionKey, string>;

export function actionsFor(module: ModuleKey): ActionKey[] {
  return MODULES.find((m) => m.key === module)?.actions ?? [];
}

export function moduleLabel(module: ModuleKey): string {
  return MODULES.find((m) => m.key === module)?.label ?? module;
}

export function fullPermissions(): PermissionMap {
  const map: PermissionMap = {};
  for (const m of MODULES) map[m.key] = [...m.actions];
  return map;
}

export function countPermissions(p: PermissionMap): number {
  return Object.values(p).reduce((n, a) => n + (a?.length ?? 0), 0);
}

export const TOTAL_PERMISSIONS = MODULES.reduce((n, m) => n + m.actions.length, 0);

const NOW = "2026-09-01T00:00:00.000Z";

function managerPermissions(): PermissionMap {
  const p = fullPermissions();
  p.settings = ["view", "edit"];
  p.audit = ["view"];
  return p;
}

export const SUPER_ADMIN_ROLE_ID = "role-super-admin";

export const PRESET_ROLES: Role[] = [
  {
    id: SUPER_ADMIN_ROLE_ID,
    name: "Super Admin",
    description: "Full access to everything, including users, roles, security, audit and settlement override.",
    builtIn: true,
    locked: true,
    permissions: fullPermissions(),
    createdAt: NOW,
  },
  {
    id: "role-manager",
    name: "Manager",
    description: "Everything except critical Security / Users & Roles settings.",
    builtIn: true,
    permissions: managerPermissions(),
    createdAt: NOW,
  },
  {
    id: "role-sales",
    name: "Sales",
    description: "Creates and edits orders and moves their status. No cost, profit or settlement visibility.",
    builtIn: true,
    permissions: {
      products: ["view"],
      inventory: ["view"],
      orders: ["view", "create", "edit", "update_status"],
      courier: ["view"],
      returns: ["view", "create"],
      warranty: ["view", "create"],
    },
    createdAt: NOW,
  },
  {
    id: "role-inventory",
    name: "Inventory Staff",
    description: "Manages products and stock levels.",
    builtIn: true,
    permissions: {
      products: ["view", "create", "edit", "export"],
      inventory: ["view", "create", "edit", "export"],
      orders: ["view"],
      suppliers: ["view"],
      purchase: ["view", "create", "edit"],
      returns: ["view"],
      warranty: ["view"],
    },
    createdAt: NOW,
  },
  {
    id: "role-accounts",
    name: "Accounts",
    description: "Settlement, reports and purchase costs.",
    builtIn: true,
    permissions: {
      products: ["view", "financial"],
      orders: ["view", "export", "financial"],
      courier: ["view", "financial"],
      settlement: ["view", "create", "edit", "approve", "export", "financial", "settlement"],
      suppliers: ["view", "export"],
      purchase: ["view", "export", "financial", "approve"],
      returns: ["view", "export"],
      reports: ["view", "export", "financial"],
      accounting: ["view", "create", "edit", "delete", "export"],
      pos: ["view", "export", "financial"],
      audit: ["view"],
    },
    createdAt: NOW,
  },
  {
    id: "role-cashier",
    name: "Cashier",
    description: "Runs the POS: sells, gives limited discounts and prints receipts. Can't void, approve returns or see cost.",
    builtIn: true,
    permissions: {
      pos: ["view", "create"],
      products: ["view"],
      warranty: ["view"],
    },
    createdAt: NOW,
  },
];

/** Which permission a URL needs. Returns null for pages everyone can open (dashboard). */
export function requiredPermission(pathname: string): { module: ModuleKey; action: ActionKey } | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return null;
  if (p === "/pos") return { module: "pos", action: "create" };
  if (p.startsWith("/pos/returns/new")) return { module: "pos", action: "approve" };
  if (p.startsWith("/pos/")) return { module: "pos", action: "view" };
  if (p.startsWith("/settings")) {
    if (p.startsWith("/settings/users") || p.startsWith("/settings/security")) return { module: "settings", action: "settings" };
    if (p.startsWith("/settings/audit")) return { module: "audit", action: "view" };
    return { module: "settings", action: "view" };
  }
  if (p.startsWith("/notifications")) return { module: "inventory", action: "view" };
  if (p.startsWith("/reports/settlement")) return { module: "settlement", action: "view" };
  if (p.startsWith("/reports")) return { module: "reports", action: "view" };
  if (p.startsWith("/products/bulk-stock-update")) return { module: "inventory", action: "edit" };
  const map: [string, ModuleKey][] = [
    ["/products", "products"],
    ["/orders", "orders"],
    ["/suppliers", "suppliers"],
    ["/purchase-orders", "purchase"],
    ["/returns", "returns"],
    ["/warranty", "warranty"],
    ["/accounting", "accounting"],
  ];
  for (const [prefix, module] of map) {
    if (p === prefix || p.startsWith(`${prefix}/`)) {
      if (p.endsWith("/new") || p.includes("/new-")) return { module, action: "create" };
      if (p.endsWith("/edit")) return { module, action: "edit" };
      return { module, action: "view" };
    }
  }
  return null;
}
