# Hello Motion Acceptance Checklist

Use this per component and per application. Mark `N/A` with a reason.

## Correctness
- [ ] Animated state matches authoritative application state.
- [ ] Request pending, success, failure and retry states are distinct.
- [ ] Repeated clicks and interrupted animations cannot corrupt state.
- [ ] No route, record, form or authorization behavior has changed unexpectedly.
- [ ] All controls work with animation disabled or unsupported.

## Accessibility
- [ ] `prefers-reduced-motion` respected by CSS and JavaScript.
- [ ] Keyboard operation and focus order verified.
- [ ] Focus is restored after popover close or deletion where appropriate.
- [ ] Errors are available in text and associated with inputs.
- [ ] Status messages are conveyed without relying on color/motion.
- [ ] Small-screen, zoom, and touch interactions checked.

## Performance
- [ ] Baseline and post-change interaction performance recorded.
- [ ] Long lists and heavy screens tested on representative hardware.
- [ ] No significant jump, flicker or scroll shift at animation end.
- [ ] Reduced or disabled motion where performance is inadequate.

## Release
- [ ] Existing test suite run with results recorded.
- [ ] New tests added for state/failure/cancellation/reduced-motion.
- [ ] Feature flag or rollback strategy documented.
- [ ] Changed files and decision log updated.
- [ ] Production approval obtained if production enabling/deployment is in scope.
