const ORDER_REPORT_ROUTES = [
  "/reports/settlement",
];

/** Routes whose current UI still requires the complete client order collection. */
export function ordersCollectionActive(pathname: string): boolean {
  return pathname.startsWith("/orders") || pathname.startsWith("/pos") ||
    ORDER_REPORT_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    pathname === "/returns/new-customer" ||
    pathname === "/settings/courier" || pathname === "/settings/data";
}
