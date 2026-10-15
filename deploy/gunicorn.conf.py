"""
Gunicorn configuration for Xpredict One.

Loaded by `deploy/xpredict-gunicorn.service`.

SIZED FOR A t3a.small: 2 vCPU, 2 GiB RAM, with MySQL, Redis, a Celery worker
and Nginx on the same box. That constraint decides almost everything here.
"""

import multiprocessing

# A UNIX SOCKET, NOT A PORT. Nginx is the only thing that should be able to
# reach Gunicorn, and a socket in a directory only `xpredict` and `www-data`
# can enter says so in the filesystem rather than relying on a firewall rule
# being right. It also cannot be reached from outside the box by accident --
# the security group allows 80 and 443, but a bound TCP port is one
# misconfiguration away from being public.
bind = "unix:/run/xpredict/gunicorn.sock"

# THREE WORKERS, NOT THE USUAL (2 x CPU) + 1 = 5.
#
# The formula assumes the box is doing nothing else. Here MySQL wants roughly
# 700 MB once the InnoDB buffer pool is tuned, Redis and Nginx take about 100
# MB between them, and the Celery worker another 150 MB. Each Django worker is
# 150-200 MB resident. Five workers would be ~1 GB of Django on a 2 GiB box
# and the thing that gets OOM-killed is MySQL -- which takes every tenant
# database down with it, and which systemd will restart into the same squeeze.
#
# Three leaves headroom. If requests queue, the answer is a bigger instance,
# not more workers: this is a memory limit, not a CPU one.
workers = 3

# Sync workers, deliberately. Django is sync here -- DRF views, no ASGI, no
# websockets, no long-polling. The provisioning poll is the only repeated
# request and it answers immediately from the control database.
worker_class = "sync"

# RESTART WORKERS PERIODICALLY. A slow leak in any dependency becomes a
# gradual OOM on a box this size; recycling bounds it. The jitter stops all
# three restarting on the same request.
max_requests = 1000
max_requests_jitter = 100

# Longer than the slowest thing a request can legitimately do, shorter than a
# user's patience. Nothing here should take 30s: provisioning is a Celery task
# precisely so signup does not wait on `CREATE DATABASE` plus a migrate.
timeout = 30

# Keep-alive to Nginx only, so this can be short.
keepalive = 5

# systemd captures stdout/stderr into the journal, so log there and let
# `journalctl -u xpredict-gunicorn` be the one place to look.
accesslog = "-"
errorlog = "-"
loglevel = "info"

# The default access log says nothing about who or how long. `%(D)s` is
# microseconds, which is what tells you whether a slow page is Django or the
# database.
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(D)sus "%(f)s" "%(a)s"'

# Name the processes so `ps` and `top` are readable on a box running four
# different Python services.
proc_name = "xpredict-gunicorn"

# Belt and braces: this should match the vCPU count of the instance, and is
# only here so that resizing the instance does not silently leave the comment
# above wrong.
_cpu_count = multiprocessing.cpu_count()
