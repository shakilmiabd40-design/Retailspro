import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ProductsProvider } from "@/lib/products/store";
import { SuppliersProvider } from "@/lib/suppliers/store";
import { WarrantyProvider } from "@/lib/warranty/store";
import { OrdersProvider } from "@/lib/orders/store";
import { PurchaseOrdersProvider } from "@/lib/purchase-orders/store";
import { ReturnsProvider } from "@/lib/returns/store";
import { NotificationsProvider } from "@/lib/notifications/store";
import { SettlementsProvider } from "@/lib/settlements/store";
import { PosProvider } from "@/lib/pos/store";
import { AccountingProvider } from "@/lib/accounting/store";
import { ToastProvider } from "@/components/toast";
import { AuthProvider } from "@/lib/auth/context";
import { AuditProvider } from "@/lib/settings/audit";
import { SettingsProvider } from "@/lib/settings/store";
import { AccessProvider } from "@/lib/settings/access";

/** Everything signed-in users see: session check first, then data providers, then the shell. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuditProvider>
        <SettingsProvider>
          <AccessProvider>
            <ProductsProvider>
              <SuppliersProvider>
                <WarrantyProvider>
                  <OrdersProvider>
                    <PurchaseOrdersProvider>
                      <ReturnsProvider>
                        <NotificationsProvider>
                          <SettlementsProvider>
                            <ToastProvider>
                              <PosProvider>
                                <AccountingProvider>
                                  <AppShell>{children}</AppShell>
                                </AccountingProvider>
                              </PosProvider>
                            </ToastProvider>
                          </SettlementsProvider>
                        </NotificationsProvider>
                      </ReturnsProvider>
                    </PurchaseOrdersProvider>
                  </OrdersProvider>
                </WarrantyProvider>
              </SuppliersProvider>
            </ProductsProvider>
          </AccessProvider>
        </SettingsProvider>
      </AuditProvider>
    </AuthProvider>
  );
}
