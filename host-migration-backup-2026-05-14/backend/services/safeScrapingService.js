import axios from "axios";

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelay(attempt, baseDelayMs) {
  const jitter = Math.floor(Math.random() * baseDelayMs);
  return baseDelayMs * Math.pow(2, attempt) + jitter;
}

export async function requestWithRetry(config, options = {}) {
  const {
    retries = Number(process.env.FMCSA_REQUEST_RETRIES || 3),
    baseDelayMs = Number(process.env.FMCSA_RETRY_DELAY_MS || 1000),
    throttleMs = Number(process.env.FMCSA_REQUEST_DELAY_MS || 500),
    label = config.url || "request"
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (throttleMs > 0) {
      await sleep(throttleMs);
    }

    try {
      return await axios.request(config);
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const shouldRetry = !status || status === 408 || status === 429 || status >= 500;

      if (!shouldRetry || attempt === retries) {
        break;
      }

      const delay = retryDelay(attempt, baseDelayMs);
      console.warn(`[SafeRequest] ${label} failed (${status || err.code || err.message}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  console.error(`[SafeRequest] ${label} failed permanently:`, lastError.response?.status || lastError.message);
  throw lastError;
}
