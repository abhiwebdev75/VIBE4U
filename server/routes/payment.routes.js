'use strict';

const express = require('express');

const Booking = require('../models/Booking');
const { ApiError, asyncHandler } = require('../utils/errors');
const { requireFields, str } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const razorpay = require('../services/razorpay');
const pricing = require('../services/pricing');
const bookingService = require('../services/booking');
const { ticketQrDataUrl } = require('../utils/ticket');

const router = express.Router();

const secondsLeft = (date) => (date ? Math.max(0, Math.round((new Date(date).getTime() - Date.now()) / 1000)) : 0);

/** The booking being paid for, verified to belong to the caller. */
const loadPayableBooking = async (req) => {
  const reference = str(req.body.reference);
  if (!reference) throw ApiError.badRequest('Booking reference is required');

  const booking = await Booking.findOne({ reference: reference.toUpperCase() });
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('This booking belongs to another account');
  }
  return booking;
};

/* -------------------------------------------------------------------------- */
/* Public gateway config                                                      */
/* -------------------------------------------------------------------------- */
/** Key id only — the secret never leaves the server. */
router.get('/config', (_req, res) => {
  res.json({
    ...razorpay.publicConfig(),
    sandbox: !razorpay.isLive(),
    checkoutScript: 'https://checkout.razorpay.com/v1/checkout.js',
  });
});
/* -------------------------------------------------------------------------- */
/* Create an order                                                            */
/* -------------------------------------------------------------------------- */
/**
 * A fresh order is minted on every call and the amount is read from the stored
 * booking, so a coupon applied a moment ago can never leave a stale order
 * amount behind. Unpaid orders simply expire at Razorpay.
 */
router.post(
  '/order',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['reference']);
    const booking = await loadPayableBooking(req);

    if (booking.status === 'confirmed') throw ApiError.badRequest('This booking has already been paid');
    if (booking.status !== 'pending') {
      throw ApiError.badRequest(`A ${booking.status} booking cannot be paid for`);
    }
    if (booking.holdExpiresAt && booking.holdExpiresAt.getTime() < Date.now()) {
      await bookingService.releaseBooking(booking, 'expired', {
        failureReason: 'Seat hold expired before payment started',
      });
      throw ApiError.badRequest('Your seat hold expired. Please choose your seats again.');
    }

    const order = await razorpay.createOrder({
      amountInPaise: pricing.toPaise(booking.amount.total),
      receipt: booking.reference,
      notes: {
        reference: booking.reference,
        bookingId: booking._id.toString(),
        userId: booking.user.toString(),
      },
    });

    booking.payment.provider = 'razorpay';
    booking.payment.orderId = order.id;
    booking.payment.mode = order.mode;
    booking.payment.failureReason = null;
    await booking.save();

    res.json({
      order,
      keyId: razorpay.publicConfig().keyId,
      sandbox: !razorpay.isLive(),
      booking: booking.toPublic(),
      holdSeconds: secondsLeft(booking.holdExpiresAt),
      prefill: { name: req.user.name, email: req.user.email, contact: req.user.phone || '' },
    });
  })
);
/* -------------------------------------------------------------------------- */
/* Verify and confirm                                                         */
/* -------------------------------------------------------------------------- */
/**
 * The only place a booking becomes a ticket from the browser's side. Three
 * independent checks must pass: the order id belongs to this booking, the
 * checkout signature matches, and (when live) Razorpay itself agrees the
 * payment is captured for at least the booked amount.
 */
router.post(
  '/verify',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, [
      'reference',
      'razorpay_order_id',
      'razorpay_payment_id',
      'razorpay_signature',
    ]);

    const booking = await loadPayableBooking(req);
    const orderId = str(req.body.razorpay_order_id);
    const paymentId = str(req.body.razorpay_payment_id);
    const signature = str(req.body.razorpay_signature);

    // The webhook may have confirmed this already; say so instead of failing.
    if (booking.status === 'confirmed') {
      res.json({
        booking: booking.toPublic(),
        qr: await ticketQrDataUrl(booking),
        alreadyConfirmed: true,
      });
      return;
    }

    if (!booking.payment.orderId || booking.payment.orderId !== orderId) {
      throw ApiError.badRequest('This payment does not belong to the booking');
    }

    if (!razorpay.verifyCheckoutSignature({ orderId, paymentId, signature })) {
      booking.status = 'failed';
      booking.payment.signatureVerified = false;
      booking.payment.paymentId = paymentId;
      booking.payment.failureReason = 'Checkout signature verification failed';
      await booking.save();
      throw ApiError.badRequest('We could not verify this payment. No seats have been confirmed.');
    }
    let method = null;
    if (razorpay.isLive()) {
      const remote = await razorpay.fetchPayment(paymentId);
      if (!remote) {
        throw new ApiError(502, 'Razorpay did not return this payment. Please contact support before retrying.');
      }
      if (remote.order_id !== orderId) throw ApiError.badRequest('Payment does not match the order');
      if (!['captured', 'authorized'].includes(remote.status)) {
        throw ApiError.badRequest(`Razorpay reports this payment as "${remote.status}"`);
      }
      if (Number(remote.amount) < pricing.toPaise(booking.amount.total)) {
        throw ApiError.badRequest('The amount received is less than the booking total');
      }
      method = remote.method || null;
    }

    await bookingService.confirmBooking(booking, {
      orderId,
      paymentId,
      signatureVerified: true,
      mode: razorpay.mode(),
      method,
      paidAt: new Date(),
    });

    res.json({ booking: booking.toPublic(), qr: await ticketQrDataUrl(booking) });
  })
);

/* -------------------------------------------------------------------------- */
/* Sandbox gateway                                                            */
/* -------------------------------------------------------------------------- */
/**
 * Hands back exactly the three fields Razorpay Checkout would return, so the
 * client posts them to /verify unchanged and the real verification path gets
 * exercised even without a Razorpay account. Refuses to run once live keys are
 * configured.
 */
router.post(
  '/sandbox/pay',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    if (razorpay.isLive()) {
      throw ApiError.forbidden('The sandbox gateway is disabled while live Razorpay keys are configured');
    }
    requireFields(req.body, ['reference']);

    const booking = await loadPayableBooking(req);
    if (!booking.payment.orderId) throw ApiError.badRequest('Create a payment order first');

    const paymentId = razorpay.sandboxPaymentId();
    res.json({
      reference: booking.reference,
      razorpay_order_id: booking.payment.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: razorpay.sandboxSignature({ orderId: booking.payment.orderId, paymentId }),
    });
  })
);
/* -------------------------------------------------------------------------- */
/* Webhook                                                                    */
/* -------------------------------------------------------------------------- */
/**
 * Deliberately unauthenticated in the session sense: Razorpay has no cookie.
 * Authenticity comes from the HMAC over the exact raw body using
 * RAZORPAY_WEBHOOK_SECRET, which is why server.js mounts express.raw() for this
 * path only. Always answers 2xx once the signature checks out, otherwise
 * Razorpay retries a request we have already handled.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.rawBody || '';
    const check = razorpay.verifyWebhookSignature({
      rawBody: raw,
      signature: req.headers['x-razorpay-signature'],
    });

    if (!check.ok) {
      console.warn(`[payments] webhook rejected: ${check.reason}`);
      res.status(400).json({ error: { message: `Webhook rejected: ${check.reason}` } });
      return;
    }

    let event;
    try {
      event = JSON.parse(raw);
    } catch (error) {
      res.status(400).json({ error: { message: 'Webhook body was not valid JSON' } });
      return;
    }

    const entity =
      (event.payload && event.payload.payment && event.payload.payment.entity) ||
      (event.payload && event.payload.order && event.payload.order.entity) ||
      {};
    const orderId = entity.order_id || entity.id || null;
    const reference = (entity.notes && entity.notes.reference) || null;

    const booking = orderId
      ? await Booking.findOne({ 'payment.orderId': orderId })
      : reference
        ? await Booking.findOne({ reference: String(reference).toUpperCase() })
        : null;

    if (!booking) {
      console.warn(`[payments] webhook ${event.event} had no matching booking (order ${orderId})`);
      res.json({ received: true, matched: false });
      return;
    }
    const paid = ['payment.captured', 'payment.authorized', 'order.paid'].includes(event.event);

    if (paid) {
      try {
        await bookingService.confirmBooking(booking, {
          orderId: orderId || booking.payment.orderId,
          paymentId: entity.id || booking.payment.paymentId,
          signatureVerified: true,
          mode: razorpay.mode(),
          method: entity.method || null,
          paidAt: entity.created_at ? new Date(entity.created_at * 1000) : new Date(),
        });
      } catch (error) {
        // A 409 here means the hold lapsed and the seats went to someone else;
        // confirmBooking has already flagged the booking as refund-due.
        console.error(`[payments] webhook could not confirm ${booking.reference}: ${error.message}`);
      }
    } else if (event.event === 'payment.failed') {
      // Keep the seats held for the rest of the window so the user can retry.
      booking.payment.failureReason =
        (entity.error_description || entity.error_reason || 'Payment failed at the gateway').slice(0, 300);
      if (entity.id) booking.payment.paymentId = entity.id;
      await booking.save();
    }

    res.json({ received: true, matched: true, event: event.event });
  })
);

module.exports = router;
