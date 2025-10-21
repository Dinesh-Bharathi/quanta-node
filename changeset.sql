
CREATE TABLE IF NOT EXISTS tbl_tent_master1 (
  tent_id INT AUTO_INCREMENT PRIMARY KEY,
  tent_uuid CHAR(8) NOT NULL UNIQUE,
  tent_name VARCHAR(100) NOT NULL,
  tent_country_code VARCHAR(10),
  tent_phone VARCHAR(20),
  tent_email VARCHAR(150) UNIQUE,
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

CREATE TABLE IF NOT EXISTS tbl_tent_users1 (
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
  FOREIGN KEY (tent_id) REFERENCES tbl_tent_master(tent_id) ON DELETE CASCADE
);

