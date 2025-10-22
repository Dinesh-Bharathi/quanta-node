import { pool } from "../../config/db.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { generateToken } from "../../utils/generateToken.js";
import { hashPassword, comparePassword } from "../../utils/hashPassword.js";

export const registerService = async (data) => {
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

  const [existingTent] = await pool.query(
    "SELECT tent_id FROM tbl_tent_master1 WHERE tent_email = ?",
    [tent_email]
  );
  if (existingTent.length > 0) {
    throw new Error("Tent with this email already exists");
  }

  const tent_uuid = generateShortUUID();
  const [tentResult] = await pool.query(
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

  await pool.query(
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

  const token = generateToken({
    tent_uuid,
    user_email,
    user_uuid,
  });

  return { token, user_uuid };
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
