# Reverse proxy for the e2e stack. Terminates TLS for the frontend and API
# hostnames, like prod, so the auth cookie can be Secure and shared between
# them through the parent domain.
FROM nginx:1.29-alpine

RUN apk add --no-cache openssl

# scripts in /docker-entrypoint.d run before nginx starts
COPY gen-certs.sh /docker-entrypoint.d/05-gen-certs.sh
RUN chmod +x /docker-entrypoint.d/05-gen-certs.sh

COPY nginx.conf /etc/nginx/conf.d/default.conf
# the default notice level logs every worker start in the test output
RUN sed -i 's/^error_log\(.*\) notice;/error_log\1 warn;/' /etc/nginx/nginx.conf
