import {
  listBranchesService,
  createBranchService,
  getBranchDetailsService,
  updateBranchService,
  deleteBranchService,
  getBranchUsersService,
  createBranchUserService,
  assignUserToBranchService,
} from "./branches.service.js";

// GET /api/branches/:tentUuid
export const listBranches = async (req, res, next) => {
  try {
    const branches = await listBranchesService({
      tentUuid: req.params.tentUuid,
    });
    res.status(200).json({ success: true, data: branches });
  } catch (err) {
    next(err);
  }
};

// POST /api/branches/:tentUuid
export const createBranch = async (req, res, next) => {
  try {
    const { tentUuid } = req.params;
    const data = req.body;

    const branch = await createBranchService({ tentUuid, ...data });

    res.status(201).json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
};

// GET /api/branches/:tentUuid/:branchUuid
export const getBranchDetails = async (req, res, next) => {
  try {
    const { tentUuid, branchUuid } = req.params;

    const branch = await getBranchDetailsService({ tentUuid, branchUuid });

    res.status(200).json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
};

// PUT /api/branches/:tentUuid/:branchUuid
export const updateBranch = async (req, res, next) => {
  try {
    const { tentUuid, branchUuid } = req.params;

    const branch = await updateBranchService({
      tentUuid,
      branchUuid,
      updates: req.body,
    });

    res.status(200).json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/branches/:tentUuid/:branchUuid
export const deleteBranch = async (req, res, next) => {
  try {
    const { tentUuid, branchUuid } = req.params;

    const result = await deleteBranchService({ tentUuid, branchUuid });

    res
      .status(200)
      .json({ success: true, message: "Branch deleted", data: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/branches/:tentUuid/:branchUuid/users
export const getBranchUsers = async (req, res, next) => {
  try {
    const { tentUuid, branchUuid } = req.params;

    const users = await getBranchUsersService({ tentUuid, branchUuid });

    res.status(200).json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

// POST /api/branches/:tentUuid/:branchUuid/users
export const createBranchUser = async (req, res, next) => {
  try {
    const { tentUuid, branchUuid } = req.params;

    const user = await createBranchUserService({
      tentUuid,
      branchUuid,
      ...req.body,
    });

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// PUT /api/branches/assign-user
export const assignUserToBranch = async (req, res, next) => {
  try {
    const { userUuid, branchUuid } = req.body;

    const result = await assignUserToBranchService({ userUuid, branchUuid });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
