// Thin client for the YouCam V2 API: upload a file, start a task, poll until done.
// Docs: https://yce.perfectcorp.com/document/index.html

const BASE = 'https://yce-api-01.makeupar.com/s2s';

// Reference-image hairstyle transfer only exists on v2.1; everything else we use is v2.0.
const VERSION = { 'hair-transfer': 'v2.1' };
const version = (feature) => VERSION[feature] ?? 'v2.0';

export class YouCamError extends Error {
  constructor(message, { status, code, feature } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.feature = feature;
  }
}

async function call(method, path, body) {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new YouCamError('YOUCAM_API_KEY is not set');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.status && json.status >= 400)) {
    throw new YouCamError(json.error || `YouCam ${method} ${path} failed (${res.status})`, {
      status: json.status || res.status,
      code: json.error_code,
    });
  }
  return json.data;
}

/** Uploads an image for `feature` and returns its file_id (valid ~24h). */
export async function uploadFile(feature, buffer, contentType = 'image/jpeg') {
  const ext = contentType.split('/')[1] || 'jpg';
  const data = await call('POST', `/${version(feature)}/file/${feature}`, {
    files: [{ content_type: contentType, file_name: `photo.${ext}`, file_size: buffer.length }],
  });
  const file = data.files[0];
  const req = file.requests[0];
  // fetch computes Content-Length itself and rejects a mismatched one, so drop it.
  const { 'Content-Length': _, ...headers } = req.headers || {};
  const put = await fetch(req.url, { method: req.method || 'PUT', headers, body: buffer });
  if (!put.ok) throw new YouCamError(`Upload for ${feature} failed (${put.status})`, { feature });
  return file.file_id;
}

export async function startTask(feature, body) {
  const data = await call('POST', `/${version(feature)}/task/${feature}`, body);
  return data.task_id;
}

/**
 * Polls a task until it succeeds or fails. YouCam invalidates task ids that are not
 * polled for a while (units are still spent), so keep the interval short.
 */
export async function waitTask(feature, taskId, { intervalMs = 2000, timeoutMs = 180_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await call('GET', `/${version(feature)}/task/${feature}/${encodeURIComponent(taskId)}`);
    if (data.task_status === 'success') return data.results;
    if (data.task_status === 'error') {
      throw new YouCamError(data.error_message || data.error || 'Task failed', { code: data.error, feature });
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new YouCamError(`Task ${feature} timed out`, { feature });
}

export async function runTask(feature, body, opts) {
  return waitTask(feature, await startTask(feature, body), opts);
}

/** Lists every template for a template-based feature (hair-style, hair-curl, ...). */
export async function listTemplates(feature) {
  const templates = [];
  let token;
  do {
    const qs = new URLSearchParams({ page_size: '20', ...(token && { starting_token: token }) });
    const data = await call('GET', `/${version(feature)}/task/template/${feature}?${qs}`);
    templates.push(...(data.templates || []));
    token = data.next_token;
  } while (token);
  return templates;
}
