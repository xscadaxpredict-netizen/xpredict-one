-- Production database setup for MySQL 8.0 (C39).
--
-- THIS FILE IS A TEMPLATE AND IS COMMITTED. It contains no password, and it
-- must not be edited in place and then committed again -- generate the real
-- statement on the server, from the password you put in `.env`:
--
--   PW=$(grep '^MYSQL_PASSWORD=' /srv/xpredict/backend/.env | cut -d= -f2-)
--   sed "s/__SET_A_REAL_PASSWORD__/${PW}/" backend/scripts/create_prod_db.sql \
--     | sudo mysql
--
-- The dev equivalent (`create_dev_db.sql`) hardcodes its password, which is
-- fine because it is a development value in every sense. That one real
-- credential being public is tolerable only because it is localhost-only on a
-- developer's machine; this one is not.

CREATE DATABASE IF NOT EXISTS xpredict_control
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- 'localhost' because MySQL runs on this box and Django connects over the
-- loopback interface. If MySQL ever moves to RDS this becomes the app server's
-- address, and MySQL must then be told to listen on something other than
-- 127.0.0.1 -- which is a security decision, not a typo fix.
CREATE USER IF NOT EXISTS 'xpredict'@'localhost'
  IDENTIFIED BY '__SET_A_REAL_PASSWORD__';

-- ONE GRANT COVERS EVERY DATABASE THIS APP WILL EVER MAKE, which is the point.
--
-- Database-per-tenant (C1) means the application CREATES a database each time
-- an organization signs up, so it needs the privilege to create databases it
-- does not yet know the name of. Granting that globally would hand the app
-- every other schema on the server, including `mysql` itself.
--
-- A pattern grant is the narrow version: in a MySQL grant `_` is a
-- single-character wildcard, so a literal underscore is written `\_`. The
-- pattern below reads "xpredict_ followed by anything", which covers
-- `xpredict_control` and every `xpredict_<org>` created later -- and nothing
-- else on the server.
--
-- WORTH SAYING PLAINLY: this application can create databases. That is
-- inherent to C1 and not a mistake, but it means a compromise of the app is a
-- compromise of every tenant's data, and no grant can narrow that further
-- while signup still provisions a database.
GRANT ALL PRIVILEGES ON `xpredict\_%`.* TO 'xpredict'@'localhost';

-- NO `test\_xpredict\_%` GRANT HERE, unlike development. The test suite builds
-- databases by prefixing `test_`, and nothing should be running the test suite
-- against the production server.

FLUSH PRIVILEGES;

SELECT 'xpredict user and xpredict_control database are ready.' AS result;
