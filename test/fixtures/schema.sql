CREATE TYPE user_status AS ENUM ('active', 'blocked');

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email varchar(120) NOT NULL UNIQUE,
  full_name varchar(100) NOT NULL,
  status user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  total numeric(10, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id bigint GENERATED ALWAYS AS IDENTITY,
  region_code varchar(8) NOT NULL,
  name varchar(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (id, region_code)
);

CREATE TABLE tenant_settings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  region_code varchar(8) NOT NULL,
  setting_value text NOT NULL,
  FOREIGN KEY (tenant_id, region_code) REFERENCES tenants(id, region_code)
);

CREATE TABLE departments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(100) NOT NULL,
  lead_employee_id bigint NULL
);

CREATE TABLE employees (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id bigint NULL REFERENCES departments(id),
  full_name varchar(100) NOT NULL
);

ALTER TABLE departments
  ADD CONSTRAINT departments_lead_fk FOREIGN KEY (lead_employee_id) REFERENCES employees(id);
