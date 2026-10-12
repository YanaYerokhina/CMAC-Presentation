/* JSON API client */
async function request(method, url, body, isForm) {
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status; err.data = data || {};
    if (res.status === 401 && !url.startsWith("/api/auth/")) window.dispatchEvent(new CustomEvent("cm:unauthorized"));
    throw err;
  }
  return data;
}
export const api = {
  get: (u) => request("GET", u),
  post: (u, b) => request("POST", u, b || {}),
  put: (u, b) => request("PUT", u, b || {}),
  patch: (u, b) => request("PATCH", u, b || {}),
  del: (u) => request("DELETE", u),
  upload: (u, form) => request("POST", u, form, true)
};
