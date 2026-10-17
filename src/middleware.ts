import { defineMiddleware } from "astro:middleware";

/** Every response from this concept app is kept out of search engines and gets basic hardening headers. */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const res = await next();
  const headers: Record<string, string> = {
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    // The manage page's URL is a private link: never send it to other sites in the Referer header.
    // ("same-origin" rather than "no-referrer", because no-referrer makes browsers send `Origin: null`
    // on the page's own form posts, which the CSRF check rightly refuses.)
    "Referrer-Policy": ctx.url.pathname.includes("/manage/") ? "same-origin" : "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  try {
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  } catch {
    const copy = new Response(res.body, res);
    for (const [k, v] of Object.entries(headers)) copy.headers.set(k, v);
    return copy;
  }
});
