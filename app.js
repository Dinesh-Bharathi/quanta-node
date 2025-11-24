import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import { limiter } from "./middlewares/rateLimiter.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import routes from "./routes/index.js";
import dotenv from "dotenv";
import passport from "./config/passport.js";
import morganLogger from "./middlewares/morganLogger.js";
import morgan from "morgan";
import {
  initializeSubscriptionScheduler,
  runManualCheck,
} from "./cronjobs/subscriptionScheduler.js";

dotenv.config();
const app = express();

const allowedOrigins = process.env.CORS_ORIGIN.split(",");

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

// Core Middleware
app.disable("x-powered-by");
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser(process.env.JWT_SECRET));
app.use(compression());

// Security Middleware
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// app.use(morganLogger);
app.use(morgan("combined"));

app.use(passport.initialize());

// Initialize subscription scheduler on server startup
initializeSubscriptionScheduler();

app.get("/api/healthz", (req, res) => {
  res.json({
    success: true,
    message: "API service is running 🚀",
  });
});

// Rate Limiting
app.use("/api", limiter);

app.post("/api/admin/trigger-subscription-check", async (req, res) => {
  try {
    await runManualCheck();
    res.json({
      success: true,
      message: "Subscription check completed successfully",
    });
  } catch (error) {
    console.error("Error in manual subscription check:", error);
    res.status(500).json({
      success: false,
      message: "Error running subscription check",
      error: error.message,
    });
  }
});

// Routes
app.use("/api", routes);

// Global Error Handler
app.use(errorHandler);

export default app;
