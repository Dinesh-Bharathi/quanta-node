import { Router } from "express";
import {
  createBranchController,
  deleteBranchController,
  getBranchDetailsController,
  getBranchUsersController,
  listBranchesController,
  updateBranchController,
} from "./branches.controller.js";

const router = Router();

router.get("/:tenantUuid", listBranchesController);
router.post("/:tenantUuid", createBranchController);

router.get("/:tenantUuid/:branchUuid", getBranchDetailsController);
router.put("/:tenantUuid/:branchUuid", updateBranchController);
router.delete("/:tenantUuid/:branchUuid", deleteBranchController);
router.get("/:tenantUuid/:branchUuid/users", getBranchUsersController);

// router.put("/assign-user", assignUserToBranch);
// router.post("/:tentUuid/:branchUuid/users", createBranchUser);

export default router;
