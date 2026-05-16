import mongoose from "mongoose";

let connectionPromise = null;

export function getMongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || "";
}

export async function connectMongo({ required = false } = {}) {
  const uri = getMongoUri();

  if (!uri) {
    const message = "MongoDB URI is missing. Set MONGODB_URI in backend/.env.";
    if (required) throw new Error(message);
    console.warn(message);
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 20),
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
      autoIndex: process.env.NODE_ENV !== "production"
    });
  }

  await connectionPromise;
  console.log("MongoDB connected");
  return mongoose.connection;
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

export async function closeMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    connectionPromise = null;
  }
}
