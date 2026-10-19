"use client";

import { useMemo } from "react";
import { OrdersKpiCard } from "@/components/cards/orders-kpi-card";
import { CustomersCard } from "@/components/cards/customers-card";
import { RevenueCard } from "@/components/cards/revenue-card";
import { TopCategoriesCard } from "@/components/cards/top-categories-card";
import { OrdersChartCard } from "@/components/cards/orders-chart-card";
import { TopDistrictsCard } from "@/components/cards/top-districts-card";
import { ProductSalesTable } from "@/components/cards/product-sales-table";
import { RecentOrdersList } from "@/components/cards/recent-orders-list";
import { buildDashboard } from "@/lib/dashboard";
import { useOrders } from "@/lib/orders/store";
import { useProducts } from "@/lib/products/store";
import { useAccounting } from "@/lib/accounting/store";
import { usePos } from "@/lib/pos/store";
import { useAccess } from "@/lib/settings/access";
import { FinanceKpis } from "@/components/cards/finance-kpis";

export default function DashboardPage() {
  const { orders, hydrated: ordersReady } = useOrders();
  const { products, hydrated: productsReady } = useProducts();
  const { entries } = useAccounting();
  const { invoices } = usePos();
  const { can } = useAccess();
  const data = useMemo(() => buildDashboard(orders, products, new Date(), entries, invoices), [orders, products, entries, invoices]);

  if (!ordersReady || !productsReady) {
    return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <OrdersKpiCard data={data.orders} />
        <CustomersCard data={data.customers} />
        <RevenueCard data={data.revenue} />
        <TopCategoriesCard data={data.topCategories} />
      </div>

      {can("accounting", "view") && <FinanceKpis />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <OrdersChartCard data={data.salesChart} />
        <TopDistrictsCard data={data.topDistricts} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_400px]">
        <ProductSalesTable data={data.products} />
        <RecentOrdersList data={data.recentOrders} />
      </div>
    </>
  );
}
