import { loadSecurity, requireAuth, publicUser } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { allowMustReset: true });
  const s = await loadSecurity();
  return json({
    user: publicUser(auth),
    // Shown on the change-password screen so people know the rules before they type.
    policy: { minPasswordLength: s.minPasswordLength, requireUppercase: s.requireUppercase, requireNumber: s.requireNumber, requireSymbol: s.requireSymbol },
  });
});
