import {
  listBranchesRepo,
  createBranchRepo,
  getBranchDetailsRepo,
  updateBranchRepo,
  deleteBranchRepo,
  getBranchUsersRepo,
  createBranchUserRepo,
  assignUserToBranchRepo,
} from "./branches.repository.js";

export const listBranchesService = ({ tentUuid }) => listBranchesRepo(tentUuid);

export const createBranchService = (data) => createBranchRepo(data);

export const getBranchDetailsService = ({ tentUuid, branchUuid }) =>
  getBranchDetailsRepo({ tentUuid, branchUuid });

export const updateBranchService = ({ tentUuid, branchUuid, updates }) =>
  updateBranchRepo({ tentUuid, branchUuid, updates });

export const deleteBranchService = ({ tentUuid, branchUuid }) =>
  deleteBranchRepo({ tentUuid, branchUuid });

export const getBranchUsersService = ({ tentUuid, branchUuid }) =>
  getBranchUsersRepo({ tentUuid, branchUuid });

export const createBranchUserService = (data) => createBranchUserRepo(data);

export const assignUserToBranchService = ({ userUuid, branchUuid }) =>
  assignUserToBranchRepo({ userUuid, branchUuid });
