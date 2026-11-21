export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_500_000;

async function proxy(request, context) {
  const { path } = await context.params;
  if (path.some((part) => [".", ".."].includes(part) || /[/\\]/.test(part))) {
    return Response.json({ detail: "Invalid API path." }, { status: 400 });
  }
  const headers = new Headers({ Accept: "application/json", Connection: "close" });
  for (const name of ["content-type", "cookie", "x-csrftoken", "x-session-scope", "origin", "referer"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body;
  if (!["GET", "HEAD"].includes(request.method)) {
    const chunks = [];
    let size = 0;
    if (request.body) {
      for await (const chunk of request.body) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) return Response.json({ detail: "Request is too large." }, { status: 413 });
        chunks.push(Buffer.from(chunk));
      }
    }
    body = Buffer.concat(chunks);
  }
  try {
    const backend = (process.env.DJANGO_API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");
    const target = `${backend}/api/${path.map(encodeURIComponent).join("/")}/${new URL(request.url).search}`;
    // Django's development WSGI server can close an idle connection while the
    // built-in rewrite proxy reuses it. A fresh upstream connection avoids that
    // race, including for non-idempotent signup and pledge requests.
    const upstream = await fetch(target, {
      method: request.method, headers, body, cache: "no-store", redirect: "manual",
      signal: AbortSignal.timeout(["item-donations/analyse-photo", "speech/transcribe"].includes(path.join("/")) || (path[0] === "matches" && path[2] === "check-receipt-photo") ? 40000 : 15000),
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "vary", "allow", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("Set-Cookie", cookie);
    // Finish reading inside the try block: a Django reload/disconnect during
    // the body must produce a retryable response, not a broken Next.js stream.
    const payload = [204, 205, 304].includes(upstream.status) ? null : await upstream.arrayBuffer();
    return new Response(payload, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ detail: "We couldn’t connect to the service. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
