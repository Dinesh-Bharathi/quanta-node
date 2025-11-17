import express from "express";
import {
  getSubscriptionPlans,
  getPlanDetails,
  selectSubscriptionPlan,
  verifySubscriptionPayment,
  getCurrentSubscription,
} from "./subscription.controller.js";

const router = express.Router();

router.get("/plans", getSubscriptionPlans);
router.get("/plan/:planUuid", getPlanDetails);
router.post("/select/:tentUuid", selectSubscriptionPlan);
router.post("/payment/verify", verifySubscriptionPayment);
router.get("/current/:tentUuid", getCurrentSubscription);

export default router;
