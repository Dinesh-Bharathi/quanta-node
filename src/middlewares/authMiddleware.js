import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token missing",
      });
    }

    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        const message =
          err.name === "TokenExpiredError"
            ? "Session expired. Please login again."
            : "Invalid token.";
        return res.status(401).json({ success: false, message });
      }

      // Attach decoded data to request
      req.user = decoded;
      next();
    });
  } catch (error) {
    next(error);
  }
};
