import morgan from "morgan";
import logger from "../utils/logger.js";

// Define Morgan format for console
const stream = {
  write: (message) => logger.http(message.trim()), // Send morgan logs to winston
};

// Skip logging during testing or specific env
const skip = () => {
  const env = process.env.NODE_ENV || "development";
  return env === "test";
};

// Define format based on environment
const morganFormat =
  process.env.NODE_ENV === "production"
    ? ":method :url :status :res[content-length] - :response-time ms"
    : "dev";

const morganLogger = morgan(morganFormat, { stream, skip });

export default morganLogger;
