# Production deployment — Ubuntu on EC2

First deployment of Xpredict One to a single EC2 instance: Nginx, Gunicorn,
Celery, MySQL and Redis on one box.

**Target used when writing this:** t3a.small (2 vCPU, 2 GiB), Ubuntu, 27 GB gp3,
security group open on 22 / 80 / 443.

Replace `app.example.com` throughout with your real hostname.

---

## What is unproven, before you start

Two things in this stack have never run anywhere, and this deployment is the
first time they will. Knowing which they are is the difference between a
confusing afternoon and a ten-minute fix.

- **Redis and the Celery broker round trip.** Development sets
  `CELERY_TASK_ALWAYS_EAGER`, so provisioning has only ever run inline. Step 12
  proves it deliberately rather than discovering it at the first signup.
- **`config/settings/prod.py` itself.** The dev settings are exercised by 402
  tests; the production ones are exercised by nothing. They now refuse to start
  when something critical is missing, which turns the usual class of silent
  misconfiguration into a message naming the variable.

## Prerequisites

- A domain, with an **A record already pointing at the instance's public IP**.
  Certbot verifies over HTTP, so DNS must resolve *before* step 13 — check with
  `dig +short app.example.com`.
- SSH access as `ubuntu`.
- The repository is public, so the box needs no git credentials.

---

## 1. Check what you actually have

```bash
lsb_release -a && python3 --version && free -h && df -h / && nproc
```

**Python must be 3.12 or newer** (`requires-python = ">=3.12"`). Ubuntu 24.04
ships 3.12 and is the assumption here. On 22.04 the system Python is 3.10 and
this will not run — either use a 24.04 image, or add deadsnakes and use
`python3.12` explicitly everywhere below.

## 2. Swap — do this before installing anything

2 GiB with no swap is the single most likely cause of a mysterious outage on
this box: MySQL, three Gunicorn workers, two Celery processes, Redis and Nginx
together will approach the limit, and the kernel kills the largest process,
which is MySQL — taking every tenant database offline.

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Swap is a safety net, not headroom — if it is being used constantly, the
instance is too small.

## 3. System packages

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
sudo apt install -y python3-venv python3-dev build-essential pkg-config default-libmysqlclient-dev mysql-server redis-server nginx git
```

`build-essential`, `pkg-config`, `python3-dev` and `default-libmysqlclient-dev`
are there for **mysqlclient**, which is a C extension and fails to build
without them. The error it gives is about `mysql_config` and does not mention
any of these by name.

## 4. The application user

```bash
sudo adduser --system --group --home /srv/xpredict --shell /usr/sbin/nologin xpredict
```

A system user with no login shell: the services run as it, nobody logs in as
it. `--group` creates the matching `xpredict` group that the systemd units and
the Gunicorn socket permissions refer to.

## 5. The code

```bash
sudo -u xpredict git clone https://github.com/xscadaxpredict-netizen/xpredict-one.git /srv/xpredict
```

```bash
cd /srv/xpredict && sudo -u xpredict git log --oneline -1
```

Confirm it is the commit you intend to deploy.

## 6. Python environment

```bash
sudo -u xpredict python3 -m venv /srv/xpredict/backend/.venv
```

```bash
sudo -u xpredict /srv/xpredict/backend/.venv/bin/pip install --upgrade pip
```

```bash
sudo -u xpredict /srv/xpredict/backend/.venv/bin/pip install -r /srv/xpredict/backend/requirements.lock.txt
```

The lock file is the same one development uses, so the server runs exactly the
versions the tests ran against. It also pulls the dev tooling (pytest, ruff,
mypy) — about 40 MB of things production does not need. Tolerated for now
because having one lock file means there is no second file to drift.

## 7. MySQL

```bash
sudo cp /srv/xpredict/deploy/mysql-xpredict.cnf /etc/mysql/mysql.conf.d/zz-xpredict.cnf && sudo systemctl restart mysql
```

```bash
sudo mysql -e "SELECT @@innodb_buffer_pool_size/1024/1024 AS buffer_pool_mb, @@max_connections, @@bind_address;"
```

Expect 512, 100, 127.0.0.1. If the buffer pool still reads 128, the config file
is not being loaded — check the filename ends in `.cnf` and lives in
`/etc/mysql/mysql.conf.d/`.

Now the database and user. **Generate a real password first** and keep it; you
will paste it into `.env` in step 9.

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

```bash
sudo sed "s/__SET_A_REAL_PASSWORD__/PASTE_THE_PASSWORD_HERE/" /srv/xpredict/backend/scripts/create_prod_db.sql | sudo mysql
```

> The grant is a **pattern grant** on `` `xpredict\_%` ``, which is what lets the
> application create a database per organisation (C1) without being able to
> touch anything else on the server — including `mysql` itself.

## 8. Redis

Ubuntu's default already binds to loopback. Confirm rather than assume:

```bash
sudo systemctl enable --now redis-server && redis-cli ping && sudo ss -lntp | grep 6379
```

`PONG`, and a listen address of `127.0.0.1` only. If it shows `0.0.0.0`, stop
and fix `bind` in `/etc/redis/redis.conf` — an open Redis is remotely
exploitable and will be found within hours.

## 9. Configuration

```bash
sudo -u xpredict cp /srv/xpredict/backend/.env.production.example /srv/xpredict/backend/.env
```

```bash
sudo -u xpredict python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

```bash
sudo -u xpredict nano /srv/xpredict/backend/.env
```

Fill in `DJANGO_SECRET_KEY`, `MYSQL_PASSWORD`, and set `DJANGO_ALLOWED_HOSTS`
and `FRONTEND_BASE_URL` to your domain. Then lock it down:

```bash
sudo chmod 600 /srv/xpredict/backend/.env && sudo chown xpredict:xpredict /srv/xpredict/backend/.env
```

**`prod.py` refuses to start if any of the four required values is missing or
still at its development default.** That check is the point: the secret key and
the MySQL password both have committed, public defaults that work silently.

## 10. Migrate and collect static

```bash
cd /srv/xpredict/backend && sudo -u xpredict ./.venv/bin/python manage.py migrate
```

```bash
cd /srv/xpredict/backend && sudo -u xpredict ./.venv/bin/python manage.py collectstatic --noinput
```

**`Applying … OK` does not mean tables were created.** Django prints it whether
it built them or the router refused every operation. Check:

```bash
sudo mysql -e "SELECT COUNT(*) AS tables_in_control FROM information_schema.tables WHERE table_schema='xpredict_control';"
```

Expect **23**. A much smaller number means the router refused the migration and
you have an empty database that reports success.

Then confirm the catalogue seeded (C44 — permissions are rows):

```bash
cd /srv/xpredict/backend && sudo -u xpredict ./.venv/bin/python manage.py shell -c "from core.permissions.models import Permission, Role; print(Permission.objects.count(), 'permissions,', Role.objects.count(), 'roles')"
```

Expect **48 permissions, 9 roles**.

## 11. The frontend

**Build it on your laptop, not on the box.** A Vite build wants more memory
than is comfortable here while MySQL is running, and building on the server
would mean installing Node and its toolchain on a machine that otherwise needs
neither.

On your machine:

```bash
npm run build -w web --prefix frontend
```

Then copy the output up (adjust the key and host):

```bash
scp -i your-key.pem -r frontend/apps/web/dist/* ubuntu@app.example.com:/tmp/frontend-dist/
```

On the box:

```bash
sudo mkdir -p /srv/xpredict/frontend && sudo cp -r /tmp/frontend-dist/* /srv/xpredict/frontend/ && sudo chown -R xpredict:xpredict /srv/xpredict/frontend
```

## 12. The services — and proving Celery actually works

```bash
sudo cp /srv/xpredict/deploy/xpredict-gunicorn.service /srv/xpredict/deploy/xpredict-celery.service /etc/systemd/system/ && sudo systemctl daemon-reload
```

```bash
sudo systemctl enable --now xpredict-gunicorn xpredict-celery && sudo systemctl status xpredict-gunicorn xpredict-celery --no-pager
```

Both `active (running)`. If Gunicorn exited immediately, read the reason —
`prod.py` names the missing variable:

```bash
sudo journalctl -u xpredict-gunicorn -n 40 --no-pager
```

**Now prove the broker round trip**, because nothing has ever exercised it:

```bash
cd /srv/xpredict/backend && sudo -u xpredict ./.venv/bin/python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.prod')
django.setup()
from config.celery import debug_task
r = debug_task.delay()
print('queued:', r.id)
print('result:', r.get(timeout=20))
"
```

A result means Django published to Redis, the worker received it and the
result came back. A timeout means the worker is not consuming — check
`journalctl -u xpredict-celery`. **Do not continue past this step on a
timeout:** signup would appear to succeed and the organisation would never get
a database.

## 13. Nginx and TLS

```bash
sudo cp /srv/xpredict/deploy/nginx-xpredict.conf /etc/nginx/sites-available/xpredict
```

```bash
sudo sed -i 's/app\.example\.com/YOUR_REAL_DOMAIN/g' /etc/nginx/sites-available/xpredict
```

```bash
sudo ln -sf /etc/nginx/sites-available/xpredict /etc/nginx/sites-enabled/xpredict && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx
```

Confirm DNS resolves to this instance before continuing:

```bash
dig +short YOUR_REAL_DOMAIN
```

```bash
sudo apt install -y certbot python3-certbot-nginx
```

```bash
sudo certbot --nginx -d YOUR_REAL_DOMAIN
```

Certbot edits the site file in place, adding the certificate directives and the
port-80 redirect. Renewal is installed as a systemd timer automatically:

```bash
systemctl list-timers certbot.timer --no-pager && sudo certbot renew --dry-run
```

> **If every request now redirects forever**, Nginx is not sending
> `X-Forwarded-Proto`. `prod.py` decides whether a request is secure from that
> header alone, so without it Django believes every request is plain HTTP and
> `SECURE_SSL_REDIRECT` sends it back to the URL it just received. The header is
> in the proxy blocks of the shipped config — check certbot did not disturb them.

## 14. Backups

```bash
sudo cp /srv/xpredict/deploy/backup-databases.sh /usr/local/bin/xpredict-backup && sudo chmod +x /usr/local/bin/xpredict-backup
```

```bash
sudo cp /srv/xpredict/deploy/xpredict-backup.service /srv/xpredict/deploy/xpredict-backup.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now xpredict-backup.timer
```

Run it once by hand rather than trusting the schedule:

```bash
sudo systemctl start xpredict-backup && sudo ls -lh /var/backups/xpredict/*/
```

You should see `xpredict_control.sql.gz` and a `MANIFEST`, plus one file per
organisation once any exist.

> **These backups sit on the same volume as the database.** That protects
> against a bad migration and nothing else — not instance failure, not a
> deleted volume. Shipping them to S3 is the next step and needs an IAM role
> and a bucket decision, so it is deliberately not scripted here.

## 15. First real use

Mint an activation code — signup is gated by one, single-use, and one code
founds one organisation (C14):

```bash
cd /srv/xpredict/backend && sudo -u xpredict ./.venv/bin/python manage.py mint_activation_codes --label "First production organisation"
```

Then, in a browser on your domain: sign up, and watch the workspace finish
provisioning. That exercises the whole chain — signup, the Celery task, a real
`CREATE DATABASE`, the tenant migration, and the launcher refusing to open an
app until the workspace is ready (C50).

Confirm the tenant database exists:

```bash
sudo mysql -e "SHOW DATABASES LIKE 'xpredict\\_%';"
```

---

## Deploying an update

```bash
cd /srv/xpredict && sudo -u xpredict git pull --ff-only
```

```bash
cd /srv/xpredict/backend && sudo -u xpredict ./.venv/bin/pip install -r requirements.lock.txt && sudo -u xpredict ./.venv/bin/python manage.py migrate && sudo -u xpredict ./.venv/bin/python manage.py collectstatic --noinput
```

```bash
sudo systemctl reload xpredict-gunicorn && sudo systemctl restart xpredict-celery
```

`reload` on Gunicorn finishes in-flight requests before swapping workers;
`restart` on Celery because a worker cannot reload its own code.

Rebuild and re-upload the frontend (step 11) when it changed.

> **`migrate` only touches the control database.** When a tenant app gains its
> first migration, every provisioned tenant database needs it too — and the
> command for that, `migrate_all_tenants`, **does not exist yet**. Until it
> does, a tenant-app migration cannot be deployed safely.

---

## When something is wrong

| Symptom | Cause |
|---|---|
| Gunicorn exits at once | A required variable is missing. `journalctl -u xpredict-gunicorn` names it. |
| Every request 400 | `DJANGO_ALLOWED_HOSTS` does not include the hostname being used. |
| Infinite redirect | Nginx is not sending `X-Forwarded-Proto`. |
| Sign-in appears to work, then you are signed out | No TLS, or `FRONTEND_BASE_URL` is `http://`. The auth cookie is `Secure`, so the browser silently discards it. |
| 502 from Nginx | Gunicorn is down, or `/run/xpredict/gunicorn.sock` is not readable by `www-data`. |
| "Show link" fails for an admin | `FRONTEND_BASE_URL` is empty. `invitation_link()` raises rather than building a relative URL (C56). |
| Signup succeeds, workspace never ready | The Celery worker is not consuming. Repair with `manage.py reprovision_tenant <slug>` (C50) once the worker is fixed. |
| 500 on login or signup | The cache is unreachable. DRF keeps throttle history in Redis, so an unreachable cache is a 500, not "no rate limiting". |
| MySQL dead, services flapping | Out of memory. Check `free -h` and that swap from step 2 is active. |

Logs:

```bash
sudo journalctl -u xpredict-gunicorn -u xpredict-celery -u nginx -u mysql --since "15 min ago" --no-pager
```

---

## What this deployment does not have

Stated plainly, because each is a real gap rather than an oversight:

- **No CI.** Seven gates are run by hand on a laptop. Nothing stops an
  untested commit being deployed.
- **No off-instance backups.** See step 14.
- **No monitoring or error reporting.** Nothing notices a stuck provision or a
  500 except somebody looking (Q33, Phase 7).
- **No staging environment.** This is the first and only deployment target.
- **No zero-downtime deploy.** `reload` is graceful for in-flight requests, but
  a migration that changes a column is applied while the old code is serving.
- **`migrate_all_tenants` does not exist**, so tenant-app migrations cannot be
  rolled out — see above.
