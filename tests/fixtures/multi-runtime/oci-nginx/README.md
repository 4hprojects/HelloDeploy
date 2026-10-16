# oci-nginx acceptance fixture

Deploys the digest-pinned public image named in `manifest.json` through the
`oci_image_v1` strategy. Nothing in this folder is built; the project only needs
an application root. The image runs as uid 101 on port 8080 and declares no
volumes, so it passes the owner-image policy.
