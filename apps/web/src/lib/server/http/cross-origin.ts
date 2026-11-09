// Follows Go's net/http CrossOriginProtection. Browsers report the relation in
// Sec-Fetch-Site; older ones only send Origin, which is compared with the host
// the browser connected to. Requests carrying neither header come from
// non-browser clients, which cannot ride on a user's cookies.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAME_ORIGIN_FETCH_SITES = new Set(["same-origin", "none"]);

function requestHosts(headers: Headers): string[] {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return [headers.get("host"), forwarded].filter(
    (host): host is string => !!host,
  );
}

export function isCrossOriginRequest(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return !SAME_ORIGIN_FETCH_SITES.has(fetchSite);
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  return !requestHosts(request.headers).includes(originHost);
}
