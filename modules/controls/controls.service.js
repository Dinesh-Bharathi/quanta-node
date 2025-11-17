import {
  getTenantRolesRepo,
  getTenantRoleByUuidRepo,
  createTenantRoleRepo,
  updateTenantRoleRepo,
  deleteTenantRoleRepo,
  getTenantUsersRepo,
  createTenantUserRepo,
  updateTenantUserRepo,
  deleteTenantUserRepo,
  getTenantMenuRepo,
  getUserMenuRepo,
  getUserByUuidRepo,
  assignUserToBranchRepo,
} from "./controls.repository.js";

export const getTenantRolesService = (data) => getTenantRolesRepo(data);
export const getTenantRoleByUuidService = (roleUuid) =>
  getTenantRoleByUuidRepo(roleUuid);
export const addTenantRoleService = (data) => createTenantRoleRepo(data);
export const updateTenantRoleService = (data) => updateTenantRoleRepo(data);
export const deleteTenantRoleService = (data) => deleteTenantRoleRepo(data);
export const getTenantUsersService = (data) =>
  getTenantUsersRepo(data.tentUuid, data.branchUuid ?? null);
export const createTenantUserService = (data) => createTenantUserRepo(data);
export const updateTenantUserService = (data) => updateTenantUserRepo(data);
export const deleteTenantUserService = (data) =>
  deleteTenantUserRepo(data.userUuid);
export const getUserByUuidService = (userUuid) => getUserByUuidRepo(userUuid);
export const getTenantMenuService = (tentUuid) => getTenantMenuRepo(tentUuid);
export const getUsermenuService = (userUuid, branchUuid) =>
  getUserMenuRepo(userUuid, branchUuid);
export const assignUserToBranchService = (data) => assignUserToBranchRepo(data);
