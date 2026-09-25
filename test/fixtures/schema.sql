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
