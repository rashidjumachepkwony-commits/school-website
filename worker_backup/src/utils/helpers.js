export function success(data, status = 200) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function error(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function jsonResponse(data, status = 200) {
  return success(data, status);
}

export function extractIntId(id) {
  const num = parseInt(id);
  return isNaN(num) ? null : num;
}

export function parseBody(body) {
  return body;
}
