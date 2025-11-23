import { errorResponse } from "../../utils/response.js";
import {
  addTenantRoleService,
  assignUserToBranchService,
  createTenantUserService,
  deleteTenantRoleService,
  deleteTenantUserService,
  getTenantMenuService,
  getTenantRoleByUuidService,
  getTenantRolesService,
  getTenantUsersService,
  getUserByUuidService,
  getUsermenuService,
  updateTenantRoleService,
  updateTenantUserService,
} from "./controls.service.js";

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
    const { userUuid, branchUuid } = req.params;

    // Validation
    if (!userUuid || !branchUuid) {
      return res.status(400).json({
        success: false,
        message: "User UUID and Branch UUID are required",
      });
    }

    const menus = await getUsermenuService(userUuid, branchUuid);

    return res.status(200).json({
      success: true,
      data: menus,
    });
  } catch (error) {
    console.error("❌ Get user menus error:", error);
    next(error);
  }
};

export const getTenantRoles = async (req, res) => {
  try {
    const { tentUuid } = req.params;

    const roles = await getTenantRolesService({
      tentUuid,
    });

    res.status(200).json({ success: true, data: roles });
  } catch (error) {
    console.error("getTenantRoles error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const addTenantRole = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;
    const { roleName, description, permissions } = req.body;

    if (!tentUuid || !roleName) {
      return errorResponse(res, "Tenant UUID and role name are required", 400);
    }

    if (!permissions || Object.keys(permissions).length === 0) {
      return errorResponse(
        res,
        "At least one permission must be assigned",
        400
      );
    }

    const role = await addTenantRoleService({
      tentUuid,
      roleName,
      description,
      permissions,
      createdBy: req.user?.userId || null,
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

    if (!roleUuid) {
      return errorResponse(res, "Role UUID is required", 400);
    }

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

export const updateTenantRole = async (req, res, next) => {
  try {
    const { roleUuid } = req.params;
    const { tentUuid, roleName, description, permissions } = req.body;

    // Validation
    if (!roleUuid || !tentUuid) {
      return errorResponse(res, "Role UUID and Tenant UUID are required", 400);
    }

    const updated = await updateTenantRoleService({
      roleUuid,
      tentUuid,
      roleName,
      description,
      permissions,
      updatedBy: req.user?.userId || null,
    });

    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("updateTenantRole error:", error);
    next(error);
  }
};

export const deleteTenantRole = async (req, res, next) => {
  try {
    const { tentUuid, roleUuid } = req.params;

    if (!roleUuid || !tentUuid) {
      return errorResponse(res, "Role UUID and Tenant UUID are required", 400);
    }

    await deleteTenantRoleService({ roleUuid, tentUuid });

    res.status(200).json({
      success: true,
      message: "Role deleted successfully",
    });
  } catch (err) {
    console.error("deleteTenantRole error:", err);
    next(err);
  }
};

// ✅ GET users + roles
export const getTenantUsers = async (req, res) => {
  try {
    const { tentUuid } = req.params;
    const { all = false, branchUuid } = req.query;

    if (!tentUuid) {
      return res.status(400).json({
        success: false,
        message: "Tent UUID is required.",
      });
    }

    const users = await getTenantUsersService({
      tentUuid,
      all: all === "true",
      branchUuid: branchUuid ?? null,
    });

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

    if (!userUuid)
      return res
        .status(400)
        .json({ success: false, message: "User UUID required" });

    const updated = await updateTenantUserService({
      userUuid,
      ...req.body,
    });

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("updateTenantUser error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
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
    const { user_name, user_email, password } = req.body;

    if (!tentUuid || !user_name || !user_email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Tenant UUID, user_name, user_email, and password are required.",
      });
    }

    const newUser = await createTenantUserService({
      tentUuid,
      ...req.body,
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: newUser,
    });
  } catch (error) {
    console.error("createTenantUser error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
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

export const assignUserToBranch = async (req, res, next) => {
  try {
    const { userUuid, branchUuid } = req.body;
    if (!userUuid || !branchUuid)
      return res.status(400).json({
        success: false,
        message: "userUuid and branchUuid are required",
      });

    const out = await assignUserToBranchService({ userUuid, branchUuid });
    res
      .status(200)
      .json({ success: true, message: "User assigned to branch", data: out });
  } catch (err) {
    console.error("assignUserToBranch error:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};
