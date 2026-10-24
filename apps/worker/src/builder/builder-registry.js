let _controller = null;

/**
 * Share the builder controller (created at worker startup when builder control
 * is enabled) with the build job. Null means builder control is off.
 */
export function setBuilderController(controller) {
  _controller = controller;
}

export function getBuilderController() {
  return _controller;
}
