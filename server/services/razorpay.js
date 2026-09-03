'use strict';

const crypto = require('crypto');
const config = require('../config');
const { ApiError } = require('../utils/errors');

let razorpayClient = null;

if (config.razorpay.live) {
  // Loaded lazily so the server still boots when the SDK is absent.
  try {
    const Razorpay = require('razorpay');
    razorpayClient = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
    console.log('[payments] Razorpay live client ready');
  } catch (error) {
    console.warn(`[payments] razorpay SDK unavailable (${error.message}); falling back to sandbox`);
  }
} else {
  console.warn(
    '[payments] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — using the built-in sandbox gateway. ' +
      'Add real keys to server/.env to take live payments.'
  );
}

const isLive = () => Boolean(razorpayClient);
const mode = () => (isLive() ? 'razorpay' : 'sandbox');

/** Secret used for signature maths: the real key secret, or a derived one in sandbox. */
const signingSecret = () =>
  isLive()
    ? config.razorpay.keySecret
    : crypto.createHash('sha256').update(`sandbox:${config.jwt.secret}`).digest('hex');

const hmac = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

/**
 * Create an order. In sandbox mode we mint an order id with the same shape as
 * Razorpay's so no client code has to branch.
 */
async function createOrder({ amountInPaise, receipt, notes }) {
  if (!Number.isInteger(amountInPaise) || amountInPaise < 100) {
    throw ApiError.badRequest('Order amount must be at least ₹1');
  }

  if (isLive()) {
    try {
      const order = await razorpayClient.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes,
        payment_capture: 1,
      });
      return { id: order.id, amount: order.amount, currency: order.currency, mode: 'razorpay' };
    } catch (error) {
      const detail = error?.error?.description || error.message;
      throw new ApiError(502, `Razorpay rejected the order: ${detail}`);
    }
  }

  const suffix = crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
  return {
    id: `order_SB${suffix}`,
    amount: amountInPaise,
    currency: 'INR',
    mode: 'sandbox',
  };
}

/**
 * Razorpay's checkout signature: HMAC-SHA256 of "<order_id>|<payment_id>" keyed
 * with the API secret. Compared in constant time.
 */
function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = hmac(`${orderId}|${paymentId}`, signingSecret());
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Signature a sandbox "gateway" would have produced — never used when live. */
function sandboxSignature({ orderId, paymentId }) {
  if (isLive()) throw ApiError.forbidden('Sandbox payments are disabled while live keys are configured');
  return hmac(`${orderId}|${paymentId}`, signingSecret());
}

function sandboxPaymentId() {
  const suffix = crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
  return `pay_SB${suffix}`;
}

/** Webhook signature: HMAC-SHA256 over the exact raw body with the webhook secret. */
function verifyWebhookSignature({ rawBody, signature }) {
  if (!config.razorpay.webhookSecret) return { ok: false, reason: 'RAZORPAY_WEBHOOK_SECRET is not configured' };
  if (!rawBody || !signature) return { ok: false, reason: 'Missing raw body or signature header' };

  const expected = hmac(rawBody, config.razorpay.webhookSecret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Signature mismatch' };
  }
  return { ok: true };
}

async function fetchPayment(paymentId) {
  if (!isLive()) return null;
  try {
    return await razorpayClient.payments.fetch(paymentId);
  } catch (error) {
    console.warn(`[payments] could not fetch ${paymentId}: ${error.message}`);
    return null;
  }
}

/** Best-effort refund. Sandbox returns a synthetic id so the flow stays testable. */
async function refund({ paymentId, amountInPaise, notes }) {
  if (!isLive()) {
    return { id: `rfnd_SB${crypto.randomBytes(6).toString('hex')}`, amount: amountInPaise, mode: 'sandbox' };
  }
  try {
    const result = await razorpayClient.payments.refund(paymentId, {
      amount: amountInPaise,
      speed: 'normal',
      notes,
    });
    return { id: result.id, amount: result.amount, mode: 'razorpay' };
  } catch (error) {
    const detail = error?.error?.description || error.message;
    throw new ApiError(502, `Refund failed at Razorpay: ${detail}. No money has moved.`);
  }
}

module.exports = {
  isLive,
  mode,
  publicConfig: () => ({ keyId: config.razorpay.keyId || null, mode: mode(), currency: 'INR' }),
  createOrder,
  verifyCheckoutSignature,
  sandboxSignature,
  sandboxPaymentId,
  verifyWebhookSignature,
  fetchPayment,
  refund,
};
