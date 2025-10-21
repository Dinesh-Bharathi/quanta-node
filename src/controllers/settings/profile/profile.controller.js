import {
  getTentDetailsService,
  getUserProfileService,
  updateUserProfileService,
} from "../../../services/settings/profile/profile.service.js";

export const getUserProfile = async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    console.log("userUuid", userUuid);

    const userData = await getUserProfileService(userUuid);

    res.status(200).json({ ...userData });
  } catch (error) {
    next(error);
  }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const { userUuid } = req.params;

    const userData = await updateUserProfileService(userUuid, req.body);

    res.status(200).json({ ...userData });
  } catch (error) {
    next(error);
  }
};

export const getTentDetails = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;

    const tentData = await getTentDetailsService(tentUuid);

    res.status(200).json({ ...tentData });
  } catch (error) {
    next(error);
  }
};
