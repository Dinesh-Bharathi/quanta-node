import {
  getUserProfileService,
  updateUserProfileService,
  getTentDetailsService,
} from "./settings.service.js";

export const getUserProfile = async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    const userData = await getUserProfileService(userUuid);

    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error("getUserProfile error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch user profile",
    });
  }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    const updatedData = await updateUserProfileService(userUuid, req.body);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedData,
    });
  } catch (error) {
    console.error("updateUserProfile error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update profile",
    });
  }
};

export const getTentDetails = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;
    const tentData = await getTentDetailsService(tentUuid);

    res.status(200).json({
      success: true,
      data: tentData,
    });
  } catch (error) {
    console.error("getTentDetails error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch tenant details",
    });
  }
};
