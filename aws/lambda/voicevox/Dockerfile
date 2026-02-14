# Stage 1: fetch Lambda Web Adapter binary
FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 AS adapter

# Stage 2: VOICEVOX engine (CPU build)
# Pinned to a specific release for reproducibility.
# ubuntu20.04 is phased out; use ubuntu22.04 with a pinned version tag.
FROM voicevox/voicevox_engine:cpu-ubuntu22.04-0.25.1

# Place Lambda Web Adapter as a Lambda Extension.
# Binaries under /opt/extensions/ are automatically invoked by the Lambda runtime.
COPY --from=adapter /lambda-adapter /opt/extensions/lambda-adapter

# ----------------------------------------------------------------
# Lambda Web Adapter environment variables
#
# PORT                  : Port that VOICEVOX engine listens on
# ASYNC_INIT            : When true, marks Lambda as initialized without
#                         waiting for the app to finish starting up.
#                         Required for apps with long startup times.
# READINESS_CHECK_PATH  : HTTP path polled by Lambda Web Adapter to
#                         confirm the app is ready. Traffic is forwarded
#                         only after this path returns 200.
# ----------------------------------------------------------------
ENV PORT=50021
ENV ASYNC_INIT=true
ENV READINESS_CHECK_PATH=/version

# ----------------------------------------------------------------
# The base image default CMD is:
#   gosu user /opt/python/bin/python3 ./run.py --voicelib_dir ...
#
# Lambda containers run as root, so gosu cannot switch to "user"
# and crashes with "no matching entries in passwd file".
# We override CMD to skip gosu and run Python directly as root.
#
# However, packages such as uvicorn are installed under the "user"
# account's home directory (/home/user/.local/lib/pythonX.Y/site-packages).
# Setting HOME=/home/user makes Python resolve ~/.local to that path,
# so all user-installed packages remain visible when running as root.
# ----------------------------------------------------------------
ENV HOME=/home/user

# Lambda container image filesystem is read-only except for /tmp.
# VOICEVOX engine writes runtime data (dicts, user config) to
# ~/.local/share and ~/.cache via XDG base directory conventions.
# Redirect all XDG write paths to /tmp so they remain writable.
ENV XDG_DATA_HOME=/tmp/.local/share
ENV XDG_CACHE_HOME=/tmp/.cache
ENV XDG_CONFIG_HOME=/tmp/.config

EXPOSE 50021

WORKDIR /opt/voicevox_engine
CMD ["/opt/python/bin/python3", "./run.py", \
     "--voicelib_dir", "/opt/voicevox_core/", \
     "--runtime_dir", "/opt/onnxruntime/lib", \
     "--host", "0.0.0.0", \
     "--port", "50021"]
