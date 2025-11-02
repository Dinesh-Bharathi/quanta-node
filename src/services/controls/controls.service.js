import { pool } from "../../config/db.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { hashPassword } from "../../utils/hashPassword.js";

export const getTenantMenuService = async (tentUuid) => {
  const [menuRows] = await pool.query(
    `WITH RECURSIVE menu_tree AS (
        SELECT 
          m.menu_id,
          m.menu_name,
          m.icon,
          m.menu_key,
          m.path,
          m.parent_menu_id,
          m.menu_group,
          m.is_main_menu,
          m.is_footer_menu,
          m.sort_order
        FROM tbl_menus m
        WHERE m.parent_menu_id IS NULL
        UNION ALL
        SELECT 
          m.menu_id,
          m.menu_name,
          m.icon,
          m.menu_key,
          m.path,
          m.parent_menu_id,
          m.menu_group,
          m.is_main_menu,
          m.is_footer_menu,
          m.sort_order
        FROM tbl_menus m
        INNER JOIN menu_tree mt ON mt.menu_id = m.parent_menu_id
      )
      SELECT DISTINCT
        mt.menu_id,
        mt.menu_name,
        mt.icon,
        mt.menu_key,
        mt.path,
        mt.parent_menu_id,
        mt.menu_group,
        mt.is_main_menu,
        mt.is_footer_menu,
        mt.sort_order
      FROM tbl_tent_master1 t
      JOIN tbl_tenant_subscriptions ts ON ts.tent_id = t.tent_id
      JOIN tbl_subscription_plans sp ON sp.plan_id = ts.plan_id
      JOIN tbl_plan_menus pm ON pm.plan_id = sp.plan_id
      JOIN menu_tree mt ON mt.menu_id = pm.menu_id
      WHERE t.tent_uuid = ?
        AND ts.is_active = 1
        AND (ts.end_date IS NULL OR ts.end_date >= NOW())
      ORDER BY mt.sort_order ASC;`,
    [tentUuid]
  );

  if (!menuRows.length) throw new Error("No active subscription menus found");

  // Build hierarchical structure
  const map = {};
  let mainNavigation = [];
  let footerNavigation = [];

  menuRows.forEach((menu) => {
    const formattedMenu = {
      title: menu.menu_name,
      url: menu.path,
      icon: menu.icon || null,
      subItems: [],
      is_main_menu: Boolean(menu.is_main_menu),
      is_footer_menu: Boolean(menu.is_footer_menu),
      menu_group: menu.menu_group,
      sort_order: menu.sort_order,
    };
    map[menu.menu_id] = formattedMenu;
  });

  // Create nested tree
  menuRows.forEach((menu) => {
    if (menu.parent_menu_id) {
      const parent = map[menu.parent_menu_id];
      if (parent) parent.subItems.push(map[menu.menu_id]);
    }
  });

  // Group by main/footer menu group
  const groupedMain = {};
  const groupedFooter = {};

  menuRows.forEach((menu) => {
    if (!menu.parent_menu_id) {
      if (menu.is_main_menu) {
        if (!groupedMain[menu.menu_group]) groupedMain[menu.menu_group] = [];
        groupedMain[menu.menu_group].push(map[menu.menu_id]);
      }
      if (menu.is_footer_menu) {
        if (!groupedFooter[menu.menu_group])
          groupedFooter[menu.menu_group] = [];
        groupedFooter[menu.menu_group].push(map[menu.menu_id]);
      }
    }
  });

  mainNavigation = Object.entries(groupedMain).map(([group, items]) => ({
    title: group,
    items,
  }));

  footerNavigation = Object.entries(groupedFooter).map(([group, items]) => ({
    title: group,
    items,
  }));

  return { mainNavigation, footerNavigation };
};

export const getUsermenuService = async (userUuid) => {
  const [menuRows] = await pool.query(
    `WITH RECURSIVE menu_tree AS (
      SELECT 
        m.menu_id,
        m.menu_name,
        m.icon,
        m.menu_key,
        m.path,
        m.parent_menu_id,
        m.menu_group,
        m.is_main_menu,
        m.is_footer_menu,
        m.sort_order
      FROM tbl_menus m
      WHERE m.parent_menu_id IS NULL
      UNION ALL
      SELECT 
        m.menu_id,
        m.menu_name,
        m.icon,
        m.menu_key,
        m.path,
        m.parent_menu_id,
        m.menu_group,
        m.is_main_menu,
        m.is_footer_menu,
        m.sort_order
      FROM tbl_menus m
      INNER JOIN menu_tree mt ON mt.menu_id = m.parent_menu_id
    )
    SELECT 
      mt.menu_id,
      mt.menu_name,
      mt.icon,
      mt.menu_key,
      mt.path,
      mt.parent_menu_id,
      mt.menu_group,
      mt.is_main_menu,
      mt.is_footer_menu,
      mt.sort_order,
      MAX(rp.can_read) AS can_read,
      MAX(rp.can_add) AS can_add,
      MAX(rp.can_update) AS can_update,
      MAX(rp.can_delete) AS can_delete
    FROM tbl_tent_users1 u
    JOIN tbl_user_roles ur ON ur.user_id = u.user_id
    JOIN tbl_roles r ON r.role_id = ur.role_id
    JOIN tbl_role_permissions rp ON rp.role_id = r.role_id
    JOIN menu_tree mt ON mt.menu_id = rp.menu_id
    WHERE u.user_uuid = ?
    GROUP BY 
      mt.menu_id, 
      mt.menu_name, 
      mt.icon, 
      mt.menu_key, 
      mt.path, 
      mt.parent_menu_id,
      mt.menu_group,
      mt.is_main_menu,
      mt.is_footer_menu,
      mt.sort_order
    HAVING MAX(rp.can_read) = 1
    ORDER BY mt.sort_order ASC`,
    [userUuid]
  );

  if (!menuRows.length) throw new Error("No menus found for user");

  const buildMenuTree = (menus) => {
    const map = {};
    let mainNavigation = [];
    let footerNavigation = [];

    menus.forEach((menu) => {
      const formattedMenu = {
        title: menu.menu_name,
        url: menu.path,
        icon: menu.icon || null,
        permissions: {
          read: Boolean(menu.can_read),
          add: Boolean(menu.can_add),
          update: Boolean(menu.can_update),
          delete: Boolean(menu.can_delete),
        },
        is_main_menu: Boolean(menu.is_main_menu),
        is_footer_menu: Boolean(menu.is_footer_menu),
        menu_group: menu.menu_group,
        sort_order: menu.sort_order,
        subItems: [],
      };

      map[menu.menu_id] = formattedMenu;
    });

    // Build nested structure
    menus.forEach((menu) => {
      if (menu.parent_menu_id) {
        const parent = map[menu.parent_menu_id];
        if (parent) {
          parent.subItems.push(map[menu.menu_id]);
        }
      }
    });

    // Separate main and footer menus
    const groupedMain = {};
    const groupedFooter = {};

    menus.forEach((menu) => {
      if (!menu.parent_menu_id) {
        if (menu.is_main_menu) {
          if (!groupedMain[menu.menu_group]) groupedMain[menu.menu_group] = [];
          groupedMain[menu.menu_group].push(map[menu.menu_id]);
        }
        if (menu.is_footer_menu) {
          if (!groupedFooter[menu.menu_group])
            groupedFooter[menu.menu_group] = [];
          groupedFooter[menu.menu_group].push(map[menu.menu_id]);
        }
      }
    });

    mainNavigation = Object.entries(groupedMain).map(([group, items]) => ({
      title: group,
      items,
    }));

    footerNavigation = Object.entries(groupedFooter).map(([group, items]) => ({
      title: group,
      items,
    }));

    return { mainNavigation, footerNavigation };
  };

  return buildMenuTree(menuRows);
};

export const getTenantRolesService = async (tentUuid) => {
  const [roleRows] = await pool.query(
    `SELECT 
        tr.role_uuid,
        tr.name AS role_name,
        tr.description,
        tr.role_type,
        CASE WHEN tr.is_active = 1 THEN TRUE ELSE FALSE END AS is_active,
        ttu1.user_name AS created_user,
        tr.created_at,
        ttu2.user_name AS updated_user,
        tr.updated_at
    FROM tbl_roles tr
    LEFT JOIN tbl_tent_users1 ttu1 ON tr.created_by = ttu1.user_id
    LEFT JOIN tbl_tent_users1 ttu2 ON tr.updated_by = ttu2.user_id
    INNER JOIN tbl_tent_master1 ttm ON tr.tent_id = ttm.tent_id
    WHERE ttm.tent_uuid = ?
      AND tr.is_delete = 0
    ORDER BY tr.created_at ASC;`,
    [tentUuid]
  );

  return roleRows;
};

export const addTenantRoleService = async ({
  tentUuid,
  roleName,
  description,
  permissions,
}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get tenant_id
    const [tenantRows] = await connection.query(
      `SELECT tent_id FROM tbl_tent_master1 WHERE tent_uuid = ?`,
      [tentUuid]
    );

    if (!tenantRows.length) throw new Error("Invalid tenant UUID.");
    const tentId = tenantRows[0].tent_id;

    // Create new role
    const roleUuid = generateShortUUID();
    const [roleResult] = await connection.query(
      `INSERT INTO tbl_roles (role_uuid, tent_id, name, description, role_type)
       VALUES (?, ?, ?, ?, ?)`,
      [roleUuid, tentId, roleName, description, "CUSTOM"]
    );

    const roleId = roleResult.insertId;

    // Get all menu IDs mapped by path
    const [menuRows] = await connection.query(
      `SELECT menu_id, path FROM tbl_menus`
    );

    const menuMap = {};
    menuRows.forEach((m) => (menuMap[m.path] = m.menu_id));

    // Build permission inserts
    const permissionValues = [];

    for (const [path, perm] of Object.entries(permissions)) {
      const menuId = menuMap[path];
      if (!menuId) continue; // Skip if path not found

      permissionValues.push([
        roleId,
        menuId,
        perm.read ? 1 : 0,
        perm.add ? 1 : 0,
        perm.update ? 1 : 0,
        perm.delete ? 1 : 0,
      ]);
    }

    if (permissionValues.length > 0) {
      await connection.query(
        `INSERT INTO tbl_role_permissions 
         (role_id, menu_id, can_read, can_add, can_update, can_delete)
         VALUES ?`,
        [permissionValues]
      );
    }

    await connection.commit();

    return {
      roleUuid,
      roleName,
      description,
      permissionsCount: permissionValues.length,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const getTenantRoleByUuidService = async (roleUuid) => {
  const [roleRows] = await pool.query(
    `SELECT role_id, name, description
     FROM tbl_roles
     WHERE role_uuid = ?`,
    [roleUuid]
  );

  if (!roleRows.length) return null;
  const role = roleRows[0];

  const [permRows] = await pool.query(
    `SELECT 
        m.path,
        rp.can_read,
        rp.can_add,
        rp.can_update,
        rp.can_delete
     FROM tbl_role_permissions rp
     JOIN tbl_menus m ON rp.menu_id = m.menu_id
     WHERE rp.role_id = ?`,
    [role.role_id]
  );

  const permissions = {};
  for (const perm of permRows) {
    permissions[perm.path] = {
      enabled:
        perm.can_read || perm.can_add || perm.can_update || perm.can_delete
          ? true
          : false,
      read: Boolean(perm.can_read),
      add: Boolean(perm.can_add),
      update: Boolean(perm.can_update),
      delete: Boolean(perm.can_delete),
    };
  }

  return {
    roleName: role.name,
    description: role.description,
    permissions,
  };
};

export const updateTenantRoleByUuidService = async ({
  roleUuid,
  roleName,
  description,
  permissions,
}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 🔹 Get role_id from UUID
    const [roleRows] = await connection.query(
      `SELECT role_id FROM tbl_roles WHERE role_uuid = ?`,
      [roleUuid]
    );

    if (!roleRows.length) throw new Error("Invalid role UUID.");
    const roleId = roleRows[0].role_id;

    // 🔹 Update role name/description
    await connection.query(
      `UPDATE tbl_roles SET name = ?, description = ? WHERE role_id = ?`,
      [roleName, description, roleId]
    );

    // 🔹 Get all menu IDs mapped by path (used to map permissions)
    const [menuRows] = await connection.query(
      `SELECT menu_id, path FROM tbl_menus`
    );

    const menuMap = {};
    menuRows.forEach((m) => (menuMap[m.path] = m.menu_id));

    // 🔹 Delete existing permissions (to simplify update logic)
    await connection.query(
      `DELETE FROM tbl_role_permissions WHERE role_id = ?`,
      [roleId]
    );

    // 🔹 Reinsert updated permissions
    const permissionValues = [];

    for (const [path, perm] of Object.entries(permissions)) {
      const menuId = menuMap[path];
      if (!menuId) continue; // Skip if menu path not found

      permissionValues.push([
        roleId,
        menuId,
        perm.read ? 1 : 0,
        perm.add ? 1 : 0,
        perm.update ? 1 : 0,
        perm.delete ? 1 : 0,
      ]);
    }

    if (permissionValues.length > 0) {
      await connection.query(
        `INSERT INTO tbl_role_permissions 
         (role_id, menu_id, can_read, can_add, can_update, can_delete)
         VALUES ?`,
        [permissionValues]
      );
    }

    await connection.commit();

    return {
      roleUuid,
      roleName,
      description,
      permissionsCount: permissionValues.length,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const deleteTenantRoleByUuidService = async ({ roleUuid }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get role_id
    const [roleRows] = await connection.query(
      `SELECT role_id FROM tbl_roles WHERE role_uuid = ? AND is_delete = 0`,
      [roleUuid]
    );

    if (!roleRows.length)
      throw new Error("Invalid or already deleted role UUID.");
    const roleId = roleRows[0].role_id;

    // Soft delete role (mark as deleted)
    await connection.query(
      `DELETE FROM tbl_roles
       WHERE role_id = ?`,
      [roleId]
    );

    // Optionally, remove or deactivate role permissions
    await connection.query(
      `DELETE FROM tbl_role_permissions WHERE role_id = ?`,
      [roleId]
    );

    await connection.commit();

    return {
      roleUuid,
      deleted: true,
      message: "Role deleted successfully",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const getTenantUsersService = async ({ tentUuid }) => {
  const [rows] = await pool.query(
    `
    SELECT 
      ttu.user_uuid,
      ttu.user_name,
      ttu.user_email,
      ttu.user_country_code,
      ttu.user_phone,
      ttu.is_owner,
      ttu.created_on,
      ttu.modified_on,
      tr.role_uuid,
      tr.name as role_name
    FROM tbl_tent_users1 ttu
    LEFT JOIN tbl_user_roles tur ON ttu.user_id = tur.user_id
    LEFT JOIN tbl_roles tr ON tur.role_id = tr.role_id
    WHERE ttu.tent_id = (SELECT tent_id FROM tbl_tent_master1 WHERE tent_uuid = ?)
    ORDER BY ttu.created_on ASC
    `,
    [tentUuid]
  );

  return rows;
};

export const updateTenantUserService = async ({
  userUuid,
  user_name,
  user_email,
  user_phone,
  role_uuid,
}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Find user_id by UUID
    const [[userRow]] = await connection.query(
      "SELECT user_id FROM tbl_tent_users1 WHERE user_uuid = ?",
      [userUuid]
    );
    if (!userRow) throw new Error("User not found");

    const userId = userRow.user_id;

    // Update user details
    await connection.query(
      `UPDATE tbl_tent_users1 
       SET user_name = ?, user_email = ?, user_phone = ?
       WHERE user_id = ?`,
      [user_name, user_email, user_phone, userId]
    );

    // Update or insert user role
    if (role_uuid) {
      const [existingRole] = await connection.query(
        `SELECT id FROM tbl_user_roles WHERE user_id = ?`,
        [userId]
      );

      const [[role_id]] = await connection.query(
        `SELECT role_id FROM tbl_roles WHERE role_uuid = ?`,
        [role_uuid]
      );

      if (existingRole.length > 0) {
        await connection.query(
          `UPDATE tbl_user_roles SET role_id = ? WHERE user_id = ?`,
          [role_id.role_id, userId]
        );
      } else {
        await connection.query(
          `INSERT INTO tbl_user_roles (user_id, role_id) VALUES (?, ?)`,
          [userId, role_id]
        );
      }
    }

    await connection.commit();

    return { userUuid, user_name, user_email, user_phone, role_uuid };
  } catch (err) {
    await connection.rollback();
    console.error("updateTenantUserService error:", err);
    throw err;
  } finally {
    connection.release();
  }
};

export const deleteTenantUserService = async ({ userUuid }) => {
  await pool.query(`DELETE FROM tbl_tent_users1 WHERE user_uuid = ?`, [
    userUuid,
  ]);
};

export const createTenantUserService = async ({
  tentUuid,
  user_name,
  user_email,
  user_country_code,
  user_phone,
  password,
  role_uuid,
  is_owner,
}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get tenant_id
    const [[tenantRow]] = await connection.query(
      "SELECT tent_id FROM tbl_tent_master1 WHERE tent_uuid = ?",
      [tentUuid]
    );

    if (!tenantRow) throw new Error("Tenant not found");

    const tent_id = tenantRow.tent_id;
    const user_uuid = generateShortUUID();
    const hashedPassword = await hashPassword(password);

    // Insert into tbl_tent_users1
    const [result] = await connection.query(
      `INSERT INTO tbl_tent_users1 
       (tent_id, user_uuid, user_name, user_email, user_country_code, user_phone, password, is_owner)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tent_id,
        user_uuid,
        user_name,
        user_email,
        user_country_code || null,
        user_phone || null,
        hashedPassword,
        is_owner,
      ]
    );

    const user_id = result.insertId;

    const [[role_id]] = await connection.query(
      `SELECT role_id FROM tbl_roles WHERE tent_id = ? AND role_uuid = ?`,
      [tent_id, role_uuid]
    );

    // If role is provided, assign it
    if (role_id) {
      await connection.query(
        `INSERT INTO tbl_user_roles (user_id, role_id) VALUES (?, ?)`,
        [user_id, role_id.role_id]
      );
    }

    await connection.commit();

    return {
      user_uuid,
      user_name,
      user_email,
      user_country_code,
      user_phone,
      role_uuid,
      is_owner,
      created_on: new Date(),
    };
  } catch (err) {
    await connection.rollback();
    console.error("createTenantUserService error:", err);
    throw err;
  } finally {
    connection.release();
  }
};

export const getUserByUuidService = async (userUuid) => {
  const [rows] = await pool.query(
    `
    SELECT 
      ttu.user_uuid,
      ttu.user_name,
      ttu.user_email,
      ttu.user_country_code,
      ttu.user_phone,
      ttu.is_owner,
      ttu.created_on,
      ttu.modified_on,
      tr.role_uuid,
      tr.name as role_name
    FROM tbl_tent_users1 AS ttu
    LEFT JOIN tbl_user_roles AS tur ON ttu.user_id = tur.user_id
    LEFT JOIN tbl_roles AS tr ON tur.role_id = tr.role_id
    WHERE ttu.user_uuid = ?
    LIMIT 1
    `,
    [userUuid]
  );

  // Return null if no result found
  return rows.length ? rows[0] : null;
};
