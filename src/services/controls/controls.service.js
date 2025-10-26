import { pool } from "../../config/db.js";

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
    WHERE ttm.tent_uuid = '3ac40351'
      AND tr.is_delete = 0;`,
    [tentUuid]
  );

  return roleRows;
};
