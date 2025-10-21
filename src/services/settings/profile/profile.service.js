import { pool } from "../../../config/db.js";

export const getUserProfileService = async (userUuid) => {
  const [userRows] = await pool.query(
    `SELECT 
      u.user_id, u.user_uuid, u.user_name, u.user_email, 
      u.user_country_code, u.user_phone, u.is_owner,
      t.tent_id, t.tent_uuid, t.tent_name, t.tent_email, 
      t.tent_logo, t.tent_country, t.tent_state, t.tent_status
    FROM tbl_tent_users1 u
    JOIN tbl_tent_master1 t ON u.tent_id = t.tent_id
    WHERE u.user_uuid = ?`,
    [userUuid]
  );

  if (userRows.length === 0) {
    throw new Error("User not found");
  }

  const data = userRows[0];

  return {
    user_uuid: data.user_uuid,
    user_name: data.user_name,
    user_email: data.user_email,
    user_country_code: data.user_country_code,
    user_phone: data.user_phone,
    is_owner: !!data.is_owner,
  };
};

export const updateUserProfileService = async (userUuid, userData) => {
  const { user_name, user_email, user_phone } = userData;
  const [result] = await pool.query(
    `UPDATE tbl_tent_users1 
        SET user_name = ?, user_email = ?, user_phone = ?
        WHERE user_uuid = ?`,
    [user_name, user_email, user_phone, userUuid]
  );
  if (result.affectedRows === 0) {
    throw new Error("User not found or no changes made");
  }

  return await getUserProfileService(userUuid);
};

export const getTentDetailsService = async (tentUuid) => {
  const [tentRows] = await pool.query(
    `
        SELECT tent_name, tent_country_code, tent_phone, is_mobile_verified,
        tent_email, is_email_verified, tent_logo, tent_address1, tent_address2,
        tent_state, tent_country, tent_postalcode, tent_status, created_on,
        modified_on FROM tbl_tent_master1 WHERE tent_uuid = ?
        `,
    [tentUuid]
  );

  if (tentRows.length === 0) {
    throw new Error("Tenant not found");
  }

  const data = tentRows[0];

  return {
    ...data,
  };
};
