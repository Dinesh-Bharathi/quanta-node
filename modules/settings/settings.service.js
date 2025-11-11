import {
  getUserProfileRepo,
  updateUserProfileRepo,
  getTentDetailsRepo,
} from "./settings.repository.js";

export const getUserProfileService = (userUuid) => getUserProfileRepo(userUuid);

export const updateUserProfileService = (userUuid, data) =>
  updateUserProfileRepo(userUuid, data);

export const getTentDetailsService = (tentUuid) => getTentDetailsRepo(tentUuid);
