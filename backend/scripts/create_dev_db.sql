-- Development database setup for MySQL 8.0 (C39).
--
-- Run ONCE, as a MySQL administrator:
--
--   mysql -u root -p < backend/scripts/create_dev_db.sql
--
-- These credentials are the ones in `.env.example`, and they are development
-- values in every sense: they are committed, they are identical for everybody,
-- and they must never exist on a server that holds real data.

CREATE DATABASE IF NOT EXISTS xpredict_control
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'xpredict'@'localhost' IDENTIFIED BY 'xpredict';

-- ONE GRANT COVERS EVERY DATABASE THIS APP WILL EVER MAKE, which is the point.
--
-- Database-per-tenant (C1) means the application CREATES a database each time
-- an organization signs up, so it needs the privilege to create databases it
-- does not yet know the name of. Granting that globally would hand the app
-- every other schema on the server, including `mysql` itself.
--
-- A pattern grant is the narrow version: it permits exactly the names the
-- tenant provisioner will use, and nothing else. In a MySQL grant `_` is a
-- single-character wildcard, so a literal underscore is written `\_` --- the
-- pattern below reads "xpredict_ followed by anything", which covers
-- `xpredict_control` and every `xpredict_<org>` created later.
GRANT ALL PRIVILEGES ON `xpredict\_%`.* TO 'xpredict'@'localhost';

-- Django builds its test databases by prefixing `test_`, which does not match
-- the pattern above. Without this, `pytest --create-db` fails on a permission
-- error that reads like a configuration problem.
GRANT ALL PRIVILEGES ON `test\_xpredict\_%`.* TO 'xpredict'@'localhost';

FLUSH PRIVILEGES;

SELECT 'xpredict user and xpredict_control database are ready.' AS result;
