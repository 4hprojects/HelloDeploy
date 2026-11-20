FROM busybox:1.37
RUN --mount=type=secret,id=npm_token echo "token length: $(wc -c < /run/secrets/npm_token)" > /build-note
