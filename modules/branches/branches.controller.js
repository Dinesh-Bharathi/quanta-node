// controllers/branch.controller.js

import {
  listBranchesService,
  createBranchService,
  getBranchDetailsService,
  updateBranchService,
  deleteBranchService,
  getBranchUsersService,
} from "./branches.service.js";

import { successResponse, errorResponse } from "../../utils/response.js";

/**
 * GET /api/branches/:tenantUuid
 */
export const listBranchesController = async (req, res, next) => {
  try {
    const { tenantUuid } = req.params;

    if (!tenantUuid) {
      return errorResponse(res, "Tenant UUID is required", 400);
    }

    const branches = await listBranchesService({ tenantUuid });

    return successResponse(res, "Branches fetched successfully", branches, 200);
  } catch (error) {
    console.error("❌ List Branches Error:", error);
    next(error);
  }
};

/**
 * POST /api/branches/:tenantUuid
 */
export const createBranchController = async (req, res, next) => {
  try {
    const { tenantUuid } = req.params;

    if (!tenantUuid) {
      return errorResponse(res, "Tenant UUID is required", 400);
    }

    const branch = await createBranchService({
      tenantUuid,
      ...req.body,
    });

    return successResponse(res, "Branch created successfully", branch, 201);
  } catch (error) {
    console.error("❌ Create Branch Error:", error);
    next(error);
  }
};

/**
 * GET /api/branches/:tenantUuid/:branchUuid
 */
export const getBranchDetailsController = async (req, res, next) => {
  try {
    const { tenantUuid, branchUuid } = req.params;

    if (!tenantUuid || !branchUuid) {
      return errorResponse(
        res,
        "Tenant UUID and Branch UUID are required",
        400
      );
    }

    const branch = await getBranchDetailsService({
      tenantUuid,
      branchUuid,
    });

    return successResponse(res, "Branch details fetched successfully", branch);
  } catch (error) {
    console.error("❌ Get Branch Details Error:", error);
    next(error);
  }
};

/**
 * PUT /api/branches/:tenantUuid/:branchUuid
 */
export const updateBranchController = async (req, res, next) => {
  try {
    const { tenantUuid, branchUuid } = req.params;

    const branch = await updateBranchService({
      tenantUuid,
      branchUuid,
      updates: req.body,
    });

    return successResponse(res, "Branch updated successfully", branch);
  } catch (error) {
    console.error("❌ Update Branch Error:", error);
    next(error);
  }
};

/**
 * DELETE /api/branches/:tenantUuid/:branchUuid
 */
export const deleteBranchController = async (req, res, next) => {
  try {
    const { tenantUuid, branchUuid } = req.params;

    const result = await deleteBranchService({
      tenantUuid,
      branchUuid,
    });

    return successResponse(res, "Branch deleted successfully", result);
  } catch (error) {
    console.error("❌ Delete Branch Error:", error);
    next(error);
  }
};

/**
 * GET /api/branches/:tenantUuid/:branchUuid/users
 */
export const getBranchUsersController = async (req, res, next) => {
  try {
    const { tenantUuid, branchUuid } = req.params;

    const users = await getBranchUsersService({
      tenantUuid,
      branchUuid,
    });

    return successResponse(res, "Branch users fetched successfully", users);
  } catch (error) {
    console.error("❌ Get Branch Users Error:", error);
    next(error);
  }
};
