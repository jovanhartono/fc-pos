-- The id counter kept its name when order_services_images became item_images.
ALTER SEQUENCE IF EXISTS "order_services_images_id_seq" RENAME TO "item_images_id_seq";
