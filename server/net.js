// fetch with retries for flaky networks (a demo shouldn't die on one timeout).
//
// `idempotent: true` retries any network failure and 429/5xx responses. Otherwise only
// failures where the connection never opened are retried, so a request that may have
// started a paid task is never sent twice.
const CONNECT_ERRORS = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH']);

export async function fetchRetry(url, init, { idempotent = false, tries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (idempotent && attempt < tries && (res.status === 429 || res.status >= 500)) throw Object.assign(new Error(`HTTP ${res.status}`), { retryable: true });
      return res;
    } catch (err) {
      const code = err.cause?.code;
      const retryable = err.retryable || (idempotent ? err.name === 'TypeError' : CONNECT_ERRORS.has(code));
      if (!retryable || attempt >= tries) throw err;
      const wait = 1000 * 2 ** (attempt - 1);
      console.warn(`${new URL(url).host}: ${code || err.message}; retry ${attempt}/${tries - 1} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
