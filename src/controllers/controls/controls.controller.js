import {
  getTenantRolesService,
  getUsermenuService,
} from "../../services/controls/controls.service.js";

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

export const getTenantRoles = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;

    const roles = await getTenantRolesService(tentUuid);

    res.status(200).json({
      success: true,
      data: roles,
    });
  } catch (error) {
    next(error);
  }
};
