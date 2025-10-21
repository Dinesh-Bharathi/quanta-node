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

dotenv.config();
const app = express();

// Core Middleware
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(compression());

// Security Middleware
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Rate Limiting
app.use("/api", limiter);

// Routes
app.use("/api", routes);

// Global Error Handler
app.use(errorHandler);

export default app;
