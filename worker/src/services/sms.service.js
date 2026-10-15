/**
 * SMS notification service for the Computer Studies Holiday Tuition system.
 *
 * Uses Africa's Talking SMS gateway (the dominant Kenyan provider).
 * Credentials are read from Worker secrets — never exposed to the browser.
 *
 * Required Worker secrets:
 *   AT_SMS_API_KEY   – Africa's Talking API key
 *   AT_SMS_USERNAME  – Africa's Talking username (or 'sandbox' for dev)
 *   AT_SMS_FROM      – alphanumeric sender ID (e.g. "ChangaraStarAcademy")
 *
 * Optional:
 *   AT_SMS_SHORTCODE – shortcode for delivery receipts
 *
 * Provider pricing (as of 2026): KSh 1.50–2.00 per SMS in Kenya.
 * Sandbox: free, but limited to pre-approved test numbers only.
 */

const AT_BASE_URL = 'https://api.africastalking.com/version1/messaging';

export async function sendSms(env, opts) {
  const apiKey = env.AT_SMS_API_KEY;
  const username = env.AT_SMS_USERNAME;
  const from = env.AT_SMS_FROM || 'ChangaraStarAcademy';

  if (!apiKey || !username) {
    throw new Error('SMS is not configured: AT_SMS_API_KEY and AT_SMS_USERNAME must be set as Worker secrets.');
  }

  const { phoneNumber, message, registrationId, messageType } = opts;
  if (!phoneNumber || !message) {
    throw new Error('phoneNumber and message are required');
  }

  const params = new URLSearchParams({
    username,
    to: phoneNumber,
    message,
    from
  });

  const res = await fetch(AT_BASE_URL, {
    method: 'POST',
    headers: {
      'apikey': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: params.toString()
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  const status = res.ok ? 'sent' : 'failed';
  const log = {
    _id: undefined,
    registration_id: registrationId || null,
    phone_number: phoneNumber,
    message,
    message_type: messageType || 'manual',
    status,
    request_id: data.SMSMessageData ? data.SMSMessageData.messages : null,
    error: res.ok ? null : (data.SMSMessageData?.error || text.slice(0, 200)),
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Log the SMS status. The caller is responsible for passing `db` if they
  // want this persisted; otherwise we just return the result.
  return {
    success: res.ok,
    status,
    providerResponse: data,
    error: res.ok ? null : (data.SMSMessageData?.error || text.slice(0, 200))
  };
}

/**
 * Persist an SMS log entry into computer_tuition_sms_logs.
 * Must be called from a route handler that has a db connection.
 */
export async function logSms(db, logEntry) {
  const row = {
    registration_id: logEntry.registration_id || null,
    phone_number: logEntry.phone_number,
    message: logEntry.message,
    message_type: logEntry.message_type || 'manual',
    status: logEntry.status,
    provider_response: logEntry.providerResponse ? JSON.stringify(logEntry.providerResponse) : null,
    error: logEntry.error || null,
    sent_at: logEntry.sent_at || new Date().toISOString(),
    delivered_at: logEntry.delivered_at || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await db.collection('computer_tuition_sms_logs').insertOne(row);
  return { ...row };
}
