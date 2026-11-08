import { getRateLimiter } from "@/lib/rate-limit";

// shortcut: límites por proceso; compartir el almacén si se despliega más de un servidor.
export function allowLoginAttempt(email: string): boolean {
  const global = getRateLimiter("login:global", { limit: 100, windowMs: 60_000 });
  const account = getRateLimiter("login:account", { limit: 10, windowMs: 15 * 60_000 });
  return global.hit("all").ok && account.hit(email.trim().toLowerCase()).ok;
}
