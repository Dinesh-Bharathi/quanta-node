import {
  addTenantRoleService,
  createTenantUserService,
  deleteTenantRoleByUuidService,
  deleteTenantUserService,
  getTenantMenuService,
  getTenantRoleByUuidService,
  getTenantRolesService,
  getTenantUsersService,
  getUserByUuidService,
  getUsermenuService,
  updateTenantRoleByUuidService,
  updateTenantUserService,
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

// ✅ GET users + roles
export const getTenantUsers = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;
    if (!tentUuid)
      return res.status(400).json({
        success: false,
        message: "Tent UUID is required.",
      });

    const users = await getTenantUsersService({ tentUuid });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("getTenantUsers error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ✅ PUT update user details & role
export const updateTenantUser = async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    const { user_name, user_email, user_phone, role_uuid } = req.body;

    if (!userUuid)
      return res
        .status(400)
        .json({ success: false, message: "User UUID required" });

    const updated = await updateTenantUserService({
      userUuid,
      user_name,
      user_email,
      user_phone,
      role_uuid,
    });

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("updateTenantUser error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ✅ DELETE user from tenant
export const deleteTenantUser = async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    if (!userUuid)
      return res
        .status(400)
        .json({ success: false, message: "User UUID required" });

    await deleteTenantUserService({ userUuid });

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("deleteTenantUser error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ✅ POST Add user tenant
export const createTenantUser = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;
    const {
      user_name,
      user_email,
      user_country_code,
      user_phone,
      password,
      role_uuid,
      is_owner = 0,
    } = req.body;

    if (!tentUuid || !user_name || !user_email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Tenant UUID, user_name, user_email, and password are required.",
      });
    }

    const newUser = await createTenantUserService({
      tentUuid,
      user_name,
      user_email,
      user_country_code,
      user_phone,
      password,
      role_uuid,
      is_owner,
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: newUser,
    });
  } catch (error) {
    console.error("createTenantUser error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getTenantUsersByUuid = async (req, res) => {
  try {
    const { userUuid } = req.params;

    const userData = await getUserByUuidService(userUuid);

    if (!userData)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });

    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
