-- Current application schema through migration 0007. Django migrations remain authoritative.
BEGIN;
CREATE TABLE "donations_accountreview" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "action" varchar(12) NOT NULL, "reason" varchar(500) NOT NULL, "created_at" datetime NOT NULL, "account_id" bigint NOT NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, "administrator_id" bigint NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_activity" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "message" varchar(500) NOT NULL, "severity" varchar(20) NOT NULL, "resolved" bool NOT NULL, "created_at" datetime NOT NULL);

CREATE TABLE "donations_campaign" ("id" varchar(40) NOT NULL PRIMARY KEY, "title" varchar(100) NOT NULL, "category" varchar(30) NOT NULL, "description" text NOT NULL, "need" decimal NOT NULL, "raised" decimal NOT NULL, "location" varchar(100) NOT NULL, "beneficiaries" varchar(200) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "urgency" varchar(10) NOT NULL, "image" text NOT NULL, "status" varchar(20) NOT NULL, "review_note" varchar(500) NOT NULL, "created_at" datetime NOT NULL, "reviewed_by_id" bigint NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, "organization_id" bigint NOT NULL REFERENCES "donations_organization" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "campaign_positive_target" CHECK ("need" >= '1'), CONSTRAINT "campaign_nonnegative_raised" CHECK ("raised" >= '0'), CONSTRAINT "campaign_valid_dates" CHECK ("end_date" >= ("start_date")));

CREATE TABLE "donations_campaigndocument" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "name" varchar(200) NOT NULL, "mime_type" varchar(50) NOT NULL, "data" text NOT NULL, "campaign_id" varchar(40) NOT NULL UNIQUE REFERENCES "donations_campaign" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_contactmessage" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "name" varchar(100) NOT NULL, "email" varchar(254) NOT NULL, "subject" varchar(100) NOT NULL, "message" varchar(2000) NOT NULL, "created_at" datetime NOT NULL);

CREATE TABLE "donations_donation" ("id" varchar(40) NOT NULL PRIMARY KEY, "transaction_id" varchar(100) NOT NULL, "amount" decimal NOT NULL, "anonymous" bool NOT NULL, "message" varchar(500) NOT NULL, "created_at" datetime NOT NULL, "campaign_id" varchar(40) NOT NULL REFERENCES "donations_campaign" ("id") DEFERRABLE INITIALLY DEFERRED, "donor_id" bigint NOT NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "unique_donor_transaction" UNIQUE ("donor_id", "transaction_id"), CONSTRAINT "donation_valid_amount" CHECK (("amount" >= '1' AND "amount" <= '10000000')));

CREATE TABLE "donations_donationmatch" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "quantity" decimal NOT NULL, "status" varchar(20) NOT NULL, "pickup_at" datetime NULL, "pickup_address" varchar(300) NOT NULL, "pickup_city" varchar(100) NOT NULL, "pickup_state" varchar(100) NOT NULL, "pickup_pincode" varchar(6) NOT NULL, "pickup_notes" varchar(1000) NOT NULL, "version" integer unsigned NOT NULL CHECK ("version" >= 0), "completed_at" datetime NULL, "created_at" datetime NOT NULL, "request_id" bigint NOT NULL REFERENCES "donations_itemrequest" ("id") DEFERRABLE INITIALLY DEFERRED, "donation_id" bigint NOT NULL REFERENCES "donations_itemdonation" ("id") DEFERRABLE INITIALLY DEFERRED, "delivery_note" varchar(1000) NOT NULL, "delivery_proof" text NOT NULL, CONSTRAINT "match_valid_quantity" CHECK (("quantity" > '0' AND "quantity" <= '1000000')));

CREATE TABLE "donations_itemdonation" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "client_id" char(32) NOT NULL, "item_key" varchar(50) NOT NULL, "quantity" decimal NOT NULL, "city" varchar(100) NOT NULL, "notes" varchar(2000) NOT NULL, "image" text NOT NULL, "created_at" datetime NOT NULL, "donor_id" bigint NOT NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, "address" varchar(300) NOT NULL, "pincode" varchar(6) NOT NULL, "state" varchar(100) NOT NULL, "version" integer unsigned NOT NULL CHECK ("version" >= 0), CONSTRAINT "unique_item_donation_submission" UNIQUE ("donor_id", "client_id"), CONSTRAINT "item_donation_valid_quantity" CHECK (("quantity" > '0' AND "quantity" <= '1000000')));

CREATE TABLE "donations_itemrequest" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "title" varchar(120) NOT NULL, "delivery_address" varchar(300) NOT NULL, "delivery_city" varchar(100) NOT NULL, "delivery_state" varchar(100) NOT NULL, "delivery_pincode" varchar(6) NOT NULL, "notes" varchar(2000) NOT NULL, "needed_by" date NULL, "status" varchar(10) NOT NULL, "version" integer unsigned NOT NULL CHECK ("version" >= 0), "created_at" datetime NOT NULL, "updated_at" datetime NOT NULL, "organization_id" bigint NOT NULL REFERENCES "donations_organization" ("id") DEFERRABLE INITIALLY DEFERRED, "priority" varchar(10) NOT NULL, "contact_phone" varchar(20) NOT NULL);

CREATE TABLE "donations_itemrequestline" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "item_key" varchar(50) NOT NULL, "quantity" decimal NOT NULL, "request_id" bigint NOT NULL REFERENCES "donations_itemrequest" ("id") DEFERRABLE INITIALLY DEFERRED, "fulfilled_quantity" decimal NOT NULL, CONSTRAINT "unique_item_per_request" UNIQUE ("request_id", "item_key"), CONSTRAINT "item_request_valid_quantity" CHECK (("quantity" > '0' AND "quantity" <= '1000000')), CONSTRAINT "item_request_valid_fulfilled" CHECK (("fulfilled_quantity" >= '0' AND "fulfilled_quantity" <= ("quantity"))));

CREATE TABLE "donations_loginevent" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "email" varchar(254) NOT NULL, "role" varchar(10) NOT NULL, "successful" bool NOT NULL, "created_at" datetime NOT NULL, "user_id" bigint NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_matchevent" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "title" varchar(120) NOT NULL, "message" varchar(500) NOT NULL, "created_at" datetime NOT NULL, "actor_id" bigint NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, "match_id" bigint NOT NULL REFERENCES "donations_donationmatch" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_notification" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "title" varchar(120) NOT NULL, "message" varchar(500) NOT NULL, "link" varchar(200) NOT NULL, "read" bool NOT NULL, "created_at" datetime NOT NULL, "user_id" bigint NOT NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_organization" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "name" varchar(200) NOT NULL, "registration_number" varchar(100) NOT NULL UNIQUE, "description" text NOT NULL, "website" varchar(200) NOT NULL, "category" varchar(30) NOT NULL, "status" varchar(15) NOT NULL, "review_note" varchar(500) NOT NULL, "reviewed_at" datetime NULL, "created_at" datetime NOT NULL, "reviewed_by_id" bigint NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, "user_id" bigint NOT NULL UNIQUE REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_preference" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "compact" bool NOT NULL, "default_amount" decimal NOT NULL, "default_category" varchar(30) NOT NULL, "show_resolved" bool NOT NULL, "user_id" bigint NOT NULL UNIQUE REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_savedcampaign" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "campaign_id" varchar(40) NOT NULL REFERENCES "donations_campaign" ("id") DEFERRABLE INITIALLY DEFERRED, "donor_id" bigint NOT NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "unique_saved_campaign" UNIQUE ("donor_id", "campaign_id"));

CREATE TABLE "donations_user" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "password" varchar(128) NOT NULL, "last_login" datetime NULL, "is_superuser" bool NOT NULL, "first_name" varchar(150) NOT NULL, "last_name" varchar(150) NOT NULL, "is_staff" bool NOT NULL, "is_active" bool NOT NULL, "date_joined" datetime NOT NULL, "email" varchar(254) NOT NULL UNIQUE, "role" varchar(10) NOT NULL, "phone" varchar(20) NOT NULL, "address" varchar(300) NOT NULL, "city" varchar(100) NOT NULL, "state" varchar(100) NOT NULL, "pincode" varchar(6) NOT NULL, "interests" text NOT NULL CHECK ((JSON_VALID("interests") OR "interests" IS NULL)), "terms_accepted_at" datetime NULL, "access_version" integer unsigned NOT NULL CHECK ("access_version" >= 0), "approval_note" varchar(500) NOT NULL, "approval_status" varchar(10) NOT NULL, "reviewed_at" datetime NULL, "reviewed_by_id" bigint NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_user_groups" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "user_id" bigint NOT NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, "group_id" integer NOT NULL REFERENCES "auth_group" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE "donations_user_user_permissions" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "user_id" bigint NOT NULL REFERENCES "donations_user" ("id") DEFERRABLE INITIALLY DEFERRED, "permission_id" integer NOT NULL REFERENCES "auth_permission" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE INDEX "donations_accountreview_account_id_96af7e22" ON "donations_accountreview" ("account_id");

CREATE INDEX "donations_accountreview_administrator_id_09eafa34" ON "donations_accountreview" ("administrator_id");

CREATE INDEX "donations_campaign_organization_id_0e5be0b5" ON "donations_campaign" ("organization_id");

CREATE INDEX "donations_campaign_reviewed_by_id_07499649" ON "donations_campaign" ("reviewed_by_id");

CREATE INDEX "donations_donation_campaign_id_6ee594d5" ON "donations_donation" ("campaign_id");

CREATE INDEX "donations_donation_donor_id_25b1f2bc" ON "donations_donation" ("donor_id");

CREATE INDEX "donations_donationmatch_donation_id_8e81e93b" ON "donations_donationmatch" ("donation_id");

CREATE INDEX "donations_donationmatch_request_id_821d3df2" ON "donations_donationmatch" ("request_id");

CREATE INDEX "donations_itemdonation_donor_id_7953da53" ON "donations_itemdonation" ("donor_id");

CREATE INDEX "donations_itemrequest_organization_id_f5d2ff38" ON "donations_itemrequest" ("organization_id");

CREATE INDEX "donations_itemrequestline_request_id_5a228d7a" ON "donations_itemrequestline" ("request_id");

CREATE INDEX "donations_loginevent_user_id_4454cac7" ON "donations_loginevent" ("user_id");

CREATE INDEX "donations_matchevent_actor_id_55b3f025" ON "donations_matchevent" ("actor_id");

CREATE INDEX "donations_matchevent_match_id_cc247730" ON "donations_matchevent" ("match_id");

CREATE INDEX "donations_notification_user_id_1cae4500" ON "donations_notification" ("user_id");

CREATE INDEX "donations_organization_reviewed_by_id_014174e0" ON "donations_organization" ("reviewed_by_id");

CREATE INDEX "donations_savedcampaign_campaign_id_7ac112b9" ON "donations_savedcampaign" ("campaign_id");

CREATE INDEX "donations_savedcampaign_donor_id_f5f9a857" ON "donations_savedcampaign" ("donor_id");

CREATE INDEX "donations_user_groups_group_id_35a1bc2b" ON "donations_user_groups" ("group_id");

CREATE INDEX "donations_user_groups_user_id_64006663" ON "donations_user_groups" ("user_id");

CREATE UNIQUE INDEX "donations_user_groups_user_id_group_id_e137d843_uniq" ON "donations_user_groups" ("user_id", "group_id");

CREATE INDEX "donations_user_reviewed_by_id_b953106d" ON "donations_user" ("reviewed_by_id");

CREATE INDEX "donations_user_user_permissions_permission_id_8b53b2f7" ON "donations_user_user_permissions" ("permission_id");

CREATE INDEX "donations_user_user_permissions_user_id_c6701187" ON "donations_user_user_permissions" ("user_id");

CREATE UNIQUE INDEX "donations_user_user_permissions_user_id_permission_id_220eab16_uniq" ON "donations_user_user_permissions" ("user_id", "permission_id");
COMMIT;
