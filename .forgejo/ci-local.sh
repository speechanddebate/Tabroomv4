#!/usr/bin/env bash
# Run the CI workflow locally with forgejo-runner, pulled as a docker image.
#
#   .forgejo/ci-local.sh              # every job
#   .forgejo/ci-local.sh -j lint      # one job (any forgejo-runner exec flag works)
#   .forgejo/ci-local.sh -l           # list jobs
#
# Runs as a pull_request event, so the build and notify jobs (push to main only) are
# skipped and nothing gets published.
#
# RUNNER_VERSION: forgejo-runner image tag
# JOB_IMAGE: image that ubuntu-latest jobs run in (jobs with their own container ignore it)
set -euo pipefail

RUNNER_VERSION="${RUNNER_VERSION:-13.2.0}"
# same image the org runner maps ubuntu-latest to (deathstar runner-config.yml.j2)
JOB_IMAGE="${JOB_IMAGE:-registry.speechanddebate.org/forgejo/runner/ubuntu-24.04:latest}"

repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# The repo is mounted at the same path so paths the runner hands to the docker daemon resolve on the host.
# Runs as the host user (plus the docker socket's group) because git refuses repos owned by someone else.
# --env-file /dev/null keeps the local .env out of the job containers.
exec docker run --rm $([ -t 0 ] && echo -it) \
	-v /var/run/docker.sock:/var/run/docker.sock \
	-v "$repo:$repo" \
	-w "$repo" \
	--user "$(id -u):$(id -g)" \
	--group-add "$(stat -c %g /var/run/docker.sock)" \
	-e HOME=/tmp \
	"code.forgejo.org/forgejo/runner:$RUNNER_VERSION" \
	forgejo-runner exec \
		-W .forgejo/workflows/ci.yml \
		-E pull_request \
		-i "$JOB_IMAGE" \
		--forgejo-instance https://git.speechanddebate.org \
		--env-file /dev/null \
		"$@"
