import { getUsermenuService } from "../../services/controls/controls.service.js";

export const getUserMenus = async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    const menutree = await getUsermenuService(userUuid);
    res.status(200).json({ success: true, menus: menutree });
  } catch (error) {
    next(error);
  }
};
