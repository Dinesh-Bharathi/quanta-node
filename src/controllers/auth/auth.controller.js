import {
  registerService,
  loginService,
  getSessionService,
} from "../../services/auth/auth.service.js";

export const register = async (req, res, next) => {
  try {
    const { token, tent_uuid, user_uuid } = await registerService(req.body);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.status(201).json({
      success: true,
      message: "Registered successfully",
      tent_uuid,
      user_uuid,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { token, user_uuid, tent_uuid } = await loginService(req.body);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      tent_uuid,
      user_uuid,
    });
  } catch (error) {
    next(error);
  }
};

export const getSession = async (req, res, next) => {
  try {
    const { user_uuid } = req.user;

    console.log("req.user", req.user);

    if (!user_uuid) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Missing user identifier.",
      });
    }

    const sessionData = await getSessionService(user_uuid);

    res.status(200).json({
      success: true,
      message: "Session validated successfully",
      data: sessionData,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    // Clear the JWT cookie
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};
