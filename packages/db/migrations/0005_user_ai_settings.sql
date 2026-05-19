CREATE TABLE "user_ai_settings" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"           text NOT NULL UNIQUE,
  "provider"          text DEFAULT 'openrouter' NOT NULL,
  "encrypted_api_key" text,
  "created_at"        timestamp DEFAULT now() NOT NULL,
  "updated_at"        timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_ai_settings_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
