'use strict';

const QRCode = require('qrcode');

/**
 * The QR encodes a compact JSON payload rather than a URL, so gate staff can
 * validate a ticket from the scanner output alone (reference + ticket code),
 * then confirm against POST /api/manage/bookings/:reference/check-in.
 */
async function ticketQrDataUrl(booking) {
  const payload = JSON.stringify({
    v: 1,
    ref: booking.reference,
    tkt: booking.ticket?.code || null,
    seats: booking.seats.map((seat) => seat.seatId),
    show: new Date(booking.snapshot.startsAt).toISOString(),
    hall: booking.snapshot.hallName,
  });

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#0b0b0f', light: '#ffffff' },
  });
}

module.exports = { ticketQrDataUrl };
