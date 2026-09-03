'use strict';

const mongoose = require('mongoose');
const config = require('./index');

mongoose.set('strictQuery', true);

let connectingPromise = null;

const redact = (uri) => uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');

/**
 * Connect once, reuse the promise. Throws with an actionable message so the
 * operator knows exactly which knob to turn.
 */
async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectingPromise) return connectingPromise;

  connectingPromise = mongoose
    .connect(config.mongoUri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
    })
    .then((m) => {
      console.log(`[db] connected to ${redact(config.mongoUri)}`);
      return m.connection;
    })
    .catch((error) => {
      connectingPromise = null;
      const hint = config.mongoUri.includes('127.0.0.1') || config.mongoUri.includes('localhost')
        ? 'Start a local MongoDB (`mongod`) or point MONGO_URI at a MongoDB Atlas cluster.'
        : 'Check the MONGO_URI credentials and that your IP is allow-listed in Atlas > Network Access.';
      error.message = `Could not connect to MongoDB at ${redact(config.mongoUri)}: ${error.message}\n${hint}`;
      throw error;
    });

  return connectingPromise;
}

async function disconnectDatabase() {
  connectingPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[db] disconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('[db] error:', error.message);
});

module.exports = { connectDatabase, disconnectDatabase, mongoose };
