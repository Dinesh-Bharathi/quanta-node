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
} from "./controls.repository.js";

export const getTenantRolesService = (tentUuid) => getTenantRolesRepo(tentUuid);
export const getTenantRoleByUuidService = (roleUuid) =>
  getTenantRoleByUuidRepo(roleUuid);
export const addTenantRoleService = (data) => createTenantRoleRepo(data);
export const updateTenantRoleByUuidService = (data) =>
  updateTenantRoleRepo(data);
export const deleteTenantRoleByUuidService = (data) =>
  deleteTenantRoleRepo(data.roleUuid);
export const getTenantUsersService = (data) =>
  getTenantUsersRepo(data.tentUuid);
export const createTenantUserService = (data) => createTenantUserRepo(data);
export const updateTenantUserService = (data) => updateTenantUserRepo(data);
export const deleteTenantUserService = (data) =>
  deleteTenantUserRepo(data.userUuid);
export const getUserByUuidService = (userUuid) => getUserByUuidRepo(userUuid);
export const getTenantMenuService = (tentUuid) => getTenantMenuRepo(tentUuid);
export const getUsermenuService = (userUuid) => getUserMenuRepo(userUuid);
