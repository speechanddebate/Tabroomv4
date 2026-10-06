#!/bin/sh
# Issues a throwaway CA and a server cert for the e2e hostnames into /certs.
# schemats trusts the CA (NODE_EXTRA_CA_CERTS) for its server-side API calls;
# the browsers ignore HTTPS errors instead.
set -eu

dir=/certs
mkdir -p "$dir"
cd "$dir"

openssl req -quiet -x509 -newkey rsa:2048 -nodes -days 1 \
	-keyout ca.key -out ca.crt \
	-subj "/CN=Tabroom e2e CA"

openssl req -quiet -newkey rsa:2048 -nodes \
	-keyout server.key -out server.csr \
	-subj "/CN=e2e.tabroom.test"

cat > server.ext <<EOF
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:e2e.tabroom.test, DNS:api.e2e.tabroom.test
EOF

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
	-days 1 -out server.crt -extfile server.ext

chmod 644 ca.crt server.crt
