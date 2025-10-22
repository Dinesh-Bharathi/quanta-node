import {
  registerService,
  loginService,
  getSessionService,
  changePasswordService,
} from "../../services/auth/auth.service.js";

export const register = async (req, res, next) => {
  try {
    const { token, tent_uuid, user_uuid } = await registerService(req.body);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
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
      sameSite: "None",
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
      sameSite: "None",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, confirmPassword } = req.body;
    const { user_uuid } = req.user;

    await changePasswordService(user_uuid, currentPassword, confirmPassword);

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
