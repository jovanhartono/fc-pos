import { defineRelations } from "drizzle-orm";
// biome-ignore lint/performance/noNamespaceImport: for drizzle only
import * as schema from "@/db/schema";

export const relations = defineRelations(schema, (r) => ({
  usersTable: {
    campaignCreatedBy: r.many.campaignsTable({
      from: r.usersTable.id,
      to: r.campaignsTable.created_by,
      alias: "campaign_created_by",
    }),
    campaignUpdatedBy: r.many.campaignsTable({
      from: r.usersTable.id,
      to: r.campaignsTable.updated_by,
      alias: "campaign_updated_by",
    }),
    orderRefunds: r.many.orderRefundsTable(),
    orderServiceHandlerLogsChangedBy: r.many.orderServiceHandlerLogsTable({
      from: r.usersTable.id,
      to: r.orderServiceHandlerLogsTable.changed_by,
      alias: "order_service_handler_changed_by",
    }),
    orderServiceHandlerLogsFrom: r.many.orderServiceHandlerLogsTable({
      from: r.usersTable.id,
      to: r.orderServiceHandlerLogsTable.from_handler_id,
      alias: "order_service_handler_from",
    }),
    orderServiceHandlerLogsTo: r.many.orderServiceHandlerLogsTable({
      from: r.usersTable.id,
      to: r.orderServiceHandlerLogsTable.to_handler_id,
      alias: "order_service_handler_to",
    }),
    complaintsOpened: r.many.complaintsTable({
      from: r.usersTable.id,
      to: r.complaintsTable.opened_by,
      alias: "complaint_opened_by",
    }),
    orderServiceStatusLogs: r.many.orderServiceStatusLogsTable(),
    orderServices: r.many.ordersServicesTable(),
    orderServiceUploadedPhotos: r.many.orderServicesImagesTable(),
    orders: r.many.ordersTable({
      from: r.usersTable.id,
      to: r.ordersTable.created_by,
    }),
    pickupEventsPickedUp: r.many.orderPickupEventsTable(),
    shifts: r.many.shiftsTable(),
    userStores: r.many.userStoresTable(),
  },

  storesTable: {
    campaignStores: r.many.campaignStoresTable(),
    customers: r.many.customersTable(),
    orders: r.many.ordersTable(),
    shifts: r.many.shiftsTable(),
    userStores: r.many.userStoresTable(),
  },

  customersTable: {
    createdBy: r.one.usersTable({
      from: r.customersTable.created_by,
      to: r.usersTable.id,
      optional: false,
    }),
    orders: r.many.ordersTable(),
    originStore: r.one.storesTable({
      from: r.customersTable.origin_store_id,
      to: r.storesTable.id,
      optional: false,
    }),
    updatedBy: r.one.usersTable({
      from: r.customersTable.updated_by,
      to: r.usersTable.id,
      optional: false,
    }),
  },

  productsTable: {
    category: r.one.categoriesTable({
      from: r.productsTable.category_id,
      to: r.categoriesTable.id,
      optional: false,
    }),
    orderProducts: r.many.ordersProductsTable(),
  },

  servicesTable: {
    campaignEligibilities: r.many.campaignEligibleServicesTable(),
    category: r.one.categoriesTable({
      from: r.servicesTable.category_id,
      to: r.categoriesTable.id,
      optional: false,
    }),
    orders: r.many.ordersServicesTable(),
  },

  paymentMethodsTable: {
    orders: r.many.ordersTable(),
  },

  campaignsTable: {
    codes: r.many.campaignCodesTable(),
    createdBy: r.one.usersTable({
      from: r.campaignsTable.created_by,
      to: r.usersTable.id,
      alias: "campaign_created_by",
      optional: false,
    }),
    eligibleServices: r.many.campaignEligibleServicesTable(),
    orderCampaigns: r.many.orderCampaignsTable(),
    stores: r.many.campaignStoresTable(),
    updatedBy: r.one.usersTable({
      from: r.campaignsTable.updated_by,
      to: r.usersTable.id,
      alias: "campaign_updated_by",
      optional: false,
    }),
  },

  campaignStoresTable: {
    campaign: r.one.campaignsTable({
      from: r.campaignStoresTable.campaign_id,
      to: r.campaignsTable.id,
      optional: false,
    }),
    store: r.one.storesTable({
      from: r.campaignStoresTable.store_id,
      to: r.storesTable.id,
      optional: false,
    }),
  },

  campaignEligibleServicesTable: {
    campaign: r.one.campaignsTable({
      from: r.campaignEligibleServicesTable.campaign_id,
      to: r.campaignsTable.id,
      optional: false,
    }),
    service: r.one.servicesTable({
      from: r.campaignEligibleServicesTable.service_id,
      to: r.servicesTable.id,
      optional: false,
    }),
  },

  campaignCodesTable: {
    campaign: r.one.campaignsTable({
      from: r.campaignCodesTable.campaign_id,
      to: r.campaignsTable.id,
      optional: false,
    }),
    redeemedOrder: r.one.ordersTable({
      from: r.campaignCodesTable.redeemed_order_id,
      to: r.ordersTable.id,
    }),
  },

  userStoresTable: {
    store: r.one.storesTable({
      from: r.userStoresTable.store_id,
      to: r.storesTable.id,
      optional: false,
    }),
    user: r.one.usersTable({
      from: r.userStoresTable.user_id,
      to: r.usersTable.id,
      optional: false,
    }),
  },

  ordersTable: {
    campaigns: r.many.orderCampaignsTable(),
    collectedBy: r.one.usersTable({
      from: r.ordersTable.collected_by,
      to: r.usersTable.id,
    }),
    createdBy: r.one.usersTable({
      from: r.ordersTable.created_by,
      to: r.usersTable.id,
      optional: false,
    }),
    customer: r.one.customersTable({
      from: r.ordersTable.customer_id,
      to: r.customersTable.id,
      optional: false,
    }),
    paidBy: r.one.usersTable({
      from: r.ordersTable.paid_by,
      to: r.usersTable.id,
    }),
    paymentMethod: r.one.paymentMethodsTable({
      from: r.ordersTable.payment_method_id,
      to: r.paymentMethodsTable.id,
    }),
    pickupEvents: r.many.orderPickupEventsTable(),
    refunds: r.many.orderRefundsTable(),
    products: r.many.ordersProductsTable(),
    services: r.many.ordersServicesTable(),
    store: r.one.storesTable({
      from: r.ordersTable.store_id,
      to: r.storesTable.id,
      optional: false,
    }),
    updatedBy: r.one.usersTable({
      from: r.ordersTable.updated_by,
      to: r.usersTable.id,
      optional: false,
    }),
  },

  ordersServicesTable: {
    // Complaints opened against this line (it is the complained line).
    complaints: r.many.complaintsTable({
      from: r.ordersServicesTable.id,
      to: r.complaintsTable.order_service_id,
      alias: "complaint_subject_service",
    }),
    // When this line is a rework, the complaint that spawned it.
    reworkOf: r.one.complaintsTable({
      from: r.ordersServicesTable.complaint_id,
      to: r.complaintsTable.id,
      alias: "complaint_rework_lines",
    }),
    handlerLogs: r.many.orderServiceHandlerLogsTable(),
    handler: r.one.usersTable({
      from: r.ordersServicesTable.handler_id,
      to: r.usersTable.id,
    }),
    images: r.many.orderServicesImagesTable(),
    order: r.one.ordersTable({
      from: r.ordersServicesTable.order_id,
      to: r.ordersTable.id,
    }),
    pickupEvent: r.one.orderPickupEventsTable({
      from: r.ordersServicesTable.pickup_event_id,
      to: r.orderPickupEventsTable.id,
    }),
    service: r.one.servicesTable({
      from: r.ordersServicesTable.service_id,
      to: r.servicesTable.id,
    }),
    statusLogs: r.many.orderServiceStatusLogsTable(),
    refundItems: r.many.orderRefundItemsTable(),
  },

  complaintsTable: {
    // The original complained line.
    orderService: r.one.ordersServicesTable({
      from: r.complaintsTable.order_service_id,
      to: r.ordersServicesTable.id,
      alias: "complaint_subject_service",
      optional: false,
    }),
    // Free rework lines spawned by this complaint (via orders_services.complaint_id).
    reworkLines: r.many.ordersServicesTable({
      from: r.complaintsTable.id,
      to: r.ordersServicesTable.complaint_id,
      alias: "complaint_rework_lines",
    }),
    openedBy: r.one.usersTable({
      from: r.complaintsTable.opened_by,
      to: r.usersTable.id,
      alias: "complaint_opened_by",
      optional: false,
    }),
  },

  orderPickupEventsTable: {
    order: r.one.ordersTable({
      from: r.orderPickupEventsTable.order_id,
      to: r.ordersTable.id,
      optional: false,
    }),
    pickedUpBy: r.one.usersTable({
      from: r.orderPickupEventsTable.picked_up_by,
      to: r.usersTable.id,
      optional: false,
    }),
    services: r.many.ordersServicesTable(),
  },

  orderServicesImagesTable: {
    orderService: r.one.ordersServicesTable({
      from: r.orderServicesImagesTable.order_service_id,
      to: r.ordersServicesTable.id,
    }),
    uploadedBy: r.one.usersTable({
      from: r.orderServicesImagesTable.uploaded_by,
      to: r.usersTable.id,
    }),
  },

  orderServiceStatusLogsTable: {
    changedBy: r.one.usersTable({
      from: r.orderServiceStatusLogsTable.changed_by,
      to: r.usersTable.id,
      optional: false,
    }),
    orderService: r.one.ordersServicesTable({
      from: r.orderServiceStatusLogsTable.order_service_id,
      to: r.ordersServicesTable.id,
      optional: false,
    }),
  },

  orderServiceHandlerLogsTable: {
    changedBy: r.one.usersTable({
      from: r.orderServiceHandlerLogsTable.changed_by,
      to: r.usersTable.id,
      alias: "order_service_handler_changed_by",
      optional: false,
    }),
    fromHandler: r.one.usersTable({
      from: r.orderServiceHandlerLogsTable.from_handler_id,
      to: r.usersTable.id,
      alias: "order_service_handler_from",
    }),
    orderService: r.one.ordersServicesTable({
      from: r.orderServiceHandlerLogsTable.order_service_id,
      to: r.ordersServicesTable.id,
      optional: false,
    }),
    toHandler: r.one.usersTable({
      from: r.orderServiceHandlerLogsTable.to_handler_id,
      to: r.usersTable.id,
      alias: "order_service_handler_to",
    }),
  },

  orderRefundsTable: {
    items: r.many.orderRefundItemsTable(),
    order: r.one.ordersTable({
      from: r.orderRefundsTable.order_id,
      to: r.ordersTable.id,
      optional: false,
    }),
    refundedBy: r.one.usersTable({
      from: r.orderRefundsTable.refunded_by,
      to: r.usersTable.id,
      optional: false,
    }),
  },

  orderRefundItemsTable: {
    orderRefund: r.one.orderRefundsTable({
      from: r.orderRefundItemsTable.order_refund_id,
      to: r.orderRefundsTable.id,
      optional: false,
    }),
    orderProduct: r.one.ordersProductsTable({
      from: r.orderRefundItemsTable.order_product_id,
      to: r.ordersProductsTable.id,
    }),
    orderService: r.one.ordersServicesTable({
      from: r.orderRefundItemsTable.order_service_id,
      to: r.ordersServicesTable.id,
    }),
  },

  ordersProductsTable: {
    order: r.one.ordersTable({
      from: r.ordersProductsTable.order_id,
      to: r.ordersTable.id,
    }),
    product: r.one.productsTable({
      from: r.ordersProductsTable.product_id,
      to: r.productsTable.id,
    }),
    refundItems: r.many.orderRefundItemsTable(),
  },

  orderCampaignsTable: {
    campaign: r.one.campaignsTable({
      from: r.orderCampaignsTable.campaign_id,
      to: r.campaignsTable.id,
      optional: false,
    }),
    code: r.one.campaignCodesTable({
      from: r.orderCampaignsTable.code_id,
      to: r.campaignCodesTable.id,
    }),
    order: r.one.ordersTable({
      from: r.orderCampaignsTable.order_id,
      to: r.ordersTable.id,
      optional: false,
    }),
  },

  shiftsTable: {
    store: r.one.storesTable({
      from: r.shiftsTable.store_id,
      to: r.storesTable.id,
      optional: false,
    }),
    user: r.one.usersTable({
      from: r.shiftsTable.user_id,
      to: r.usersTable.id,
      optional: false,
    }),
  },
}));
