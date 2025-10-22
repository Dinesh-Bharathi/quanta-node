CREATE TABLE IF NOT EXISTS tbl_tent_master1 (
  tent_id INT AUTO_INCREMENT PRIMARY KEY,
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
		user_id INT AUTO_INCREMENT PRIMARY KEY,
		tent_id INT NOT NULL,
		user_uuid CHAR(8) NOT NULL UNIQUE,
		user_name VARCHAR(100) NOT NULL,
		user_email VARCHAR(150) UNIQUE,
		user_country_code VARCHAR(10),
		user_phone VARCHAR(20),
		password VARCHAR(255) NOT NULL,
		is_owner BOOLEAN DEFAULT FALSE,
		created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (tent_id) REFERENCES tbl_tent_master (tent_id) ON DELETE CASCADE
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