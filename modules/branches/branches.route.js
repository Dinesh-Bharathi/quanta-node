import { Router } from "express";
import {
  assignUserToBranch,
  createBranch,
  createBranchUser,
  deleteBranch,
  getBranchDetails,
  getBranchUsers,
  listBranches,
  updateBranch,
} from "./branches.controller.js";

const router = Router();

router.get("/:tentUuid", listBranches);
router.post("/:tentUuid", createBranch);
router.put("/assign-user", assignUserToBranch);

router.get("/:tentUuid/:branchUuid", getBranchDetails);
router.put("/:tentUuid/:branchUuid", updateBranch);
router.delete("/:tentUuid/:branchUuid", deleteBranch);

router.get("/:tentUuid/:branchUuid/users", getBranchUsers);
router.post("/:tentUuid/:branchUuid/users", createBranchUser);

export default router;

// GET  /api/branches/:tentUuid            -> list branches for a tenant
// POST /api/branches/:tentUuid            -> create a branch (HQ only or owner only)
// GET  /api/branches/:tentUuid/:branchUuid-> get branch details
// PUT  /api/branches/:tentUuid/:branchUuid-> update branch
// DELETE /api/branches/:tentUuid/:branchUuid -> delete branch (soft delete recommended)
// POST /api/branches/:tentUuid/:branchUuid/users -> create user for branch (or assign existing user)
// PUT  /api/branches/assign-user -> assign user to branch (userUuid + branchUuid)
