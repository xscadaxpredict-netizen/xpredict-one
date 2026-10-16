#!/usr/bin/env bash
#
# Nightly backup of the control database, every tenant database, and the
# uploaded files.
#
# THE FILENAME SAYS "databases" AND IT COVERS MORE THAN THAT. It is kept
# because `deploy/README.md` installs it by this path and the installed name is
# already the generic `xpredict-backup`; renaming the source would be churn in
# a file somebody follows line by line on a server.
#
# WHY THIS IS NOT ONE `mysqldump xpredict_control`. Database-per-tenant (C1)
# means the customers' data is NOT in the control database -- that holds
# identity and structure, and every organisation's business data lives in its
# own `xpredict_<slug>` database created at signup. A backup of the control
# database alone would restore a system that knows who all its customers are
# and has none of their work.
#
# So this enumerates what exists rather than working from a list: a database
# created an hour ago by a signup is included without anybody updating a file.
#
#   sudo cp deploy/backup-databases.sh /usr/local/bin/xpredict-backup
#   sudo chmod +x /usr/local/bin/xpredict-backup
#
# Scheduled by `deploy/xpredict-backup.timer`.

set -euo pipefail

BACKUP_ROOT="${XPREDICT_BACKUP_ROOT:-/var/backups/xpredict}"
ENV_FILE="${XPREDICT_ENV_FILE:-/srv/xpredict/backend/.env}"
RETAIN_DAYS="${XPREDICT_BACKUP_RETAIN_DAYS:-14}"

# Credentials come from the app's own .env, so there is one place to change a
# password. Reading it here rather than hardcoding is also why this script can
# be committed.
if [[ ! -r "${ENV_FILE}" ]]; then
    echo "Cannot read ${ENV_FILE}" >&2
    exit 1
fi

MYSQL_USER="$(grep -E '^MYSQL_USER=' "${ENV_FILE}" | cut -d= -f2-)"
MYSQL_PASSWORD="$(grep -E '^MYSQL_PASSWORD=' "${ENV_FILE}" | cut -d= -f2-)"
MYSQL_HOST="$(grep -E '^MYSQL_HOST=' "${ENV_FILE}" | cut -d= -f2-)"

# A DEFAULTS FILE, NOT `-p` ON THE COMMAND LINE. A password in argv is visible
# to every user on the box via `ps`, and mysqldump warns about it on stderr
# every single run, which trains whoever reads the cron mail to ignore it.
CREDS="$(mktemp)"
trap 'rm -f "${CREDS}"' EXIT
chmod 600 "${CREDS}"
cat > "${CREDS}" <<EOF
[client]
user=${MYSQL_USER}
password=${MYSQL_PASSWORD}
host=${MYSQL_HOST:-127.0.0.1}
EOF

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_ROOT}/${STAMP}"
mkdir -p "${DEST}"

# Every database this application owns: the control database and one per
# organisation. The LIKE pattern matches the grant in create_prod_db.sql.
mapfile -t DATABASES < <(
    mysql --defaults-extra-file="${CREDS}" \
        --skip-column-names --batch \
        -e "SHOW DATABASES LIKE 'xpredict\\_%'"
)

if [[ ${#DATABASES[@]} -eq 0 ]]; then
    echo "No xpredict databases found -- refusing to write an empty backup." >&2
    exit 1
fi

for db in "${DATABASES[@]}"; do
    # --single-transaction: a consistent snapshot without locking the tables,
    #   which matters because this runs while the application is serving.
    # --routines --triggers --events: anything that is not a table is still
    #   part of the schema, and a restore that silently omits them is worse
    #   than one that fails.
    mysqldump --defaults-extra-file="${CREDS}" \
        --single-transaction \
        --routines --triggers --events \
        --default-character-set=utf8mb4 \
        "${db}" | gzip -9 > "${DEST}/${db}.sql.gz"
done

# --------------------------------------------------------------------------
# UPLOADED FILES, WHICH THIS SCRIPT DID NOT TOUCH UNTIL NOW.
#
# The databases store a FileField's PATH, not its bytes. So a restore from a
# database-only backup brings back every service report with its signature
# fields populated and every one of those files missing -- the rows say the
# evidence exists and the disk does not have it. There are ten FileFields:
# client and technician signatures, service-report attachments, water reports,
# complaint attachments, product images, manuals, videos and marketing
# material.
#
# A signed service report is the kind of thing somebody needs a year later, and
# it is the one piece of this system that cannot be recomputed from anything
# else.
#
# NOT A FAILURE WHEN IT IS EMPTY, but never silent either: before the first
# upload there is nothing to archive, and a backup that quietly skipped a
# 2 GB media directory would look identical.
# --------------------------------------------------------------------------
MEDIA_ROOT="${XPREDICT_MEDIA_ROOT:-/srv/xpredict/backend/media}"
MEDIA_STATUS="absent"
MEDIA_FILES=0

if [[ -d "${MEDIA_ROOT}" ]]; then
    MEDIA_FILES="$(find "${MEDIA_ROOT}" -type f | wc -l)"

    if [[ "${MEDIA_FILES}" -gt 0 ]]; then
        # -C so the archive holds relative paths and can be restored to a
        # different prefix; MEDIA_ROOT moves if the deployment layout does.
        tar -czf "${DEST}/media.tar.gz" -C "${MEDIA_ROOT}" .
        MEDIA_STATUS="archived"
    else
        MEDIA_STATUS="empty"
    fi
fi

# A manifest, so a restore does not have to guess what a complete backup looks
# like. A directory with a missing tenant and no manifest looks exactly like a
# directory with nothing missing.
{
    echo "taken_at=${STAMP}"
    echo "database_count=${#DATABASES[@]}"
    echo "media_status=${MEDIA_STATUS}"
    echo "media_file_count=${MEDIA_FILES}"
    printf '%s\n' "${DATABASES[@]}"
} > "${DEST}/MANIFEST"

echo "Backed up ${#DATABASES[@]} database(s) to ${DEST}"
echo "Uploaded files: ${MEDIA_STATUS} (${MEDIA_FILES} file(s))"

# RETENTION, AND THE REASON IT MATTERS ON THIS BOX: the volume is 27 GB and
# shared with MySQL's own data. Backups that are never pruned fill the disk,
# and a full disk stops MySQL writing -- so an unpruned backup is an outage
# with extra steps.
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETAIN_DAYS}" \
    -exec rm -rf {} +

# WHAT THIS DOES NOT DO: copy anything off the instance. A backup on the same
# volume as the database survives a bad migration and nothing else -- not an
# instance failure, not a deleted volume, not a region event. Shipping these
# to S3 is the next step and is not written here because it needs an IAM role
# and a bucket decision.
