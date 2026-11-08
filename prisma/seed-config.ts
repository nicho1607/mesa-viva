export function seedConfig(env: Record<string, string | undefined> = process.env) {
  const production = env.NODE_ENV === "production";
  const adminPassword = env.SEED_ADMIN_PASSWORD ?? "admin123";
  const waiterPassword = env.SEED_WAITER_PASSWORD ?? "mesero123";
  if (production && (
    adminPassword.length < 12 || waiterPassword.length < 12 ||
    adminPassword === waiterPassword
  )) {
    throw new Error("Configura SEED_ADMIN_PASSWORD y SEED_WAITER_PASSWORD distintos, de al menos 12 caracteres, antes de sembrar producción.");
  }
  return { production, adminPassword, waiterPassword };
}
