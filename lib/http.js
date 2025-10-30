function sendJson(res, statusOrPayload, maybePayload) {
  let statusCode = 200;
  let payload = statusOrPayload;

  if (maybePayload !== undefined) {
    statusCode = statusOrPayload;
    payload = maybePayload;
  }

  const value = payload ?? null;
  const body =
    value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function requestJson(client, targetUrl, { method = 'GET', body = null, headers = {} } = {}) {
  const url = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  const requestBody =
    body === null || body === undefined
      ? null
      : typeof body === 'string'
      ? body
      : JSON.stringify(body);

  const requestHeaders = {
    Accept: 'application/json',
    ...headers
  };

  if (requestBody) {
    if (!requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json; charset=utf-8';
    }
    if (!requestHeaders['Content-Length']) {
      requestHeaders['Content-Length'] = Buffer.byteLength(requestBody);
    }
  }

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: requestHeaders
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`HTTP ${res.statusCode}`);
            error.response = text;
            reject(error);
            return;
          }
          if (!text) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(new Error('Respuesta JSON inválida'));
          }
        });
      }
    );

    req.on('error', (error) => reject(error));
    if (requestBody) {
      req.write(requestBody);
    }
    req.end();
  });
}

function createJsonRequester(client) {
  return (url, options) => requestJson(client, url, options);
}

module.exports = {
  sendJson,
  requestJson,
  createJsonRequester
};
