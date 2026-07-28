# Caddy with the ConvergeKit routing config baked in.
#
# Coolify builds images from the cloned source but runs `docker compose up` from
# an application directory that holds only the compose file, so a relative bind
# mount of ./docker/coolify/Caddyfile resolves to a path that does not exist on
# the host — Docker then creates it as an empty directory and the mount onto
# /etc/caddy/Caddyfile fails. Copying the config into the image sidesteps that.
FROM caddy:2.8-alpine

COPY docker/coolify/Caddyfile /etc/caddy/Caddyfile

RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
