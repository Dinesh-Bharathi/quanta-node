import { sanitizeResponse } from "../../utils/sanitizeResponse.js";
import {
  getActivePlansService,
  getPlanDetailsService,
  createTenantSubscriptionService,
  verifyPaymentService,
  getActiveSubscriptionService,
} from "./subscription.service.js";

export const getSubscriptionPlans = async (req, res) => {
  try {
    const plans = await getActivePlansService();
    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPlanDetails = async (req, res) => {
  try {
    const { planUuid } = req.params;
    const plan = await getPlanDetailsService(planUuid);

    if (!plan)
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });

    res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error("Error fetching plan details:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const selectSubscriptionPlan = async (req, res) => {
  try {
    const { tentUuid } = req.params;
    const { planUuid, isTrial, paymentStatus, isAutoRenew } = req.body;

    const subscription = await createTenantSubscriptionService({
      tentUuid,
      planUuid,
      isTrial,
      paymentStatus,
      isAutoRenew,
    });

    res.status(201).json({
      success: true,
      message: "Subscription initialized successfully",
      data: subscription,
    });
  } catch (error) {
    console.error("Subscription creation error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const verifySubscriptionPayment = async (req, res) => {
  try {
    const { subscriptionUuid, paymentStatus } = req.body;
    const updated = await verifyPaymentService(subscriptionUuid, paymentStatus);

    res.status(200).json({
      success: true,
      message: "Payment status updated",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCurrentSubscription = async (req, res) => {
  try {
    const { tentUuid } = req.params;
    const subscription = await getActiveSubscriptionService(tentUuid);

    if (!subscription)
      return res.status(404).json({
        success: false,
        message: "No active subscription found",
      });

    res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
