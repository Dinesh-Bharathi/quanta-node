import { errorResponse, successResponse } from "../../utils/response.js";
import {
  getUsermenuService,
  getTenantMenuService,
  getTenantRolesService,
  addTenantRoleService,
  getTenantRoleByUuidService,
  updateTenantRoleService,
  deleteTenantRoleService,
} from "./roles.service.js";

/**
 * GET /api/controls/tenant/subscribed/menus/:tenantUuid
 * Fetch menus available under tenant's active subscription plan
 */
export const getTenantMenusController = async (req, res, next) => {
  try {
    const { tenantUuid } = req.params;

    console.log("tenantUuid", tenantUuid);

    // =============================
    // VALIDATION
    // =============================
    if (!tenantUuid) {
      return errorResponse(res, "Tenant UUID is required", 400);
    }

    const menus = await getTenantMenuService(tenantUuid);

    return successResponse(
      res,
      "Subscribed menus fetched successfully",
      menus,
      200
    );
  } catch (error) {
    console.error("❌ Get Tenant Menus Controller Error:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    return errorResponse(
      res,
      "Failed to fetch subscribed menus",
      500,
      error.message
    );
  }
};

/**
 * GET /api/controls/menus/:userUuid/:branchUuid
 * Get menus accessible to logged-in user based on branch context
 */
export const getUserMenusController = async (req, res, next) => {
  try {
    const { userUuid, branchUuid } = req.params;

    // ========================================
    // VALIDATION
    // ========================================
    if (!userUuid || !branchUuid) {
      return errorResponse(res, "User UUID and Branch UUID are required", 400);
    }

    const menus = await getUsermenuService(userUuid, branchUuid);

    return successResponse(res, "Menus fetched successfully", menus, 200);
  } catch (error) {
    console.error("❌ Get User Menus Controller Error:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    return errorResponse(res, "Failed to fetch user menus", 500, error.message);
  }
};

/**
 * GET /api/controls/tenant/roles/:tenantUuid
 */
export const getTenantRolesController = async (req, res) => {
  try {
    const { tenantUuid } = req.params;

    const roles = await getTenantRolesService({ tenantUuid });

    return successResponse(res, "Roles fetched successfully", roles, 200);
  } catch (error) {
    console.error("❌ getTenantRoles Error:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    return errorResponse(res, "Failed to fetch roles", 400, error.message);
  }
};

/**
 * POST /api/controls/tenant/roles/:tenantUuid
 * Create a new role for a tenant with menu CRUD permissions
 */
export const addTenantRoleController = async (req, res, next) => {
  try {
    const { tenantUuid } = req.params;
    const { role_name, description, permissions } = req.body;

    // ========================================
    // VALIDATION
    // ========================================
    if (!tenantUuid || !role_name?.trim()) {
      return errorResponse(res, "Tenant UUID and role name are required", 400);
    }

    if (!permissions || Object.keys(permissions).length === 0) {
      return errorResponse(
        res,
        "At least one permission must be assigned",
        400
      );
    }

    const createdBy = req.user?.tenant_user_id || null; // From auth middleware

    const role = await addTenantRoleService({
      tenantUuid,
      role_name: role_name.trim(),
      description: description?.trim() || null,
      permissions,
      created_by: createdBy,
    });

    return successResponse(res, "Role created successfully", role, 201);
  } catch (error) {
    console.error("❌ Add Tenant Role Controller Error:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    if (error.code === "P2002") {
      return errorResponse(res, "Role already exists for this tenant", 409);
    }

    return errorResponse(res, "Failed to create role", 500, error.message);
  }
};

/**
 * GET /api/controls/tenant/role/details/:roleUuid
 * Fetch role details + menu permissions for editing
 */
export const getTenantRoleByUuidController = async (req, res, next) => {
  try {
    const { roleUuid } = req.params;

    if (!roleUuid) {
      return errorResponse(res, "Role UUID is required", 400);
    }

    const roleData = await getTenantRoleByUuidService(roleUuid);

    if (!roleData) {
      return errorResponse(res, "Role not found", 404);
    }

    return successResponse(
      res,
      "Role details fetched successfully",
      roleData,
      200
    );
  } catch (error) {
    console.error("❌ Get Role Details Error:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    return errorResponse(
      res,
      "Failed to fetch role details",
      500,
      error.message
    );
  }
};

/**
 * PUT /api/controls/tenant/role/:roleUuid
 * Update role details + permissions
 */
export const updateTenantRoleController = async (req, res, next) => {
  try {
    const { roleUuid } = req.params;
    const { tenantUuid, role_name, description, permissions } = req.body;

    console.log(
      "updateTenantRoleController",
      roleUuid,
      tenantUuid,
      role_name,
      description,
      permissions
    );

    // ========================================
    // VALIDATION
    // ========================================
    if (!roleUuid || !tenantUuid) {
      return errorResponse(res, "Role UUID and Tenant UUID are required", 400);
    }

    if (!role_name?.trim()) {
      return errorResponse(res, "Role name is required", 400);
    }

    if (!permissions || Object.keys(permissions).length === 0) {
      return errorResponse(res, "Permissions must not be empty", 400);
    }

    const updatedBy = req.user?.tenant_user_id || null;

    const updatedRole = await updateTenantRoleService({
      roleUuid,
      tenantUuid,
      role_name: role_name.trim(),
      description: description?.trim() || null,
      permissions,
      updated_by: updatedBy,
    });

    return successResponse(res, "Role updated successfully", updatedRole, 200);
  } catch (error) {
    console.error("❌ Update Tenant Role Error:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    if (error.code === "P2002") {
      return errorResponse(
        res,
        "Another role already exists with this name",
        409
      );
    }

    return errorResponse(res, "Failed to update role", 500, error.message);
  }
};

/**
 * DELETE /api/tenant/role/:tentUuid/:roleUuid
 */
export const deleteTenantRoleController = async (req, res, next) => {
  try {
    const { tenantUuid, roleUuid } = req.params;

    // =============================
    // VALIDATION
    // =============================
    if (!tenantUuid || !roleUuid) {
      return errorResponse(res, "Tenant UUID and Role UUID are required", 400);
    }

    await deleteTenantRoleService({ tenantUuid, roleUuid });

    return successResponse(res, "Role deleted successfully", null, 200);
  } catch (error) {
    console.error("❌ Delete Tenant Role Error:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    // Known validation errors
    if (
      error.message.includes("Tenant not found") ||
      error.message.includes("Role not found") ||
      error.message.includes("Cannot delete")
    ) {
      return errorResponse(res, error.message, 400);
    }

    return errorResponse(res, "Failed to delete role", 500);
  }
};
