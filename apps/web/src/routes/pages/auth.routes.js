import { Router } from 'express';
import * as authCtrl from '../../controllers/auth.controller.js';
import {
  registrationLimiter,
  signInLimiter,
  resendVerificationLimiter,
  passwordResetLimiter,
} from '../../middleware/rate-limit.js';

const router = Router();

// Create Account
router.get('/create-account', authCtrl.getCreateAccount);
router.post('/create-account', registrationLimiter, authCtrl.postCreateAccount);

// Email Verification
router.get('/verify-email', authCtrl.getVerifyEmail);
router.post('/verify-email/resend', resendVerificationLimiter, authCtrl.postResendVerification);

// Sign In / Sign Out
router.get('/sign-in', authCtrl.getSignIn);
router.post('/sign-in', signInLimiter, authCtrl.postSignIn);
router.post('/sign-out', authCtrl.postSignOut);

// Password Recovery (3 steps)
router.get('/forgot-password', authCtrl.getForgotPassword);
router.post('/forgot-password', passwordResetLimiter, authCtrl.postForgotPassword);
router.get('/verify-reset-code', authCtrl.getVerifyResetCode);
router.post('/verify-reset-code', authCtrl.postVerifyResetCode);
router.get('/new-password', authCtrl.getNewPassword);
router.post('/new-password', authCtrl.postNewPassword);

export default router;
