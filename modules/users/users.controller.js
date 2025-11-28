// controllers/user.controller.js

import {
  getTenantUsersService,
  createTenantUserService,
  updateTenantUserService,
  deleteTenantUserService,
  getUserByUuidService,
} from "./users.service.js";

import { successResponse, errorResponse } from "../../utils/response.js";

/**
 * GET users belonging to a tenant
 */
export const getTenantUsersController = async (req, res, next) => {
  try {
    const { tenantUuid } = req.params;
    const { all = false, branchUuid = null } = req.query;

    if (!tenantUuid) {
      return errorResponse(res, "Tenant UUID is required", 400);
    }

    const users = await getTenantUsersService({
      tenantUuid,
      all: all === "true",
      branchUuid,
    });

    return successResponse(res, "Users fetched successfully", users, 200);
  } catch (error) {
    console.error("❌ GetTenantUsers Error:", error);
    next(error);
  }
};

/**
 * POST create tenant user
 */
export const createTenantUserController = async (req, res, next) => {
  try {
    const { tenantUuid } = req.params;

    if (!tenantUuid) {
      return errorResponse(res, "Tenant UUID is required", 400);
    }

    const newUser = await createTenantUserService({
      tenantUuid,
      ...req.body,
    });

    return successResponse(res, "User created successfully", newUser, 201);
  } catch (error) {
    console.error("❌ CreateTenantUser Error:", error);
    next(error);
  }
};

/**
 * GET user details by UUID
 */
export const getTenantUserByUuidController = async (req, res, next) => {
  try {
    const { userUuid } = req.params;

    const user = await getUserByUuidService(userUuid);
    if (!user) return errorResponse(res, "User not found", 404);

    return successResponse(res, "User details fetched", user, 200);
  } catch (error) {
    console.error("❌ GetTenantUserByUuid Error:", error);
    next(error);
  }
};

/**
 * PUT update tenant user
 */
export const updateTenantUserController = async (req, res, next) => {
  try {
    const { userUuid } = req.params;

    if (!userUuid) {
      return errorResponse(res, "User UUID is required", 400);
    }

    const updatedUser = await updateTenantUserService({
      userUuid,
      ...req.body,
    });

    return successResponse(res, "User updated successfully", updatedUser, 200);
  } catch (error) {
    console.error("❌ UpdateTenantUser Error:", error);
    next(error);
  }
};

/**
 * DELETE tenant user
 */
export const deleteTenantUserController = async (req, res, next) => {
  try {
    const { userUuid } = req.params;

    if (!userUuid) {
      return errorResponse(res, "User UUID is required", 400);
    }

    await deleteTenantUserService({ userUuid });

    return successResponse(res, "User deleted successfully", null, 200);
  } catch (error) {
    console.error("❌ DeleteTenantUser Error:", error);
    next(error);
  }
};
