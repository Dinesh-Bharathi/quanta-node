CREATE TABLE IF NOT EXISTS tbl_tent_master1 (
  tent_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tent_uuid CHAR(8) NOT NULL UNIQUE,
  tent_name VARCHAR(100) NOT NULL,
  tent_country_code VARCHAR(10),
  tent_phone VARCHAR(20),
  is_mobile_verified BOOLEAN DEFAULT FALSE,
  tent_email VARCHAR(150) UNIQUE,
  is_email_verified BOOLEAN DEFAULT FALSE,
  tent_logo VARCHAR(255),
  tent_address1 VARCHAR(255),
  tent_address2 VARCHAR(255),
  tent_state VARCHAR(100),
  tent_country VARCHAR(100),
  tent_postalcode VARCHAR(20),
  tent_status BOOLEAN DEFAULT TRUE,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE
	IF NOT EXISTS tbl_tent_users1 (
		user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
		tent_id BIGINT NOT NULL,
		user_uuid CHAR(8) NOT NULL UNIQUE,
		user_name VARCHAR(100) NOT NULL,
		user_email VARCHAR(150) UNIQUE,
		user_country_code VARCHAR(10),
		user_phone VARCHAR(20),
		password VARCHAR(255) NOT NULL,
		is_owner BOOLEAN DEFAULT FALSE,
		created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (tent_id) REFERENCES tbl_tent_master1 (tent_id) ON DELETE CASCADE
	);

CREATE TABLE
	IF NOT EXISTS menus (
		menu_id BIGINT AUTO_INCREMENT PRIMARY KEY,
		menu_uuid char(8) NOT NULL,
		menu_key VARCHAR(100) NOT NULL, -- programmatic key, e.g. "users", "reports"
		menu_name VARCHAR(255) NOT NULL, -- display name
		path VARCHAR(255) DEFAULT NULL,
		parent_menu_id BIGINT DEFAULT NULL,
		sort_order INT DEFAULT 0,
		created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		modified_on timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
		CONSTRAINT fk_menus_parent FOREIGN KEY (parent_menu_id) REFERENCES menus (menu_id) ON DELETE SET NULL
	) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS roles (
    role_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tent_id BIGINT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_roles_tenant FOREIGN KEY (tent_id) REFERENCES tbl_tent_master1(tent_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uniq_tenant_role (tent_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES tbl_tent_users1(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    UNIQUE KEY uniq_user_role (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_id BIGINT NOT NULL,
    menu_id BIGINT NOT NULL,
    can_read TINYINT(1) DEFAULT 0,
    can_add  TINYINT(1) DEFAULT 0,
    can_update TINYINT(1) DEFAULT 0,
    can_delete TINYINT(1) DEFAULT 0,
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    CONSTRAINT fk_role_permissions_menu FOREIGN KEY (menu_id) REFERENCES menus(menu_id) ON DELETE CASCADE,
    UNIQUE KEY uniq_role_menu (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Functions

-- Generate UUID
DELIMITER $$

CREATE FUNCTION generate_uuid8()
RETURNS CHAR(8)
DETERMINISTIC
BEGIN
  DECLARE short_uuid CHAR(8);
  SET short_uuid = SUBSTRING(REPLACE(UUID(), '-', ''), 1, 8);
  RETURN short_uuid;
END$$

DELIMITER ;


-- Triggers
-- Before Insert insert UUID to tbl_tent_master1
DELIMITER $$

CREATE TRIGGER before_insert_tent
BEFORE INSERT ON tbl_tent_master1
FOR EACH ROW
BEGIN
  IF NEW.tent_uuid IS NULL OR NEW.tent_uuid = '' THEN
    SET NEW.tent_uuid = generate_uuid8();
  END IF;
END$$

DELIMITER ;

-- Before Insert insert UUID to tbl_tent_user1
DELIMITER $$

CREATE TRIGGER before_insert_user
BEFORE INSERT ON tbl_tent_user1
FOR EACH ROW
BEGIN
  IF NEW.user_uuid IS NULL OR NEW.user_uuid = '' THEN
    SET NEW.user_uuid = generate_uuid8();
  END IF;
END$$

DELIMITER ;


-- Inserts default

-- SuperAdmin can do everything
INSERT INTO role_permissions (role_id, menu_id, can_read, can_add, can_update, can_delete)
SELECT r.role_id, m.menu_id, 1,1,1,1
FROM roles r, menus m
WHERE r.name = 'SuperAdmin' AND r.tent_id IS NULL;

-- Admin can read/add/update Settings, read Dashboard
INSERT INTO role_permissions (role_id, menu_id, can_read, can_add, can_update, can_delete)
SELECT r.role_id, m.menu_id,
  CASE WHEN m.menu_key='settings' THEN 1 ELSE 1 END AS can_read,
  CASE WHEN m.menu_key='settings' THEN 1 ELSE 0 END AS can_add,
  CASE WHEN m.menu_key='settings' THEN 1 ELSE 0 END AS can_update,
  CASE WHEN m.menu_key='settings' THEN 1 ELSE 0 END AS can_delete
FROM roles r, menus m
WHERE r.name='Admin' AND r.tent_id IS NULL;

-- Manager: read dashboard only
INSERT INTO role_permissions (role_id, menu_id, can_read, can_add, can_update, can_delete)
SELECT r.role_id, m.menu_id, 1,0,0,0
FROM roles r, menus m
WHERE r.name='Manager' AND r.tent_id IS NULL AND m.menu_key='dashboard';

-- Viewer: read dashboard only
INSERT INTO role_permissions (role_id, menu_id, can_read, can_add, can_update, can_delete)
SELECT r.role_id, m.menu_id, 1,0,0,0
FROM roles r, menus m
WHERE r.name='Viewer' AND r.tent_id IS NULL AND m.menu_key='dashboard';


-- Clone default roles into new tenant
INSERT INTO roles (tent_id, name, description)
SELECT t.tent_id, r.name, r.description
FROM tbl_tent_master1 t
JOIN roles r ON r.tent_id IS NULL
WHERE t.tent_id = ?; -- new tenant_id

-- Clone default role permissions for each new tenant role
INSERT INTO role_permissions (role_id, menu_id, can_read, can_add, can_update, can_delete)
SELECT r2.role_id, rp.menu_id, rp.can_read, rp.can_add, rp.can_update, rp.can_delete
FROM roles r2
JOIN roles r1 ON r1.name = r2.name AND r1.tent_id IS NULL
JOIN role_permissions rp ON rp.role_id = r1.role_id
WHERE r2.tent_id = ?;
