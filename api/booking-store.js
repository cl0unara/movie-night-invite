const { get, put } = require('@vercel/blob');

const STATE_PATH = 'movie-night/shared-state.json';

async function updateState(mutator) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await get(STATE_PATH, { access: 'private' });
    if (!result || result.statusCode !== 200) {
      throw new Error('Shared booking state is unavailable');
    }
    const state = JSON.parse(await new Response(result.stream).text());
    if (!state || !Array.isArray(state.movies)) throw new Error('Shared booking state is invalid');
    if (!Array.isArray(state.bookings)) state.bookings = [];
    const outcome = mutator(state);
    if (outcome && outcome.noWrite) return outcome.value;
    try {
      await put(STATE_PATH, JSON.stringify(state), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: result.blob.etag,
      });
      return outcome && Object.prototype.hasOwnProperty.call(outcome, 'value') ? outcome.value : null;
    } catch (error) {
      if (error && (error.status === 412 || error.name === 'BlobPreconditionFailedError') && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error('Shared booking state changed too often');
}

async function createBooking(booking) {
  return updateState(state => {
    const existing = state.bookings.find(item =>
      item.userId === booking.userId
      && item.movieId === booking.movieId
      && item.date === booking.date
      && item.time === booking.time
      && item.status === 'confirmed'
    );
    if (existing) return { noWrite: true, value: existing };
    state.bookings.push({ ...booking, status: 'confirmed', createdAt: new Date().toISOString(), cancelledAt: null, adminNotifiedAt: null, guestNotifiedAt: null });
    return { value: state.bookings[state.bookings.length - 1] };
  });
}

async function cancelBooking({ userId, movieId, date, time }) {
  return updateState(state => {
    const booking = state.bookings.find(item =>
      item.userId === String(userId)
      && item.movieId === movieId
      && item.date === date
      && item.time === time
    );
    if (!booking) return { noWrite: true, value: { status: 'not_found' } };
    if (booking.status === 'cancelled') return { noWrite: true, value: { status: 'already_cancelled', booking } };
    booking.status = 'cancelled';
    booking.cancelledAt = new Date().toISOString();
    booking.adminNotifiedAt = null;
    booking.guestNotifiedAt = null;
    return { value: { status: 'cancelled', booking } };
  });
}

async function markBookingNotification({ userId, movieId, date, time, field }) {
  if (!['adminNotifiedAt', 'guestNotifiedAt'].includes(field)) throw new Error('Invalid notification field');
  return updateState(state => {
    const booking = state.bookings.find(item =>
      item.userId === String(userId) && item.movieId === movieId && item.date === date && item.time === time
    );
    if (!booking || booking.status !== 'confirmed' && booking.status !== 'cancelled') {
      return { noWrite: true, value: false };
    }
    booking[field] = new Date().toISOString();
    return { value: true };
  });
}

module.exports = { createBooking, cancelBooking, markBookingNotification };
