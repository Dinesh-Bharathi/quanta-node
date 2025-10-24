import { getUsermenuService } from "../../services/controls/controls.service.js";

export const getUserMenus = async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    const { mainNavigation, footerNavigation } = await getUsermenuService(
      userUuid
    );

    res.status(200).json({
      success: true,
      mainNavigation,
      footerNavigation,
    });
  } catch (error) {
    next(error);
  }
};
