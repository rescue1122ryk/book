async function call(action, body, opts) {
  opts = opts || {};
  const payload = Object.assign({ action, token: TOKEN }, body || {});
  let lastErr;
  for (let attempt = 0; attempt < (opts.retries || 2) + 1; attempt++) {
    try {
      const res = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Request failed');
      // Return data if present, otherwise the whole response
      return (json.data !== undefined && json.data !== null) ? json.data : json;
    } catch (e) {
      lastErr = e;
      if (!opts.retrySafe) break;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}
