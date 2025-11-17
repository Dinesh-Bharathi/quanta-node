import {
  getActivePlansRepo,
  getPlanDetailsRepo,
  createTenantSubscriptionRepo,
  updateSubscriptionPaymentRepo,
  getTenantActiveSubscriptionRepo,
} from "./subscription.repository.js";

export const getActivePlansService = () => getActivePlansRepo();

export const getPlanDetailsService = (planUuid) => getPlanDetailsRepo(planUuid);

export const createTenantSubscriptionService = (data) =>
  createTenantSubscriptionRepo(data);

export const verifyPaymentService = (subscriptionUuid, status) =>
  updateSubscriptionPaymentRepo(subscriptionUuid, status);

export const getActiveSubscriptionService = (tentUuid) =>
  getTenantActiveSubscriptionRepo(tentUuid);
