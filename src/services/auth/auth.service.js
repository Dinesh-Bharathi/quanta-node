import { pool } from "../../config/db.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { generateToken } from "../../utils/generateToken.js";
import { hashPassword, comparePassword } from "../../utils/hashPassword.js";

export const createDefaultSetupForTenant = async (conn, tent_id, user_id) => {
  // Free Trial Subscription
  const subscription_uuid = generateShortUUID();

  await conn.query(
    `
    INSERT INTO tbl_tenant_subscriptions (
      subscription_uuid,
      tent_id,
      plan_id,
      start_date,
      end_date,
      is_active,
      is_auto_renew,
      payment_status
    )
    SELECT
      ? AS subscription_uuid,
      ? AS tent_id,
      sp.plan_id,
      NOW() AS start_date,
      DATE_ADD(NOW(), INTERVAL sp.duration_days DAY) AS end_date,
      1 AS is_active,
      0 AS is_auto_renew,
      'FREE' AS payment_status
    FROM tbl_subscription_plans sp
    WHERE sp.plan_name = 'Free Trial';
    `,
    [subscription_uuid, tent_id]
  );

  // Insert Default Roles - Super Admin and Admin
  const superAdminUUID = generateShortUUID();
  const adminUUID = generateShortUUID();

  const [roleResult] = await conn.query(
    `
    INSERT INTO tbl_roles (role_uuid, tent_id, name, description, role_type, is_active)
    VALUES
      (?, ?, 'Super Admin', 'Full access across system', 'SYSTEM', 1),
      (?, ?, 'Admin', 'Access and manages administration', 'CUSTOM', 1);
    `,
    [superAdminUUID, tent_id, adminUUID, tent_id]
  );

  const [roles] = await conn.query(
    `SELECT role_id, name FROM tbl_roles WHERE tent_id = ? AND name IN ('Super Admin', 'Admin')`,
    [tent_id]
  );

  const superAdminRole = roles.find((r) => r.name === "Super Admin");
  const adminRole = roles.find((r) => r.name === "Admin");

  // Map Super Admin role to the owner user
  if (superAdminRole) {
    await conn.query(
      `INSERT INTO tbl_user_roles (user_id, role_id) VALUES (?, ?)`,
      [user_id, superAdminRole.role_id]
    );
  }

  // Grant full permissions for Super Admin on all menus
  if (superAdminRole) {
    await conn.query(
      `
      INSERT INTO tbl_role_permissions (
        role_id,
        menu_id,
        can_read,
        can_add,
        can_update,
        can_delete
      )
      SELECT
        ? AS role_id,
        menu_id,
        1 AS can_read,
        1 AS can_add,
        1 AS can_update,
        1 AS can_delete
      FROM tbl_menus;
      `,
      [superAdminRole.role_id]
    );
  }

  // Grant limited access to Admin
  // if (adminRole) {
  //   await conn.query(
  //     `
  //     INSERT INTO tbl_role_permissions (
  //       role_id,
  //       menu_id,
  //       can_read,
  //       can_add,
  //       can_update,
  //       can_delete
  //     )
  //     SELECT
  //       ? AS role_id,
  //       menu_id,
  //       1 AS can_read,
  //       CASE WHEN menu_key IN ('users', 'settings') THEN 1 ELSE 0 END AS can_add,
  //       CASE WHEN menu_key IN ('users') THEN 1 ELSE 0 END AS can_update,
  //       0 AS can_delete
  //     FROM tbl_menus;
  //     `,
  //     [adminRole.role_id]
  //   );
  // }
};

export const registerService = async (data) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      tent_name,
      tent_country_code,
      tent_phone,
      tent_email,
      tent_logo,
      tent_address1,
      tent_address2,
      tent_state,
      tent_country,
      tent_postalcode,
      user_name,
      user_email,
      user_country_code,
      user_phone,
      password,
    } = data;

    const [existingTent] = await connection.query(
      "SELECT tent_id FROM tbl_tent_master1 WHERE tent_email = ?",
      [tent_email]
    );
    if (existingTent.length > 0) {
      throw new Error("Tent with this email already exists");
    }

    const tent_uuid = generateShortUUID();
    const [tentResult] = await connection.query(
      `INSERT INTO tbl_tent_master1 
      (tent_uuid, tent_name, tent_country_code, tent_phone, tent_email, tent_logo, tent_address1, tent_address2, tent_state, tent_country, tent_postalcode) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tent_uuid,
        tent_name,
        tent_country_code,
        tent_phone,
        tent_email,
        tent_logo,
        tent_address1,
        tent_address2,
        tent_state,
        tent_country,
        tent_postalcode,
      ]
    );
    const tent_id = tentResult.insertId;

    const user_uuid = generateShortUUID();
    const hashedPwd = await hashPassword(password);

    const [userResult] = await connection.query(
      `INSERT INTO tbl_tent_users1 
      (tent_id, user_uuid, user_name, user_email, user_country_code, user_phone, password, is_owner) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tent_id,
        user_uuid,
        user_name,
        user_email,
        user_country_code,
        user_phone,
        hashedPwd,
        true,
      ]
    );
    const user_id = userResult.insertId;

    await createDefaultSetupForTenant(connection, tent_id, user_id);

    await connection.commit();

    const token = generateToken({
      tent_uuid,
      user_email,
      user_uuid,
    });

    return { token, tent_uuid, user_uuid };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const loginService = async ({ email, password }) => {
  const [user] = await pool.query(
    "SELECT ttu.*, ttm.tent_uuid FROM tbl_tent_users1 ttu join tbl_tent_master1 ttm on ttu.tent_id WHERE user_email = ?",
    [email]
  );

  if (user.length === 0) throw new Error("Invalid credentials");
  const currentUser = user[0];

  const isMatch = await comparePassword(password, currentUser.password);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = generateToken({
    user_uuid: currentUser.user_uuid,
    user_email: currentUser.user_email,
    tent_uuid: currentUser.tent_uuid,
  });

  return { token, user_uuid: currentUser.user_uuid };
};

export const getSessionService = async (user_uuid) => {
  const [userRows] = await pool.query(
    `SELECT 
      u.user_id, u.user_uuid, u.user_name, u.user_email, 
      u.user_country_code, u.user_phone, u.is_owner,
      t.tent_id, t.tent_uuid, t.tent_name, t.tent_email, 
      t.tent_logo, t.tent_country, t.tent_state, t.tent_status
    FROM tbl_tent_users1 u
    JOIN tbl_tent_master1 t ON u.tent_id = t.tent_id
    WHERE u.user_uuid = ?`,
    [user_uuid]
  );

  if (userRows.length === 0) {
    throw new Error("User not found");
  }

  const data = userRows[0];

  return {
    user: {
      user_uuid: data.user_uuid,
      user_name: data.user_name,
      user_email: data.user_email,
      user_country_code: data.user_country_code,
      user_phone: data.user_phone,
      is_owner: !!data.is_owner,
    },
    tent: {
      tent_uuid: data.tent_uuid,
      tent_name: data.tent_name,
      tent_email: data.tent_email,
      tent_logo: data.tent_logo,
      tent_country: data.tent_country,
      tent_state: data.tent_state,
      tent_status: !!data.tent_status,
    },
  };
};

export const changePasswordService = async (
  user_uuid,
  oldPassword,
  newPassword
) => {
  if (!oldPassword || !newPassword) {
    throw new Error("Old password and new password are required");
  }

  const [rows] = await pool.query(
    "SELECT password FROM tbl_tent_users1 WHERE user_uuid = ?",
    [user_uuid]
  );

  if (rows.length === 0) {
    throw new Error("User not found");
  }

  const currentPasswordHash = rows[0].password;

  const isMatch = await comparePassword(oldPassword, currentPasswordHash);
  if (!isMatch) {
    throw new Error("Old password is incorrect");
  }

  const hashedNewPassword = await hashPassword(newPassword);

  await pool.query(
    "UPDATE tbl_tent_users1 SET password = ?, modified_on = NOW() WHERE user_uuid = ?",
    [hashedNewPassword, user_uuid]
  );

  return true;
};
