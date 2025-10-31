import {
  addTenantRoleService,
  deleteTenantRoleByUuidService,
  getTenantMenuService,
  getTenantRoleByUuidService,
  getTenantRolesService,
  getUsermenuService,
  updateTenantRoleByUuidService,
} from "../../services/controls/controls.service.js";

export const getTenantMenus = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;

    const { mainNavigation, footerNavigation } = await getTenantMenuService(
      tentUuid
    );

    res.status(200).json({
      success: true,
      data: {
        mainNavigation,
        footerNavigation,
      },
    });
  } catch (error) {
    next(error);
  }
};

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

export const addTenantRole = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;
    const { roleName, description, permissions } = req.body;

    if (!roleName || !tentUuid)
      return res.status(400).json({
        success: false,
        message: "Role name and tenant UUID are required.",
      });

    const role = await addTenantRoleService({
      tentUuid,
      roleName,
      description,
      permissions,
    });

    res.status(201).json({
      success: true,
      message: "Role created successfully.",
      data: role,
    });
  } catch (error) {
    next(error);
  }
};

export const getTenantRoleByUuid = async (req, res, next) => {
  try {
    const { roleUuid } = req.params;

    const roleData = await getTenantRoleByUuidService(roleUuid);

    if (!roleData)
      return res
        .status(404)
        .json({ success: false, message: "Role not found." });

    res.status(200).json({
      success: true,
      data: roleData,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTenantRoleByUuid = async (req, res, next) => {
  try {
    const { roleUuid } = req.params;
    const { roleName, description, permissions } = req.body;

    console.log("first", req.body);

    if (!roleUuid)
      return res.status(400).json({
        success: false,
        message: "Role UUID is required.",
      });

    if (!roleName)
      return res.status(400).json({
        success: false,
        message: "Role name is required.",
      });

    const updatedRole = await updateTenantRoleByUuidService({
      roleUuid,
      roleName,
      description,
      permissions,
    });

    res.status(200).json({
      success: true,
      message: "Role updated successfully.",
      data: updatedRole,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRoleByUuid = async (req, res, next) => {
  try {
    const { roleUuid } = req.params;

    if (!roleUuid)
      return res.status(400).json({
        success: false,
        message: "Role UUID is required.",
      });

    const deleteRow = await deleteTenantRoleByUuidService({ roleUuid });

    res.status(200).json({
      success: true,
      message: "Role deleted successfully.",
      data: deleteRow,
      // data: updatedRole,
    });
  } catch (error) {
    next(error);
  }
};
